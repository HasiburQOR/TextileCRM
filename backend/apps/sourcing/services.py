"""
Sourcing approval state machine (DRF Migration Instructions §3, Phase 2:
"implement as an explicit state machine ... not ad-hoc status string
updates scattered across views"). Every transition is a function here;
viewsets call these, never mutate `.status` directly.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.expenses.models import SourceType
from apps.expenses.services import record_expense
from apps.sourcing.models import (
    LocationEntryStatus,
    Product,
    ProductStatus,
    ProductVariant,
    SourcingLocationEntry,
    SourcingTrip,
    TripStatus,
)


def _dec(value) -> Decimal:
    return Decimal(str(value or 0))


def _round4(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def compute_variant_derived(variant: ProductVariant) -> None:
    """Mirrors apps.packing.services.compute_carton_derived — every color
    row here carries the same packing-detail shape as a PackingCarton, so
    the calc must match exactly (Module Documentation Pack §4)."""
    from apps.packing.models import CUBIC_INCHES_PER_CBM

    variant.pcsPerCarton = sum(int(v) for v in (variant.sizeBreakdown or {}).values())

    if variant.cartonNoTo is not None and variant.cartonNoFrom is not None and variant.cartonNoTo >= variant.cartonNoFrom:
        variant.noOfCartons = variant.cartonNoTo - variant.cartonNoFrom + 1
    else:
        variant.noOfCartons = 0

    variant.totalPcs = variant.pcsPerCarton * variant.noOfCartons
    variant.totalGrossWeight = _dec(variant.grossWeight) * variant.noOfCartons
    variant.totalNetWeight = _dec(variant.netWeight) * variant.noOfCartons

    cubic_inches = _dec(variant.ctnLength) * _dec(variant.ctnWidth) * _dec(variant.ctnHeight)
    per_carton_cbm = cubic_inches / Decimal(str(CUBIC_INCHES_PER_CBM)) if cubic_inches else Decimal("0")
    variant.cbm = _round4(per_carton_cbm)
    variant.totalCbm = _round4(per_carton_cbm * variant.noOfCartons)


@transaction.atomic
def report_location(location: SourcingLocationEntry, actor) -> SourcingLocationEntry:
    """FR-72: the advance paid at a location is a "sourcing advance" cost
    and must land in the Central Expense Table — recorded the moment the
    location is confirmed/reported, matching the workflow doc's "how much
    advance was paid at that location" language."""
    if location.sourcingTrip.status == TripStatus.CLOSED:
        raise ValidationError("Cannot modify a location on a closed Sourcing Trip.")
    location.status = LocationEntryStatus.REPORTED
    location.reportedAt = timezone.now()
    location.save(update_fields=["status", "reportedAt", "updatedAt"])

    product = location.sourcingTrip.product
    record_expense(
        sister_profile=product.sisterProfile,
        product=product,
        source_type=SourceType.SOURCING_ADVANCE,
        amount=location.advanceAmount,
        remarks=f"Sourcing advance at {location.locationName} for {product.name}",
        created_by=actor,
    )
    return location


@transaction.atomic
def close_sourcing_trip(trip: SourcingTrip) -> SourcingTrip:
    """BR-13 / FR-69: a trip closes only once every location is Reported —
    this stands in for "full payment confirmed", which the same action
    records (App_Workflow §4 Step 5: locations report in -> full payment
    made -> trip closes, as one gated step in this system)."""
    if trip.status == TripStatus.CLOSED:
        raise ValidationError("Sourcing Trip is already closed.")
    if not trip.locations.exists():
        raise ValidationError("Cannot close a Sourcing Trip with no locations.")
    if trip.locations.filter(status=LocationEntryStatus.PENDING).exists():
        raise ValidationError("Cannot close a Sourcing Trip while any location is still Pending.")
    trip.status = TripStatus.CLOSED
    trip.fullPaymentConfirmedAt = timezone.now()
    trip.save(update_fields=["status", "fullPaymentConfirmedAt", "updatedAt"])

    from django.db.models import Sum

    from apps.notifications.models import NotificationType
    from apps.notifications.services import notify

    total_advance = trip.locations.aggregate(total=Sum("advanceAmount"))["total"] or 0
    notify(
        user=trip.product.createdBy, title="Sourcing Trip closed",
        message=f"The Sourcing Trip for {trip.product.name} has closed with a total advance of {total_advance}.",
        notification_type=NotificationType.TRIP_CLOSED, sister_profile=trip.product.sisterProfile,
    )
    return trip


def submit_for_approval(product: Product) -> Product:
    """BR-08 / BR-14 / FR-04 / FR-70: the hard gate — a product cannot enter
    Pending Admin Approval while its Sourcing Trip is Open (or has none)."""
    if product.status != ProductStatus.SOURCING_TRIP_OPEN:
        raise ValidationError(f"Cannot submit for approval from status '{product.status}'.")
    trip = product.sourcingTrips.order_by("-createdAt").first()
    if trip is None or trip.status != TripStatus.CLOSED:
        raise ValidationError("Cannot submit for approval while the Sourcing Trip is Open (or missing).")
    product.status = ProductStatus.PENDING_ADMIN_APPROVAL
    product.save(update_fields=["status", "updatedAt"])
    return product


def approve_product(product: Product, reviewed_by) -> Product:
    """BR-10 / FR-06."""
    if product.status != ProductStatus.PENDING_ADMIN_APPROVAL:
        raise ValidationError(f"Cannot approve from status '{product.status}'.")
    before_status = product.status
    product.status = ProductStatus.APPROVED_FOR_QC
    product.reviewedBy = reviewed_by
    product.reviewedAt = timezone.now()
    product.save(update_fields=["status", "reviewedBy", "reviewedAt", "updatedAt"])

    from apps.audit.services import log_action
    from apps.notifications.models import NotificationType
    from apps.notifications.services import notify

    log_action(
        actor=reviewed_by, action="APPROVE_PRODUCT", entity_type="Product", entity_id=product.id,
        before={"status": before_status}, after={"status": product.status},
    )
    notify(
        user=product.createdBy, title="Sourcing request approved",
        message=f"'{product.name}' was approved for QC.",
        notification_type=NotificationType.REQUEST_APPROVED, sister_profile=product.sisterProfile,
    )
    return product


def reject_product(product: Product, reviewed_by, reason: str) -> Product:
    """BR-09 / FR-06: rejection requires a reason and stops the process."""
    if product.status != ProductStatus.PENDING_ADMIN_APPROVAL:
        raise ValidationError(f"Cannot reject from status '{product.status}'.")
    if not reason:
        raise ValidationError("A rejection reason is required.")
    before_status = product.status
    product.status = ProductStatus.REJECTED
    product.rejectionReason = reason
    product.reviewedBy = reviewed_by
    product.reviewedAt = timezone.now()
    product.save(update_fields=["status", "rejectionReason", "reviewedBy", "reviewedAt", "updatedAt"])

    from apps.audit.services import log_action
    from apps.notifications.models import NotificationType
    from apps.notifications.services import notify

    log_action(
        actor=reviewed_by, action="REJECT_PRODUCT", entity_type="Product", entity_id=product.id,
        before={"status": before_status}, after={"status": product.status, "reason": reason},
    )
    notify(
        user=product.createdBy, title="Sourcing request rejected",
        message=f"'{product.name}' was rejected: {reason}",
        notification_type=NotificationType.REQUEST_REJECTED, sister_profile=product.sisterProfile,
    )
    return product


# ── Final QC & QR (BR-32–35 / FR-22, FR-25–27, FR-34–38) ────────────────

QR_SCHEMA_VERSION = 1


def save_final_qc_data(product: Product, *, goods_name: str, final_price, fabric_details: str) -> Product:
    """A Final QC form save — distinct from Module 8's QC *cost* report.
    Doesn't touch status; it just records what the dual QR payloads will
    encode once generated."""
    if product.status not in (ProductStatus.READY_FOR_FINAL_QC, ProductStatus.COMPLETED):
        raise ValidationError(f"Cannot save Final QC data from status '{product.status}'.")
    product.goodsName = goods_name or ""
    product.finalPrice = final_price
    product.fabricDetails = fabric_details or ""
    product.save(update_fields=["goodsName", "finalPrice", "fabricDetails", "updatedAt"])
    return product


def _require_finalized(product: Product) -> None:
    """FR-25/26: the QR payload depends on Final Goods Name / Price / Fabric
    Details already being saved — block generation until they are, rather
    than encoding blanks."""
    if not (product.goodsName and product.finalPrice is not None and product.fabricDetails):
        raise ValidationError(
            "Save Final Goods Name, Final Price, and Fabric Details before generating a QR code."
        )


def _maybe_complete(product: Product, actor) -> None:
    """BR-35 / FR-27: status flips to Completed only once *both* QR codes
    exist — checked here, after every QR generation call, never as a
    manual status change."""
    if product.productQrGenerated and product.cartonQrGenerated and product.status != ProductStatus.COMPLETED:
        before_status = product.status
        product.status = ProductStatus.COMPLETED
        product.save(update_fields=["status", "updatedAt"])

        from apps.audit.services import log_action

        log_action(
            actor=actor, action="COMPLETE_PRODUCT", entity_type="Product", entity_id=product.id,
            before={"status": before_status}, after={"status": product.status},
        )


@transaction.atomic
def generate_product_qr(product: Product, actor) -> Product:
    """FR-25: encodes size/color/quantity/fabric/price — the finished-goods
    identity, one QR per product."""
    _require_finalized(product)
    colors = sorted({color for v in product.variants.all() for color in (v.colorBreakdown or {}).keys()})
    sizes = sorted({size for v in product.variants.all() for size in (v.sizeBreakdown or {}).keys()})
    product.productQrPayload = {
        "schema_version": QR_SCHEMA_VERSION,
        "type": "product",
        "productId": str(product.id),
        "styleNumber": product.styleNumber,
        "colors": colors,
        "sizes": sizes,
        "quantity": product.total_order_qty(),
        "fabric": product.fabricDetails,
        "price": str(product.finalPrice),
    }
    product.productQrGenerated = True
    product.save(update_fields=["productQrPayload", "productQrGenerated", "updatedAt"])
    _maybe_complete(product, actor)
    return product


@transaction.atomic
def generate_carton_qr(product: Product, actor) -> Product:
    """FR-26: encodes carton contents/total quantity/QC Report ID — the
    shipping-carton identity, one QR per product."""
    _require_finalized(product)
    qc_report = getattr(product, "qcReport", None)
    product.cartonQrPayload = {
        "schema_version": QR_SCHEMA_VERSION,
        "type": "carton",
        "productId": str(product.id),
        "styleNumber": product.styleNumber,
        "totalCartons": sum(v.noOfCartons for v in product.variants.all()),
        "totalQuantity": product.total_order_qty(),
        "qcReportId": qc_report.reportId if qc_report else None,
    }
    product.cartonQrGenerated = True
    product.save(update_fields=["cartonQrPayload", "cartonQrGenerated", "updatedAt"])
    _maybe_complete(product, actor)
    return product

"""
Sourcing state machine (DRF Migration Instructions §3, Phase 2: "implement
as an explicit state machine ... not ad-hoc status string updates scattered
across views"). Every transition is a function here; viewsets call these,
never mutate `.status` directly. The Admin Approval step is gone from the
workflow: products are created directly Approved for QC, so the remaining
transitions are QC -> warehouse -> final QC -> completed.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.core.utils import sum_size_breakdown
from apps.expenses.models import SourceType
from apps.expenses.services import record_expense
from apps.sourcing.models import (
    Product,
    ProductStatus,
    ProductTemplate,
    ProductTemplateField,
    ProductVariant,
    SourcingCost,
    SourcingCostItem,
    TemplateField,
    TripStatus,
)


def _dec(value) -> Decimal:
    return Decimal(str(value or 0))


# ── Product Templates & Custom Fields (Product_Templates_Custom_Fields_Module.md) ──

@transaction.atomic
def save_template_fields(template: ProductTemplate, field_ids: list[str]) -> ProductTemplate:
    """BR: 'Selecting one field in a field_group auto-adds the rest of that
    group to the template at save time — implement as a single validation/
    completion step on save, not a live client-side-only behavior that
    could be bypassed via direct API calls.' Fully replaces the template's
    field selection (same delete-and-recreate pattern used for
    ProductVariant/PackingCarton rows elsewhere in this app)."""
    fields = list(TemplateField.objects.filter(id__in=field_ids).select_related("fieldGroup"))
    touched_group_ids = {f.fieldGroup_id for f in fields if f.fieldGroup_id}
    if touched_group_ids:
        group_fields = TemplateField.objects.filter(fieldGroup_id__in=touched_group_ids)
        seen_ids = {f.id for f in fields}
        fields += [f for f in group_fields if f.id not in seen_ids]

    ProductTemplateField.objects.filter(template=template).delete()
    for order, field in enumerate(fields):
        ProductTemplateField.objects.create(template=template, field=field, displayOrder=order)
    return template


def resolve_template_fields(template: ProductTemplate | None) -> list[dict]:
    """Snapshotted onto Product.resolvedTemplateFields at creation time —
    never a live read through `template` afterward (BR: editing a
    Template's field set must not retroactively alter existing Products)."""
    if not template:
        return []
    return [
        {
            "fieldKey": ptf.field.fieldKey,
            "label": ptf.field.label,
            "fieldType": ptf.field.fieldType,
            "selectOptions": ptf.field.selectOptions,
            "isRequired": ptf.field.isRequired,
        }
        for ptf in template.templateFields.select_related("field").order_by("displayOrder")
    ]


def _round4(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _round2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute_variant_derived(variant: ProductVariant) -> None:
    """Computes derived fields on a ProductVariant.

    Dimensions (ctnLength/Width/Height) are entered at Sourcing Intake in
    centimetres. CBM = L×W×H / 1,000,000 (cm³ → m³).

    NOTE: PackingRule defaults stay in inches (their historic convention);
    generate_variant_rows_from_rule converts them to centimetres when
    pre-filling intake rows (apps.packing.services)."""
    variant.pcsPerCarton = sum_size_breakdown(variant.sizeBreakdown)
    # Same default-only rule the former PackingCarton had: per-row poNo
    # falls back to the Product's own poNo when blank, but a value the
    # caller supplied is never overwritten (a split shipment may need a
    # different PO on one row).
    if not variant.poNo:
        variant.poNo = variant.product.poNo

    if variant.cartonNoTo is not None and variant.cartonNoFrom is not None and variant.cartonNoTo >= variant.cartonNoFrom:
        variant.noOfCartons = variant.cartonNoTo - variant.cartonNoFrom + 1
    else:
        variant.noOfCartons = 0

    variant.totalPcs = variant.pcsPerCarton * variant.noOfCartons

    # Shipped-vs-ordered, computed exactly the way the former PackingCarton
    # did (the merge kept the semantics, just the storage location changed):
    # shipQty = noOfCartons x pcsPerCarton; shortExcessQty signed (positive
    # = short of order, negative = excess over order).
    variant.shipQty = variant.noOfCartons * variant.pcsPerCarton
    variant.shortExcessQty = variant.orderQty - variant.shipQty
    variant.shortExcessPct = (
        _round2(_dec(variant.shortExcessQty) / _dec(variant.orderQty) * 100) if variant.orderQty else Decimal("0")
    )
    variant.totalGrossWeight = _dec(variant.grossWeight) * variant.noOfCartons
    variant.totalNetWeight = _dec(variant.netWeight) * variant.noOfCartons
    # Buy price is per piece, flat across every size in the color — Amount
    # is always TTL PCS x Unit Price, never a per-size price.
    variant.totalAmount = _round2(_dec(variant.unitPrice) * variant.totalPcs)

    # Dimensions entered in cm — CBM = cubic_cm / 1,000,000
    cubic_cm = _dec(variant.ctnLength) * _dec(variant.ctnWidth) * _dec(variant.ctnHeight)
    per_carton_cbm = cubic_cm / Decimal("1000000") if cubic_cm else Decimal("0")
    variant.cbm = _round4(per_carton_cbm)
    variant.totalCbm = _round4(per_carton_cbm * variant.noOfCartons)


@transaction.atomic
def deduct_cost_item(item: SourcingCostItem, actor) -> None:
    """Record expenses for each custom cost field, deducting from the buyer's wallet."""
    product = item.product
    sister_profile = product.sisterProfile
    for cf in item.customCostFields or []:
        amount = cf.get("amount", 0)
        if amount:
            record_expense(
                sister_profile=sister_profile,
                product=product,
                source_type=SourceType.SOURCING_ADVANCE,
                amount=amount,
                remarks=f"{cf.get('name', 'Custom cost')}: {product.name} @ {item.locationName}",
                field_name=f"sourcing_cost_item:{item.id}",
                created_by=actor,
            )


@transaction.atomic
def adjust_cost_item(item: SourcingCostItem, old_custom_costs: list, actor) -> None:
    """Refund old expenses and deduct new ones when item costs change."""
    from apps.expenses.models import Expense

    product = item.product
    sister_profile = product.sisterProfile

    # Find and refund old expenses for this item
    old_expenses = list(Expense.objects.filter(
        product=product,
        sourceType=SourceType.SOURCING_ADVANCE,
        fieldName=f"sourcing_cost_item:{item.id}",
    ))

    if old_expenses:
        from apps.expenses.services import _refund_for_expenses
        from apps.wallet.services import create_wallet

        _refund_for_expenses(
            wallet=create_wallet(sister_profile.buyerProfile), expenses=old_expenses,
            sister_profile=sister_profile, actor=actor,
            reason=f"Sourcing cost item updated for {product.name}",
        )
        Expense.objects.filter(id__in=[e.id for e in old_expenses]).delete()

    # Deduct new costs
    deduct_cost_item(item, actor)


@transaction.atomic
def refund_cost_item(item: SourcingCostItem, actor) -> None:
    """Refund all expenses for a cost item being deleted."""
    from apps.expenses.models import Expense

    product = item.product
    sister_profile = product.sisterProfile

    expenses = list(Expense.objects.filter(
        product=product,
        sourceType=SourceType.SOURCING_ADVANCE,
        fieldName=f"sourcing_cost_item:{item.id}",
    ))

    if expenses:
        from apps.expenses.services import _refund_for_expenses
        from apps.wallet.services import create_wallet

        _refund_for_expenses(
            wallet=create_wallet(sister_profile.buyerProfile), expenses=expenses,
            sister_profile=sister_profile, actor=actor,
            reason=f"Sourcing cost item deleted for {product.name}",
        )
        Expense.objects.filter(id__in=[e.id for e in expenses]).delete()


@transaction.atomic
def close_sourcing_cost(cost: SourcingCost) -> SourcingCost:
    """A sourcing cost closes once it has at least one item. Wallet deductions
    already happened on item creation, so closing is just a status gate."""
    if cost.status == TripStatus.CLOSED:
        raise ValidationError("Sourcing Cost is already closed.")
    if not cost.items.exists():
        raise ValidationError("Cannot close a Sourcing Cost with no items.")
    cost.status = TripStatus.CLOSED
    cost.fullPaymentConfirmedAt = timezone.now()
    cost.save(update_fields=["status", "fullPaymentConfirmedAt", "updatedAt"])

    total_amount = _dec("0")
    for item in cost.items.all():
        for cf in item.customCostFields or []:
            total_amount += _dec(cf.get("amount", 0))

    from apps.notifications.models import NotificationType
    from apps.notifications.services import notify

    for portal_user in cost.sisterProfile.buyerProfile.portal_users.all():
        notify(
            user=portal_user,
            title="Sourcing Cost closed",
            message=f"The Sourcing Cost for {cost.sisterProfile.poReference} has closed with a total of {total_amount}.",
            notification_type=NotificationType.TRIP_CLOSED,
            sister_profile=cost.sisterProfile,
        )


@transaction.atomic
def reopen_sourcing_cost(cost: SourcingCost) -> SourcingCost:
    """Reopen a closed cost so its items can be edited, added or deleted
    again. Closing is just a status gate (wallet deductions live on the
    items, not the cost), so reopening is the same gate in reverse — and it
    clears the payment-confirmed stamp so the cost reads as unconfirmed
    until it is closed again."""
    if cost.status == TripStatus.OPEN:
        raise ValidationError("Sourcing Cost is already open.")
    cost.status = TripStatus.OPEN
    cost.fullPaymentConfirmedAt = None
    cost.save(update_fields=["status", "fullPaymentConfirmedAt", "updatedAt"])
    return cost


def mark_ready_for_final_qc(product: Product, actor) -> Product:
    """In Warehouse -> Ready for Final QC. The Final QC spec defines this
    status as "Warehouse Costs step already completed", but Warehouse Costs
    are recorded per Sister Profile / Packing List, not per product (see
    apps.warehouse.models.WarehouseCost), so there is no single per-product
    event to hook automatically. The warehouse side confirms it explicitly
    instead, and only once this order has at least one Warehouse Cost."""
    if product.status != ProductStatus.IN_WAREHOUSE:
        raise ValidationError(f"Cannot mark Ready for Final QC from status '{product.status}'.")
    if not product.sisterProfile.warehouseCosts.exists():
        raise ValidationError(
            "Record this order's Warehouse Costs before marking the product Ready for Final QC."
        )
    before_status = product.status
    product.status = ProductStatus.READY_FOR_FINAL_QC
    product.save(update_fields=["status", "updatedAt"])

    from apps.audit.services import log_action

    log_action(
        actor=actor, action="READY_FOR_FINAL_QC", entity_type="Product", entity_id=product.id,
        before={"status": before_status}, after={"status": product.status},
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
    colors = sorted({v.colorName for v in product.variants.all() if v.colorName})
    sizes = sorted(
        {entry.get("size_label", "") for v in product.variants.all() for entry in (v.sizeBreakdown or [])} - {""}
    )
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

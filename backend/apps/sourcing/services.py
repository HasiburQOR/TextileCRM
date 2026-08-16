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
    """Mirrors apps.packing.services.compute_carton_derived — every color
    row here carries the same packing-detail shape as a PackingCarton, so
    the calc must match exactly (Module Documentation Pack §4)."""
    from apps.packing.models import CUBIC_INCHES_PER_CBM

    variant.pcsPerCarton = sum_size_breakdown(variant.sizeBreakdown)

    if variant.cartonNoTo is not None and variant.cartonNoFrom is not None and variant.cartonNoTo >= variant.cartonNoFrom:
        variant.noOfCartons = variant.cartonNoTo - variant.cartonNoFrom + 1
    else:
        variant.noOfCartons = 0

    variant.totalPcs = variant.pcsPerCarton * variant.noOfCartons
    variant.totalGrossWeight = _dec(variant.grossWeight) * variant.noOfCartons
    variant.totalNetWeight = _dec(variant.netWeight) * variant.noOfCartons
    # Buy price is per piece, flat across every size in the color — Amount
    # is always TTL PCS x Unit Price, never a per-size price.
    variant.totalAmount = _round2(_dec(variant.unitPrice) * variant.totalPcs)

    cubic_inches = _dec(variant.ctnLength) * _dec(variant.ctnWidth) * _dec(variant.ctnHeight)
    per_carton_cbm = cubic_inches / Decimal(str(CUBIC_INCHES_PER_CBM)) if cubic_inches else Decimal("0")
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
        from apps.wallet.models import WalletTransaction, WalletTransactionType
        from apps.wallet.services import create_wallet, record_refund

        wallet = create_wallet(sister_profile.buyerProfile)
        for expense in old_expenses:
            deduction = WalletTransaction.objects.filter(
                wallet=wallet, type=WalletTransactionType.DEDUCTION, sourceExpense=expense
            ).first()
            if deduction:
                record_refund(
                    wallet=wallet, amount=-deduction.amount,
                    source_type=expense.sourceType,
                    sister_profile=sister_profile,
                    source_expense=expense,
                    created_by=actor or deduction.createdBy,
                    currency=deduction.currency,
                    reason=f"Sourcing cost item updated for {product.name}",
                )
        Expense.objects.filter(id__in=[e.id for e in old_expenses]).delete()

        from apps.ledger.services import recompute_settlement
        recompute_settlement(sister_profile)

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
        from apps.wallet.models import WalletTransaction, WalletTransactionType
        from apps.wallet.services import create_wallet, record_refund

        wallet = create_wallet(sister_profile.buyerProfile)
        for expense in expenses:
            deduction = WalletTransaction.objects.filter(
                wallet=wallet, type=WalletTransactionType.DEDUCTION, sourceExpense=expense
            ).first()
            if deduction:
                record_refund(
                    wallet=wallet, amount=-deduction.amount,
                    source_type=expense.sourceType,
                    sister_profile=sister_profile,
                    source_expense=expense,
                    created_by=actor or deduction.createdBy,
                    currency=deduction.currency,
                    reason=f"Sourcing cost item deleted for {product.name}",
                )

        Expense.objects.filter(id__in=[e.id for e in expenses]).delete()

        from apps.ledger.services import recompute_settlement
        recompute_settlement(sister_profile)


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
    return cost


def submit_for_approval(product: Product) -> Product:
    """BR-08 / BR-14 / FR-04 / FR-70: the hard gate — a product cannot enter
    Pending Admin Approval while its Sourcing Cost is Open (or has none)."""
    if product.status != ProductStatus.SOURCING_TRIP_OPEN:
        raise ValidationError(f"Cannot submit for approval from status '{product.status}'.")
    item = product.sourcingCostItems.order_by("-createdAt").first()
    if item is None or item.sourcingCost.status != TripStatus.CLOSED:
        raise ValidationError("Cannot submit for approval while the product's Sourcing Cost is Open (or missing).")
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

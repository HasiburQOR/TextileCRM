from django.core.exceptions import ValidationError
from django.db import transaction

from apps.expenses.models import SourceType
from apps.expenses.services import record_expense
from apps.qc.models import QCReport, TravelMode
from apps.sourcing.models import Product, ProductStatus


@transaction.atomic
def create_qc_report(
    *, product: Product, created_by, lunch_cost_flag: bool, lunch_cost, goods_carrying_cost, travel_mode: str, extra_cost
) -> QCReport:
    """BR-23–29 / FR-25–29."""
    if product.status != ProductStatus.APPROVED_FOR_QC:
        raise ValidationError(f"Cannot create a QC report from status '{product.status}'.")
    if QCReport.objects.filter(product=product).exists():
        raise ValidationError("This product already has a QC report.")

    report = QCReport(
        product=product,
        createdBy=created_by,
        lunchCostFlag=lunch_cost_flag,
        lunchCost=lunch_cost or 0,
        goodsCarryingCost=goods_carrying_cost or 0,
        travelMode=travel_mode,
        extraCost=extra_cost or 0,
    )
    report.compute_total()
    report.save()

    sister_profile = product.sisterProfile
    if report.lunchCostFlag and report.lunchCost:
        record_expense(
            sister_profile=sister_profile, product=product, source_type=SourceType.QC_LUNCH,
            amount=report.lunchCost, remarks=f"QC lunch cost for {product.name}", created_by=created_by,
        )
    if report.goodsCarryingCost:
        record_expense(
            sister_profile=sister_profile, product=product, source_type=SourceType.QC_CARRYING,
            amount=report.goodsCarryingCost, remarks=f"QC goods carrying cost for {product.name}", created_by=created_by,
        )
    if report.travelMode == TravelMode.TRAVELLING_INDIVIDUALLY and report.extraCost:
        record_expense(
            sister_profile=sister_profile, product=product, source_type=SourceType.QC_TRAVEL_EXTRA,
            amount=report.extraCost, remarks=f"QC travel extra cost for {product.name}", created_by=created_by,
        )

    # FR-29: on submit, status -> In Warehouse.
    product.status = ProductStatus.IN_WAREHOUSE
    product.save(update_fields=["status", "updatedAt"])

    return report


_QC_SOURCE_TYPES = [SourceType.QC_LUNCH, SourceType.QC_CARRYING, SourceType.QC_TRAVEL_EXTRA]


@transaction.atomic
def update_qc_report(
    report: QCReport, *, updated_by, lunch_cost_flag: bool, lunch_cost, goods_carrying_cost, travel_mode: str, extra_cost
) -> QCReport:
    """Corrects a mistyped report after the fact — replaces its Expense rows
    rather than leaving the old (wrong) ones alongside the corrected report,
    same delete-and-recreate pattern used for Product variants / Packing
    List cartons."""
    from apps.expenses.services import delete_expenses

    product = report.product
    delete_expenses(product=product, source_types=_QC_SOURCE_TYPES)

    report.lunchCostFlag = lunch_cost_flag
    report.lunchCost = lunch_cost or 0
    report.goodsCarryingCost = goods_carrying_cost or 0
    report.travelMode = travel_mode
    report.extraCost = extra_cost or 0
    report.compute_total()
    report.save()

    sister_profile = product.sisterProfile
    if report.lunchCostFlag and report.lunchCost:
        record_expense(
            sister_profile=sister_profile, product=product, source_type=SourceType.QC_LUNCH,
            amount=report.lunchCost, remarks=f"QC lunch cost for {product.name}", created_by=updated_by,
        )
    if report.goodsCarryingCost:
        record_expense(
            sister_profile=sister_profile, product=product, source_type=SourceType.QC_CARRYING,
            amount=report.goodsCarryingCost, remarks=f"QC goods carrying cost for {product.name}", created_by=updated_by,
        )
    if report.travelMode == TravelMode.TRAVELLING_INDIVIDUALLY and report.extraCost:
        record_expense(
            sister_profile=sister_profile, product=product, source_type=SourceType.QC_TRAVEL_EXTRA,
            amount=report.extraCost, remarks=f"QC travel extra cost for {product.name}", created_by=updated_by,
        )
    return report


@transaction.atomic
def delete_qc_report(report: QCReport) -> None:
    from apps.expenses.services import delete_expenses

    if hasattr(report, "warehouseCost"):
        raise ValidationError("Cannot delete — this product already has warehouse costs recorded. Delete those first.")

    product = report.product
    delete_expenses(product=product, source_types=_QC_SOURCE_TYPES)
    report.delete()

    if product.status == ProductStatus.IN_WAREHOUSE:
        product.status = ProductStatus.APPROVED_FOR_QC
        product.save(update_fields=["status", "updatedAt"])

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.expenses.models import SourceType
from apps.expenses.services import record_expense
from apps.qc.models import QCReport
from apps.sourcing.models import ProductStatus
from apps.warehouse.models import PACKAGING_COST_FIELDS, PACKAGING_COST_LABELS, WarehouseCost


@transaction.atomic
def create_warehouse_cost(*, qc_report: QCReport, created_by, custom_costs=None, extra_cost=0, extra_cost_remarks="", **cost_fields) -> WarehouseCost:
    """BR-27–31 / FR-30–33."""
    product = qc_report.product
    if product.status != ProductStatus.IN_WAREHOUSE:
        raise ValidationError(f"Cannot record warehouse costs from status '{product.status}'.")
    if WarehouseCost.objects.filter(qcReport=qc_report).exists():
        raise ValidationError("This QC report already has warehouse costs.")

    custom_costs = custom_costs or []

    wc = WarehouseCost(
        qcReport=qc_report, createdBy=created_by, customCosts=custom_costs,
        extraCost=extra_cost or 0, extraCostRemarks=extra_cost_remarks, **cost_fields,
    )
    wc.compute_total()
    wc.save()

    sister_profile = product.sisterProfile

    if wc.loaderCost:
        record_expense(
            sister_profile=sister_profile, product=product, source_type=SourceType.WAREHOUSE_LOADER,
            amount=wc.loaderCost, remarks=f"Loader cost for {product.name}", created_by=created_by,
        )
    if wc.extraWorkerCost:
        record_expense(
            sister_profile=sister_profile, product=product, source_type=SourceType.WAREHOUSE_EXTRA_WORKER,
            amount=wc.extraWorkerCost, remarks=f"Extra worker cost for {product.name}", created_by=created_by,
        )
    for field in PACKAGING_COST_FIELDS:
        value = getattr(wc, field)
        if value:
            record_expense(
                sister_profile=sister_profile, product=product, source_type=SourceType.WAREHOUSE_PACKAGING_ITEM,
                amount=value, field_name=field,
                remarks=f"{PACKAGING_COST_LABELS[field]} packaging cost for {product.name}", created_by=created_by,
            )
    for entry in custom_costs:
        amount = entry.get("amount") or 0
        if amount:
            record_expense(
                sister_profile=sister_profile, product=product, source_type=SourceType.CUSTOM_FIELD,
                amount=amount, field_name=entry.get("fieldName", ""),
                remarks=entry.get("remarks") or f"Custom cost for {product.name}", created_by=created_by,
            )
    if wc.extraCost:
        record_expense(
            sister_profile=sister_profile, product=product, source_type=SourceType.EXTRA_COST,
            amount=wc.extraCost, remarks=wc.extraCostRemarks or f"Extra cost for {product.name}", created_by=created_by,
        )

    # FR-33: on save, status -> Ready for Final QC.
    product.status = ProductStatus.READY_FOR_FINAL_QC
    product.save(update_fields=["status", "updatedAt"])

    return wc


_WAREHOUSE_SOURCE_TYPES = [
    SourceType.WAREHOUSE_LOADER, SourceType.WAREHOUSE_EXTRA_WORKER,
    SourceType.WAREHOUSE_PACKAGING_ITEM, SourceType.CUSTOM_FIELD, SourceType.EXTRA_COST,
]


@transaction.atomic
def update_warehouse_cost(wc: WarehouseCost, *, updated_by, custom_costs=None, extra_cost=0, extra_cost_remarks="", **cost_fields) -> WarehouseCost:
    """Corrects a mistyped warehouse cost entry — replaces its Expense rows,
    same delete-and-recreate pattern used everywhere else in this app.
    Doesn't touch product.status — it's already Ready for Final QC and stays
    that way for a correction, unlike create."""
    from apps.expenses.services import delete_expenses

    product = wc.qcReport.product
    delete_expenses(product=product, source_types=_WAREHOUSE_SOURCE_TYPES, actor=updated_by)

    custom_costs = custom_costs or []
    for field, value in cost_fields.items():
        setattr(wc, field, value)
    wc.customCosts = custom_costs
    wc.extraCost = extra_cost or 0
    wc.extraCostRemarks = extra_cost_remarks
    wc.compute_total()
    wc.save()

    sister_profile = product.sisterProfile
    if wc.loaderCost:
        record_expense(
            sister_profile=sister_profile, product=product, source_type=SourceType.WAREHOUSE_LOADER,
            amount=wc.loaderCost, remarks=f"Loader cost for {product.name}", created_by=updated_by,
        )
    if wc.extraWorkerCost:
        record_expense(
            sister_profile=sister_profile, product=product, source_type=SourceType.WAREHOUSE_EXTRA_WORKER,
            amount=wc.extraWorkerCost, remarks=f"Extra worker cost for {product.name}", created_by=updated_by,
        )
    for field in PACKAGING_COST_FIELDS:
        value = getattr(wc, field)
        if value:
            record_expense(
                sister_profile=sister_profile, product=product, source_type=SourceType.WAREHOUSE_PACKAGING_ITEM,
                amount=value, field_name=field,
                remarks=f"{PACKAGING_COST_LABELS[field]} packaging cost for {product.name}", created_by=updated_by,
            )
    for entry in custom_costs:
        amount = entry.get("amount") or 0
        if amount:
            record_expense(
                sister_profile=sister_profile, product=product, source_type=SourceType.CUSTOM_FIELD,
                amount=amount, field_name=entry.get("fieldName", ""),
                remarks=entry.get("remarks") or f"Custom cost for {product.name}", created_by=updated_by,
            )
    if wc.extraCost:
        record_expense(
            sister_profile=sister_profile, product=product, source_type=SourceType.EXTRA_COST,
            amount=wc.extraCost, remarks=wc.extraCostRemarks or f"Extra cost for {product.name}", created_by=updated_by,
        )
    return wc


@transaction.atomic
def delete_warehouse_cost(wc: WarehouseCost) -> None:
    from apps.expenses.services import delete_expenses

    product = wc.qcReport.product
    delete_expenses(product=product, source_types=_WAREHOUSE_SOURCE_TYPES)
    wc.delete()

    if product.status == ProductStatus.READY_FOR_FINAL_QC:
        product.status = ProductStatus.IN_WAREHOUSE
        product.save(update_fields=["status", "updatedAt"])

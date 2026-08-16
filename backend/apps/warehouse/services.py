from django.core.exceptions import ValidationError
from django.db import transaction

from apps.buyers.models import SisterProfile
from apps.expenses.models import SourceType
from apps.expenses.services import record_expense
from apps.packing.models import PackingList
from apps.warehouse.models import PACKAGING_COST_FIELDS, PACKAGING_COST_LABELS, WarehouseCost


def _cost_label(sister_profile: SisterProfile, packing_list: PackingList | None) -> str:
    """Human-readable tag for this cost's Expense rows/remarks — a Packing
    List reference when there is one (most specific), else the Sister
    Profile's own PO reference."""
    if packing_list:
        return packing_list.referenceCode or str(packing_list.id)
    return sister_profile.poReference or str(sister_profile.id)


@transaction.atomic
def create_warehouse_cost(
    *, sister_profile: SisterProfile, created_by, packing_list: PackingList | None = None,
    custom_costs=None, extra_cost=0, extra_cost_remarks="", **cost_fields,
) -> WarehouseCost:
    """BR-27–31 / FR-30–33. Recorded directly against a Sister Profile
    (optionally scoped to one of its Packing Lists) — no QC report or
    product-status precondition, and no one-per-source limit: a shipment
    can rack up more than one round of warehouse costs."""
    if packing_list and packing_list.sisterProfile_id != sister_profile.id:
        raise ValidationError("That Packing List does not belong to the selected Sister Profile.")

    custom_costs = custom_costs or []

    wc = WarehouseCost(
        sisterProfile=sister_profile, packingList=packing_list, createdBy=created_by, customCosts=custom_costs,
        extraCost=extra_cost or 0, extraCostRemarks=extra_cost_remarks, **cost_fields,
    )
    wc.compute_total()
    wc.save()

    label = _cost_label(sister_profile, packing_list)

    if wc.loaderCost:
        record_expense(
            sister_profile=sister_profile, warehouse_cost=wc, source_type=SourceType.WAREHOUSE_LOADER,
            amount=wc.loaderCost, remarks=f"Loader cost for {label}", created_by=created_by,
        )
    if wc.extraWorkerCost:
        record_expense(
            sister_profile=sister_profile, warehouse_cost=wc, source_type=SourceType.WAREHOUSE_EXTRA_WORKER,
            amount=wc.extraWorkerCost, remarks=f"Extra worker cost for {label}", created_by=created_by,
        )
    for field in PACKAGING_COST_FIELDS:
        value = getattr(wc, field)
        if value:
            record_expense(
                sister_profile=sister_profile, warehouse_cost=wc, source_type=SourceType.WAREHOUSE_PACKAGING_ITEM,
                amount=value, field_name=field,
                remarks=f"{PACKAGING_COST_LABELS[field]} packaging cost for {label}", created_by=created_by,
            )
    for entry in custom_costs:
        amount = entry.get("amount") or 0
        if amount:
            record_expense(
                sister_profile=sister_profile, warehouse_cost=wc, source_type=SourceType.CUSTOM_FIELD,
                amount=amount, field_name=entry.get("fieldName", ""),
                remarks=entry.get("remarks") or f"Custom cost for {label}", created_by=created_by,
            )
    if wc.extraCost:
        record_expense(
            sister_profile=sister_profile, warehouse_cost=wc, source_type=SourceType.EXTRA_COST,
            amount=wc.extraCost, remarks=wc.extraCostRemarks or f"Extra cost for {label}", created_by=created_by,
        )

    return wc


_WAREHOUSE_SOURCE_TYPES = [
    SourceType.WAREHOUSE_LOADER, SourceType.WAREHOUSE_EXTRA_WORKER,
    SourceType.WAREHOUSE_PACKAGING_ITEM, SourceType.CUSTOM_FIELD, SourceType.EXTRA_COST,
]


@transaction.atomic
def update_warehouse_cost(wc: WarehouseCost, *, updated_by, custom_costs=None, extra_cost=0, extra_cost_remarks="", **cost_fields) -> WarehouseCost:
    """Corrects a mistyped warehouse cost entry — replaces its Expense rows,
    same delete-and-recreate pattern used everywhere else in this app."""
    from apps.expenses.services import delete_expenses

    delete_expenses(product=None, warehouse_cost=wc, source_types=_WAREHOUSE_SOURCE_TYPES, actor=updated_by)

    custom_costs = custom_costs or []
    for field, value in cost_fields.items():
        setattr(wc, field, value)
    wc.customCosts = custom_costs
    wc.extraCost = extra_cost or 0
    wc.extraCostRemarks = extra_cost_remarks
    wc.compute_total()
    wc.save()

    label = _cost_label(wc.sisterProfile, wc.packingList)
    if wc.loaderCost:
        record_expense(
            sister_profile=wc.sisterProfile, warehouse_cost=wc, source_type=SourceType.WAREHOUSE_LOADER,
            amount=wc.loaderCost, remarks=f"Loader cost for {label}", created_by=updated_by,
        )
    if wc.extraWorkerCost:
        record_expense(
            sister_profile=wc.sisterProfile, warehouse_cost=wc, source_type=SourceType.WAREHOUSE_EXTRA_WORKER,
            amount=wc.extraWorkerCost, remarks=f"Extra worker cost for {label}", created_by=updated_by,
        )
    for field in PACKAGING_COST_FIELDS:
        value = getattr(wc, field)
        if value:
            record_expense(
                sister_profile=wc.sisterProfile, warehouse_cost=wc, source_type=SourceType.WAREHOUSE_PACKAGING_ITEM,
                amount=value, field_name=field,
                remarks=f"{PACKAGING_COST_LABELS[field]} packaging cost for {label}", created_by=updated_by,
            )
    for entry in custom_costs:
        amount = entry.get("amount") or 0
        if amount:
            record_expense(
                sister_profile=wc.sisterProfile, warehouse_cost=wc, source_type=SourceType.CUSTOM_FIELD,
                amount=amount, field_name=entry.get("fieldName", ""),
                remarks=entry.get("remarks") or f"Custom cost for {label}", created_by=updated_by,
            )
    if wc.extraCost:
        record_expense(
            sister_profile=wc.sisterProfile, warehouse_cost=wc, source_type=SourceType.EXTRA_COST,
            amount=wc.extraCost, remarks=wc.extraCostRemarks or f"Extra cost for {label}", created_by=updated_by,
        )
    return wc


@transaction.atomic
def delete_warehouse_cost(wc: WarehouseCost, *, actor=None) -> None:
    from apps.expenses.services import delete_expenses

    delete_expenses(product=None, warehouse_cost=wc, source_types=_WAREHOUSE_SOURCE_TYPES, actor=actor)
    wc.delete()

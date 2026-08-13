import json

from django.core.exceptions import ValidationError
from django.db import transaction

from expenses.models import Expense, SourceType
from qc.models import QCReport
from warehouse.models import CUSTOM_COST_FIELDS, WarehouseCost

_PACKAGING_LABELS = {
    "labelsCost": "Labels",
    "htakeCost": "H-Take",
    "stickersCost": "Stickers",
    "cartonsCost": "Cartons",
    "polyBagsCost": "Poly Bags",
    "gamtapeCost": "Gum Tape",
}


def _parse_custom_costs(raw):
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw or "[]")
            return parsed if isinstance(parsed, list) else []
        except (json.JSONDecodeError, TypeError):
            return []
    return []


@transaction.atomic
def create_warehouse_cost(*, qc_report: QCReport, created_by, custom_costs=None, **cost_fields) -> WarehouseCost:
    if WarehouseCost.objects.filter(qcReport=qc_report).exists():
        raise ValidationError("This QC report already has warehouse costs.")

    parsed_custom = _parse_custom_costs(custom_costs)

    wc = WarehouseCost(qcReport=qc_report, createdBy=created_by, customCosts=json.dumps(parsed_custom), **cost_fields)
    wc.compute_total()
    wc.save()

    if qc_report.request.sisterProfile_id:
        _create_warehouse_expenses(wc, qc_report, parsed_custom)

    return wc


def _create_warehouse_expenses(wc: WarehouseCost, qc_report: QCReport, custom_costs) -> None:
    product_name = qc_report.request.productName
    sister_id = qc_report.request.sisterProfile_id
    rows = []

    if wc.loaderCost:
        rows.append(Expense(sisterProfile_id=sister_id, productId=str(qc_report.request_id), sourceType=SourceType.WAREHOUSE_LOADER, amount=wc.loaderCost, currency="BDT", remarks=f"Loader cost for {product_name}", createdBy=wc.createdBy))
    if wc.extraWorkerCost:
        rows.append(Expense(sisterProfile_id=sister_id, productId=str(qc_report.request_id), sourceType=SourceType.WAREHOUSE_EXTRA_WORKER, amount=wc.extraWorkerCost, currency="BDT", remarks=f"Extra worker cost for {product_name}", createdBy=wc.createdBy))

    for field in CUSTOM_COST_FIELDS:
        value = getattr(wc, field)
        if value:
            rows.append(
                Expense(
                    sisterProfile_id=sister_id,
                    productId=str(qc_report.request_id),
                    sourceType=SourceType.WAREHOUSE_PACKAGING_ITEM,
                    amount=value,
                    currency="BDT",
                    fieldName=field,
                    remarks=f"{_PACKAGING_LABELS[field]} packaging cost for {product_name}",
                    createdBy=wc.createdBy,
                )
            )

    for cc in custom_costs:
        amount = cc.get("amount") or 0
        if amount:
            rows.append(
                Expense(
                    sisterProfile_id=sister_id,
                    productId=str(qc_report.request_id),
                    sourceType=SourceType.CUSTOM_FIELD,
                    amount=amount,
                    currency=cc.get("currency") or "BDT",
                    fieldName=cc.get("fieldName") or cc.get("name"),
                    remarks=f"Custom cost for {product_name}",
                    createdBy=wc.createdBy,
                )
            )

    Expense.objects.bulk_create(rows)

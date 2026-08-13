from django.core.exceptions import ValidationError
from django.db import transaction

from expenses.models import Expense, SourceType
from qc.models import QCReport, TravelMode
from sourcing.models import SourcingRequest


@transaction.atomic
def create_qc_report(*, sourcing_request: SourcingRequest, created_by, lunch_cost_flag, lunch_cost, goods_carrying_cost, travel_mode, extra_cost) -> QCReport:
    if QCReport.objects.filter(request=sourcing_request).exists():
        raise ValidationError("This request already has a QC report.")

    report = QCReport(
        request=sourcing_request,
        createdBy=created_by,
        lunchCostFlag=lunch_cost_flag,
        lunchCost=lunch_cost or 0,
        goodsCarryingCost=goods_carrying_cost or 0,
        travelMode=travel_mode,
        extraCost=extra_cost or 0,
    )
    report.compute_total()
    report.save()

    if sourcing_request.sisterProfile_id:
        _create_qc_expenses(report, sourcing_request)

    return report


def _create_qc_expenses(report: QCReport, sourcing_request: SourcingRequest) -> None:
    rows = []
    if report.lunchCostFlag and report.lunchCost:
        rows.append(
            Expense(
                sisterProfile_id=sourcing_request.sisterProfile_id,
                productId=str(sourcing_request.id),
                sourceType=SourceType.QC_LUNCH,
                amount=report.lunchCost,
                currency="BDT",
                remarks=f"QC lunch cost for {sourcing_request.productName}",
                createdBy=report.createdBy,
            )
        )
    if report.goodsCarryingCost:
        rows.append(
            Expense(
                sisterProfile_id=sourcing_request.sisterProfile_id,
                productId=str(sourcing_request.id),
                sourceType=SourceType.QC_CARRYING,
                amount=report.goodsCarryingCost,
                currency="BDT",
                remarks=f"QC goods carrying cost for {sourcing_request.productName}",
                createdBy=report.createdBy,
            )
        )
    if report.travelMode == TravelMode.TRAVELLING_INDIVIDUALLY and report.extraCost:
        rows.append(
            Expense(
                sisterProfile_id=sourcing_request.sisterProfile_id,
                productId=str(sourcing_request.id),
                sourceType=SourceType.QC_TRAVEL_EXTRA,
                amount=report.extraCost,
                currency="BDT",
                remarks=f"QC travel extra cost for {sourcing_request.productName}",
                createdBy=report.createdBy,
            )
        )
    Expense.objects.bulk_create(rows)

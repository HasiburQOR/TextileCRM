from django.conf import settings
from django.db import models

from core.models import TimeStampedModel, UUIDModel
from core.utils import generate_code
from sourcing.models import SourcingRequest


class TravelMode(models.TextChoices):
    TRAVELLING_WITH_GOODS = "TRAVELLING_WITH_GOODS", "Travelling with goods"
    TRAVELLING_INDIVIDUALLY = "TRAVELLING_INDIVIDUALLY", "Travelling individually"


def _generate_qc_report_id() -> str:
    return generate_code("QC")


class QCReport(UUIDModel, TimeStampedModel):
    reportId = models.CharField(max_length=32, unique=True, default=_generate_qc_report_id)
    request = models.OneToOneField(SourcingRequest, related_name="qcReport", on_delete=models.CASCADE)
    lunchCostFlag = models.BooleanField(default=False)
    lunchCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    goodsCarryingCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    travelMode = models.CharField(max_length=32, choices=TravelMode.choices, default=TravelMode.TRAVELLING_WITH_GOODS)
    extraCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    totalCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    createdBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="qcReports", on_delete=models.CASCADE)

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return self.reportId

    def compute_total(self) -> None:
        lunch = self.lunchCost if self.lunchCostFlag else 0
        extra = self.extraCost if self.travelMode == TravelMode.TRAVELLING_INDIVIDUALLY else 0
        if not self.lunchCostFlag:
            self.lunchCost = 0
        if self.travelMode != TravelMode.TRAVELLING_INDIVIDUALLY:
            self.extraCost = 0
        self.totalCost = lunch + self.goodsCarryingCost + extra

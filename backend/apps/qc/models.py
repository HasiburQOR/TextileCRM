from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel
from apps.core.utils import generate_code
from apps.sourcing.models import Product


def _generate_qc_report_id() -> str:
    return generate_code("QC")


class TravelMode(models.TextChoices):
    TRAVELLING_WITH_GOODS = "travelling_with_goods", "Travelling with Goods"
    TRAVELLING_INDIVIDUALLY = "travelling_individually", "Travelling Individually"


class QCReport(UUIDModel, TimeStampedModel):
    """BR-23–26 / FR-25–29: one QC cost report per approved Product."""

    product = models.OneToOneField(Product, related_name="qcReport", on_delete=models.PROTECT)
    reportId = models.CharField(max_length=32, unique=True, default=_generate_qc_report_id)

    lunchCostFlag = models.BooleanField(default=False)
    lunchCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    goodsCarryingCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    travelMode = models.CharField(max_length=32, choices=TravelMode.choices, default=TravelMode.TRAVELLING_WITH_GOODS)
    extraCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    totalCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    createdBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="qcReports", on_delete=models.PROTECT)

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

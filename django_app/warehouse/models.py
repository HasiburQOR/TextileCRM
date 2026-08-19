import json

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel, UUIDModel
from qc.models import QCReport

CUSTOM_COST_FIELDS = ["labelsCost", "htakeCost", "stickersCost", "cartonsCost", "polyBagsCost", "gamtapeCost"]


class WarehouseCost(UUIDModel, TimeStampedModel):
    qcReport = models.OneToOneField(QCReport, related_name="warehouseCost", on_delete=models.CASCADE)
    loaderCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    extraWorkerCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    labelsCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    htakeCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    stickersCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cartonsCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    polyBagsCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gamtapeCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    totalCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    customCosts = models.TextField(blank=True, default="[]")
    createdBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="warehouseCosts", on_delete=models.CASCADE)

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return f"Warehouse costs for {self.qcReport.reportId}"

    def custom_cost_list(self):
        try:
            return json.loads(self.customCosts or "[]")
        except (json.JSONDecodeError, TypeError):
            return []

    def compute_total(self) -> None:
        fixed_total = (
            self.loaderCost
            + self.extraWorkerCost
            + self.labelsCost
            + self.htakeCost
            + self.stickersCost
            + self.cartonsCost
            + self.polyBagsCost
            + self.gamtapeCost
        )
        custom_total = sum((c.get("amount") or 0) for c in self.custom_cost_list())
        self.totalCost = fixed_total + custom_total

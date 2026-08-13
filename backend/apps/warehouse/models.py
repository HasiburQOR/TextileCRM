from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.core.models import UUIDModel
from apps.qc.models import QCReport

# BR-28 / FR-32: six checkbox-driven packaging cost fields.
PACKAGING_COST_FIELDS = ["labelsCost", "htakeCost", "stickersCost", "cartonsCost", "polyBagsCost", "gamtapeCost"]
PACKAGING_COST_LABELS = {
    "labelsCost": "Labels",
    "htakeCost": "Hangtags",
    "stickersCost": "Stickers",
    "cartonsCost": "Cartons",
    "polyBagsCost": "Poly Bags",
    "gamtapeCost": "Gum Tape",
}


class WarehouseCost(UUIDModel):
    """BR-27–31 / FR-30–33: one per QC Report."""

    qcReport = models.OneToOneField(QCReport, related_name="warehouseCost", on_delete=models.PROTECT)

    loaderCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    extraWorkerCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    labelsCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    htakeCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    stickersCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cartonsCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    polyBagsCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gamtapeCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # BR-29: user-defined name + amount + optional remarks, any number of them.
    # e.g. [{"fieldName": "Fumigation", "amount": 12, "remarks": "..."}]
    customCosts = models.JSONField(default=list, blank=True)

    # BR-30: a simple one-off cost, distinct from a named custom field.
    extraCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    extraCostRemarks = models.CharField(max_length=255, blank=True, default="")

    totalCost = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    createdBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="warehouseCosts", on_delete=models.PROTECT)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return f"Warehouse costs for {self.qcReport.reportId}"

    def compute_total(self) -> None:
        fixed_total = self.loaderCost + self.extraWorkerCost + sum(
            (getattr(self, f) for f in PACKAGING_COST_FIELDS), Decimal("0")
        )
        custom_total = sum((Decimal(str(c.get("amount") or 0)) for c in (self.customCosts or [])), Decimal("0"))
        self.totalCost = fixed_total + custom_total + self.extraCost

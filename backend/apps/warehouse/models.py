from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.buyers.models import SisterProfile
from apps.core.models import UUIDModel
from apps.packing.models import PackingList

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
    """BR-27–31 / FR-30–33: loading, packaging and extra costs for a
    shipment. Recorded directly against a Sister Profile — optionally tied
    to the specific Packing List it was incurred for — rather than gated
    behind a QC Report the way this used to work. The QC step this
    originally chained off of isn't part of the live workflow right now, and
    warehouse costs are a shipment-level expense, not something that should
    wait on a per-product QC pipeline that may never run. Any number of
    these can exist per Sister Profile (e.g. one per shipment/Packing List),
    unlike the old one-per-QC-report constraint."""

    sisterProfile = models.ForeignKey(SisterProfile, related_name="warehouseCosts", on_delete=models.PROTECT)
    # Optional: a cost can be recorded against the Sister Profile generally,
    # before or without a specific Packing List. SET_NULL (not PROTECT/CASCADE)
    # so deleting a Packing List later never takes a recorded cost with it —
    # same reasoning as InvoiceLineItem.packingCarton.
    packingList = models.ForeignKey(
        PackingList, related_name="warehouseCosts", null=True, blank=True, on_delete=models.SET_NULL
    )

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
        return f"Warehouse costs for {self.sisterProfile.poReference or self.sisterProfile_id}"

    def compute_total(self) -> None:
        fixed_total = self.loaderCost + self.extraWorkerCost + sum(
            (getattr(self, f) for f in PACKAGING_COST_FIELDS), Decimal("0")
        )
        custom_total = sum((Decimal(str(c.get("amount") or 0)) for c in (self.customCosts or [])), Decimal("0"))
        self.totalCost = fixed_total + custom_total + self.extraCost

from django.db import models

from apps.buyers.models import BuyerProfile
from apps.core.models import TimeStampedModel, UUIDModel


def generate_packing_list_reference_code() -> str:
    """Only referenced by apps.packing.migrations.0012 as the historical
    default of PackingList.referenceCode (both tables deleted in 0016) —
    kept so that old migration file keeps importing cleanly."""
    from apps.core.utils import generate_reference_code

    return generate_reference_code("PKG")


class PackingRule(UUIDModel, TimeStampedModel):
    """BR-19 / FR-18: reusable units-per-carton (size assortment ratio) +
    default carton dimensions/weight, saved as a template per Buyer Profile."""

    buyerProfile = models.ForeignKey(
        BuyerProfile, related_name="packingRules", null=True, blank=True, on_delete=models.SET_NULL
    )
    name = models.CharField(max_length=255, blank=True, default="")

    # e.g. {"S": 1, "M": 3, "L": 5, "XL": 4, "XXL": 2} — an ordered size -> per-carton-unit ratio.
    sizeRatio = models.JSONField(default=dict)

    # Defaults only — actual cartons can override on a PackingCarton row,
    # since real shipments vary slightly carton to carton (see the sample
    # packing list: 6.90 kg on the first carton row, 6.70 kg on every other).
    cartonLength = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # inches
    cartonWidth = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # inches
    cartonHeight = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # inches
    cartonNetWeight = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # kg
    cartonGrossWeight = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # kg

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name or str(self.id)

    def units_per_carton(self) -> int:
        return sum(int(v) for v in self.sizeRatio.values())



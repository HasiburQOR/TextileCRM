from django.conf import settings
from django.db import models

from buyers.models import SisterProfile
from core.models import UUIDModel


class SourceType(models.TextChoices):
    SOURCING_ADVANCE = "sourcing_advance", "Sourcing Advance"
    QC_LUNCH = "qc_lunch", "QC Lunch"
    QC_CARRYING = "qc_carrying", "QC Carrying"
    QC_TRAVEL_EXTRA = "qc_travel_extra", "QC Travel Extra"
    WAREHOUSE_LOADER = "warehouse_loader", "Warehouse Loader"
    WAREHOUSE_EXTRA_WORKER = "warehouse_extra_worker", "Warehouse Extra Worker"
    WAREHOUSE_PACKAGING_ITEM = "warehouse_packaging_item", "Packaging Item"
    CUSTOM_FIELD = "custom_field", "Custom Field"
    EXTRA_COST = "extra_cost", "Extra Cost"


class Expense(UUIDModel):
    sisterProfile = models.ForeignKey(SisterProfile, related_name="expense_set", on_delete=models.CASCADE)
    productId = models.CharField(max_length=64, null=True, blank=True)
    sourceType = models.CharField(max_length=32, choices=SourceType.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=8, default="BDT")
    remarks = models.CharField(max_length=255, blank=True, default="")
    fieldName = models.CharField(max_length=64, null=True, blank=True)
    createdBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="expenses", on_delete=models.CASCADE)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-createdAt"]
        indexes = [models.Index(fields=["sisterProfile", "sourceType"])]

    def __str__(self):
        return f"{self.sourceType}: {self.amount} {self.currency}"

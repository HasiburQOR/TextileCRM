from django.conf import settings
from django.db import models

from apps.buyers.models import SisterProfile
from apps.core.models import UUIDModel


class SourceType(models.TextChoices):
    """App_Workflow §5: "sourcing advances, QC lunch/carrying/travel costs,
    warehouse loading and packaging costs, custom batch fields, and one-off
    extra costs" — every value below is one of those, named so the
    Settlement Ledger (Phase 5) can group/report by category."""

    SOURCING_ADVANCE = "sourcing_advance", "Sourcing Advance"
    QC_LUNCH = "qc_lunch", "QC Lunch"
    QC_CARRYING = "qc_carrying", "QC Carrying"
    QC_TRAVEL_EXTRA = "qc_travel_extra", "QC Travel Extra"
    WAREHOUSE_LOADER = "warehouse_loader", "Warehouse Loader"
    WAREHOUSE_EXTRA_WORKER = "warehouse_extra_worker", "Warehouse Extra Worker"
    WAREHOUSE_PACKAGING_ITEM = "warehouse_packaging_item", "Warehouse Packaging Item"
    CUSTOM_FIELD = "custom_field", "Custom Cost Field"
    EXTRA_COST = "extra_cost", "Extra Cost"


class Expense(UUIDModel):
    """BR-48 / FR-72: the Central Expense Table. Every cost-producing
    action anywhere in the system writes exactly one row here, via
    `apps.expenses.services.record_expense()` — never a direct
    `Expense.objects.create()` call from another app, so this table can
    never silently miss an entry point."""

    sisterProfile = models.ForeignKey(SisterProfile, related_name="expenses", on_delete=models.PROTECT)
    product = models.ForeignKey(
        "sourcing.Product", related_name="expenses", null=True, blank=True, on_delete=models.SET_NULL
    )
    # Correlates a row back to the specific WarehouseCost that produced it —
    # WarehouseCost isn't 1:1 with anything (several can exist per Sister
    # Profile), so unlike `product` above it can't double as the "which
    # record wrote this" key on its own; this is what delete_expenses()
    # scopes a correction/deletion to, so editing one WarehouseCost entry
    # never touches another's rows for the same Sister Profile.
    warehouseCost = models.ForeignKey(
        "warehouse.WarehouseCost", related_name="expenses", null=True, blank=True, on_delete=models.SET_NULL
    )
    sourceType = models.CharField(max_length=32, choices=SourceType.choices)
    # The cost as it was actually incurred, in the supplier's currency —
    # `currency` defaults to the Sister Profile's supplierCurrency when the
    # caller doesn't name one (see record_expense).
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=8, default="BDT")

    # ── The same cost in the buyer's currency ─────────────────────────────
    # The Buyer Wallet is denominated in the buyer's currency, so every
    # supplier-currency cost is converted on its way in. The rate is copied
    # here and never re-read: re-negotiating the Sister Profile's rate must
    # not silently rewrite what a buyer was already charged, and a refund
    # has to reverse at the rate the original deduction used (see
    # _refund_for_expenses). A NULL rate means no conversion happened —
    # either the profile has no rate yet, or the caller named a currency of
    # its own — in which case the two amounts are equal.
    buyerCurrency = models.CharField(max_length=8, blank=True, default="")
    amountInBuyerCurrency = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    exchangeRateUsed = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)

    remarks = models.CharField(max_length=255, blank=True, default="")
    fieldName = models.CharField(max_length=100, blank=True, default="")  # e.g. which packaging item / custom field name
    createdBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="expenses", on_delete=models.PROTECT)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-createdAt"]
        indexes = [models.Index(fields=["sisterProfile", "sourceType"])]

    def __str__(self):
        return f"{self.sourceType}: {self.amount} {self.currency}"

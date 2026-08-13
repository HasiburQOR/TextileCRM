from django.db import models

from apps.buyers.models import SisterProfile


class SettlementLedger(models.Model):
    """BR-49–51 / FR-74–76: a materialized, one-row-per-Sister-Profile
    ledger, recomputed on every Expense write (see
    apps.ledger.services.recompute_settlement, called from
    apps.expenses.services.record_expense) — not a live SQL view and not a
    nightly batch job, per the migration doc's explicit instruction."""

    sisterProfile = models.OneToOneField(SisterProfile, related_name="settlementLedger", primary_key=True, on_delete=models.CASCADE)
    totalAdvance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    totalExpense = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amountOwed = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    netPosition = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    negativeBalance = models.BooleanField(default=False)
    updatedAt = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Settlement for {self.sisterProfile} (net {self.netPosition})"

from django.conf import settings
from django.db import models

from apps.buyers.models import BuyerProfile, SisterProfile
from apps.core.models import UUIDModel
from apps.expenses.models import Expense


class BuyerWallet(models.Model):
    """Buyer_Wallet_Module.md: one pooled cash wallet per Buyer Profile (not
    per Sister Profile) — distinct from, but fed by, the same Expense table
    as the SettlementLedger (apps.ledger.models). `balance` is never
    hand-edited — it's a materialized SUM(WalletTransaction.amount),
    recomputed on every transaction write by
    apps.wallet.services.recompute_wallet_balance, same pattern as
    SettlementLedger.netPosition."""

    buyerProfile = models.OneToOneField(BuyerProfile, related_name="wallet", primary_key=True, on_delete=models.CASCADE)
    currency = models.CharField(max_length=8, default="USD")

    # Admin-set flat low-balance threshold (one of the two options the spec
    # names — "10% of average monthly spend" is left as a future option).
    # A balance in (0, lowBalanceThreshold] fires the low-balance alert once.
    lowBalanceThreshold = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    negativeBalance = models.BooleanField(default=False)
    lowBalance = models.BooleanField(default=False)

    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Wallet for {self.buyerProfile} (balance {self.balance})"


class WalletTransactionType(models.TextChoices):
    TOP_UP = "top_up", "Top-up"
    DEDUCTION = "deduction", "Deduction"
    REFUND = "refund", "Refund"
    ADJUSTMENT = "adjustment", "Adjustment"


class WalletTransaction(UUIDModel):
    """Append-only — never update or hard-delete a row; corrections are
    always a new reversing/adjusting row (same convention as the Invoice
    Void pattern, BR-46, and the Audit Log's reconstructable-history rule)."""

    wallet = models.ForeignKey(BuyerWallet, related_name="transactions", on_delete=models.CASCADE)
    type = models.CharField(max_length=16, choices=WalletTransactionType.choices)
    # Positive for top_up/refund, negative for deduction; adjustment can be either.
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=8, default="USD")
    # Only set if this transaction's amount required conversion from
    # `currency` to the wallet's base currency — locked permanently at
    # transaction time, same rule as Invoice.exchangeRateValueLocked.
    exchangeRateUsed = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)

    # Free-text, not a hard FK-backed choice: mirrors apps.expenses.models.SourceType
    # values for deductions/refunds, plus "manual_top_up" / "manual_adjustment"
    # for the two Admin-initiated transaction types.
    sourceType = models.CharField(max_length=32, blank=True, default="")
    sourceExpense = models.ForeignKey(
        Expense, related_name="walletTransactions", null=True, blank=True, on_delete=models.SET_NULL
    )
    # Tags which order the spend was for, for reporting/breakdown — the
    # balance itself stays pooled at the buyer level (never split by this).
    sisterProfile = models.ForeignKey(
        SisterProfile, related_name="walletTransactions", null=True, blank=True, on_delete=models.SET_NULL
    )

    methodReference = models.CharField(max_length=255, blank=True, default="")  # required for top-ups
    reason = models.TextField(blank=True, default="")  # required for adjustments and refunds

    createdBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="walletTransactions", on_delete=models.PROTECT)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-createdAt"]
        indexes = [models.Index(fields=["wallet", "createdAt"])]

    def __str__(self):
        return f"{self.type}: {self.amount} {self.currency} on {self.wallet_id}"

from django.conf import settings
from django.db import models

from apps.buyers.models import SisterProfile
from apps.core.models import UUIDModel


class NotificationType(models.TextChoices):
    """BR-58 / FR-84: exactly the five trigger points the spec names,
    plus the BR-50/FR-76 negative-balance alert."""

    TRIP_CLOSED = "trip_closed", "Sourcing Cost Closed"
    REQUEST_APPROVED = "request_approved", "Request Approved"
    REQUEST_REJECTED = "request_rejected", "Request Rejected"
    INVOICE_ISSUED = "invoice_issued", "Invoice Issued"
    PAYMENT_RECORDED = "payment_recorded", "Payment Recorded"
    NEGATIVE_BALANCE_ALERT = "negative_balance_alert", "Negative Balance Alert"
    # Buyer_Wallet_Module.md WF-08: a distinct signal from
    # NEGATIVE_BALANCE_ALERT above — that one is the Settlement Ledger's
    # contractual "amount owed" going negative; these two are the Buyer
    # Wallet's actual cash position.
    WALLET_NEGATIVE_BALANCE = "wallet_negative_balance", "Wallet Negative Balance"
    WALLET_LOW_BALANCE = "wallet_low_balance", "Wallet Low Balance"


class Notification(UUIDModel):
    """In-app delivery only for now (App_Workflow §8 / SRS open question:
    "Notification delivery channel — email vs SMS vs push vs in-app only
    for Phase 1?" — resolved as in-app-only here, per the migration doc's
    "in-app minimum for now" instruction)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="notifications", on_delete=models.CASCADE)
    sisterProfile = models.ForeignKey(
        SisterProfile, related_name="notifications", null=True, blank=True, on_delete=models.SET_NULL
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    type = models.CharField(max_length=32, choices=NotificationType.choices)
    isRead = models.BooleanField(default=False)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return self.title

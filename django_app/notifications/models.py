from django.conf import settings
from django.db import models

from buyers.models import SisterProfile
from core.models import UUIDModel


class NotificationType(models.TextChoices):
    NEW_REQUEST = "NEW_REQUEST", "New Request"
    REQUEST_APPROVED = "REQUEST_APPROVED", "Request Approved"
    REQUEST_REJECTED = "REQUEST_REJECTED", "Request Rejected"
    QC_COMPLETE = "QC_COMPLETE", "QC Complete"
    INVOICE_ISSUED = "INVOICE_ISSUED", "Invoice Issued"
    SETTLEMENT_ALERT = "SETTLEMENT_ALERT", "Settlement Alert"


class Notification(UUIDModel):
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

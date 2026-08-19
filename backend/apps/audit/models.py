from django.conf import settings
from django.db import models

from apps.core.models import UUIDModel


class AuditLogEntry(UUIDModel):
    """BR-57 / FR-82: who changed what, when. Covers, at minimum, cost
    entries (i.e. every Expense write — see apps.expenses.services), the
    Product approval/rejection decision, exchange rate publication, and
    every invoice status action (create/approve/reject/void)."""

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="auditLogEntries", on_delete=models.PROTECT)
    action = models.CharField(max_length=64)
    entityType = models.CharField(max_length=64)
    entityId = models.CharField(max_length=64)
    beforeSnapshot = models.JSONField(default=dict, blank=True)
    afterSnapshot = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["entityType", "entityId"]),
            models.Index(fields=["actor"]),
        ]

    def __str__(self):
        return f"{self.action} {self.entityType}#{self.entityId}"

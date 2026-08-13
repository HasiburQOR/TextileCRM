from django.conf import settings
from django.db import models

from core.models import UUIDModel


class AuditLog(UUIDModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="auditLogs", on_delete=models.CASCADE)
    action = models.CharField(max_length=64)
    entityType = models.CharField(max_length=64)
    entityId = models.CharField(max_length=64)
    beforeSnapshot = models.TextField(blank=True, default="{}")
    afterSnapshot = models.TextField(blank=True, default="{}")
    ipAddress = models.CharField(max_length=64, blank=True, default="")
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.action} {self.entityType}#{self.entityId}"

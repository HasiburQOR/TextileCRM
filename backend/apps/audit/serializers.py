from rest_framework import serializers

from apps.audit.models import AuditLogEntry


class AuditLogEntrySerializer(serializers.ModelSerializer):
    actorName = serializers.CharField(source="actor.display_name", read_only=True)

    class Meta:
        model = AuditLogEntry
        fields = ["id", "actor", "actorName", "action", "entityType", "entityId", "beforeSnapshot", "afterSnapshot", "timestamp"]
        read_only_fields = fields

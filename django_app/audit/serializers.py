from rest_framework import serializers

from audit.models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actorName = serializers.CharField(source="actor.display_name", read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "actor", "actorName", "action", "entityType", "entityId", "beforeSnapshot", "afterSnapshot", "ipAddress", "timestamp"]
        read_only_fields = fields

from rest_framework import serializers

from apps.notifications.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    sisterProfilePoReference = serializers.CharField(source="sisterProfile.poReference", read_only=True, default=None)

    class Meta:
        model = Notification
        fields = ["id", "sisterProfile", "sisterProfilePoReference", "title", "message", "type", "isRead", "createdAt"]
        read_only_fields = fields

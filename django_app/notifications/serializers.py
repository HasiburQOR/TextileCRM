from rest_framework import serializers

from notifications.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "user", "sisterProfile", "title", "message", "type", "isRead", "createdAt"]
        read_only_fields = ["id", "createdAt"]

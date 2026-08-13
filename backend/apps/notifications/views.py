from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.notifications.models import Notification
from apps.notifications.serializers import NotificationSerializer


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """Scoped to the requesting user directly (not via TenantScopedViewSet's
    buyer_profile lookup) — a notification belongs to one User regardless
    of role, staff or buyer alike, so "your own" is simply `user=request.user`."""

    serializer_class = NotificationSerializer
    filterset_fields = ["isRead", "type"]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).select_related("sisterProfile")

    @action(detail=True, methods=["patch"])
    def read(self, request, pk=None):
        notification = self.get_object()
        notification.isRead = True
        notification.save(update_fields=["isRead"])
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        self.get_queryset().filter(isRead=False).update(isRead=True)
        return Response({"status": "ok"})

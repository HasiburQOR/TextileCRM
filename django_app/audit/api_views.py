from rest_framework import viewsets

from accounts.permissions import IsAdmin
from audit.models import AuditLog
from audit.serializers import AuditLogSerializer


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = AuditLog.objects.select_related("actor")
        entity_type = self.request.query_params.get("entityType")
        actor_id = self.request.query_params.get("actorId")
        if entity_type:
            qs = qs.filter(entityType=entity_type)
        if actor_id:
            qs = qs.filter(actor_id=actor_id)
        return qs.order_by("-timestamp")[:200]

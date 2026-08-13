from rest_framework import viewsets

from apps.accounts.permissions import IsAdmin
from apps.audit.models import AuditLogEntry
from apps.audit.serializers import AuditLogEntrySerializer


class AuditLogEntryViewSet(viewsets.ReadOnlyModelViewSet):
    """FR-83: Admin-viewable and filterable by entity, actor, and date
    range. Not exposed to Buyer Portal in Phase 1 — IsAdmin, not
    IsSupplierStaff, so even other supplier roles can't read it."""

    queryset = AuditLogEntry.objects.select_related("actor")
    serializer_class = AuditLogEntrySerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        entity_type = self.request.query_params.get("entityType")
        actor_id = self.request.query_params.get("actor")
        date_from = self.request.query_params.get("dateFrom")
        date_to = self.request.query_params.get("dateTo")
        if entity_type:
            qs = qs.filter(entityType=entity_type)
        if actor_id:
            qs = qs.filter(actor_id=actor_id)
        if date_from:
            qs = qs.filter(timestamp__date__gte=date_from)
        if date_to:
            qs = qs.filter(timestamp__date__lte=date_to)
        return qs

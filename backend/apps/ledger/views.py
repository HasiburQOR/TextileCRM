from rest_framework import viewsets

from apps.core.tenancy import TenantScopedViewSet
from apps.ledger.models import SettlementLedger
from apps.ledger.serializers import SettlementLedgerSerializer


class SettlementLedgerViewSet(TenantScopedViewSet, viewsets.ReadOnlyModelViewSet):
    """BR-49–51 / FR-74–76: always derived, never hand-edited — no
    create/update/delete endpoint exists here at all, only the recompute
    triggered from apps.expenses.services.record_expense."""

    queryset = SettlementLedger.objects.select_related("sisterProfile__buyerProfile")
    serializer_class = SettlementLedgerSerializer
    tenant_lookup = "sisterProfile__buyerProfile_id"
    lookup_field = "sisterProfile_id"
    lookup_url_kwarg = "sisterProfile_id"

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.accounts.models import Roles
from apps.accounts.permissions import IsAdmin
from apps.buyers.models import BuyerProfile, SisterProfile
from apps.buyers.serializers import (
    BuyerProfileSelfSerializer,
    BuyerProfileSerializer,
    SisterProfileSelfSerializer,
    SisterProfileSerializer,
)
from apps.core.tenancy import TenantScopedViewSet

WRITE_ACTIONS = ("create", "update", "partial_update", "destroy")


class BuyerProfileViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """BR-01/BR-04: managed entirely by Admin; every other authenticated
    role may read (staff read everything, a buyer-role user only ever sees
    their own row via tenant scoping — this IS the tenant root, so the
    lookup path to itself is just "id")."""

    queryset = BuyerProfile.objects.all()
    tenant_lookup = "id"

    def get_serializer_class(self):
        if self.request.user.role == Roles.BUYER:
            return BuyerProfileSelfSerializer
        return BuyerProfileSerializer

    def get_permissions(self):
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        return [IsAuthenticated()]


class SisterProfileViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """BR-02/BR-03: one per PO/shipment, created by Admin with its Agreement
    Type + rate. Readable by all supplier staff; a buyer-role user only
    ever sees Sister Profiles under their own BuyerProfile."""

    queryset = SisterProfile.objects.select_related("buyerProfile").all()
    tenant_lookup = "buyerProfile_id"

    def get_serializer_class(self):
        if self.request.user.role == Roles.BUYER:
            return SisterProfileSelfSerializer
        return SisterProfileSerializer

    def get_permissions(self):
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        return [IsAuthenticated()]

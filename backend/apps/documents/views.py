from rest_framework import viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import IsAdmin, IsSupplierStaff
from apps.core.tenancy import TenantScopedViewSet
from apps.documents.models import DocumentVaultItem
from apps.documents.serializers import DocumentVaultItemSerializer


class DocumentVaultItemViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """BR-59 / FR-85. Any supplier-staff role may upload (documents come
    from many places — QC photos from QC, invoices from Employee, POs and
    contracts typically from Admin/Company Rep) — not restricted to one
    role the way product/QC/warehouse creation is."""

    queryset = DocumentVaultItem.objects.select_related("sisterProfile__buyerProfile", "uploadedBy")
    serializer_class = DocumentVaultItemSerializer
    tenant_lookup = "sisterProfile__buyerProfile_id"
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_permissions(self):
        if self.action == "create":
            return [IsSupplierStaff()]
        if self.action == "destroy":
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        sister_profile_id = self.request.query_params.get("sisterProfile")
        if sister_profile_id:
            qs = qs.filter(sisterProfile_id=sister_profile_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(uploadedBy=self.request.user)

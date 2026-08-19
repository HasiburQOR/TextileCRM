from rest_framework import viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated

from documents.models import DocumentVault
from documents.serializers import DocumentVaultSerializer


class DocumentVaultViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentVaultSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = DocumentVault.objects.select_related("sisterProfile", "uploadedBy")
        sister_profile_id = self.request.query_params.get("sisterProfileId")
        if sister_profile_id:
            qs = qs.filter(sisterProfile_id=sister_profile_id)
        return qs.order_by("-createdAt")

    def perform_create(self, serializer):
        serializer.save(uploadedBy=self.request.user)

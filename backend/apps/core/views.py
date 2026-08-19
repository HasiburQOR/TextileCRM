from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.core.models import CompanyProfile
from apps.core.serializers import CompanyProfileSerializer


class CompanyProfileView(APIView):
    """Our own company identity + bank details, as printed on every
    Commercial Invoice / Packing List.

    Readable by any authenticated user (the invoice screen warns when it's
    incomplete, and buyers see this information on their invoices anyway);
    writable by Admin only — these are the bank details money gets wired
    to, so this is the narrowest permission in the app after user
    management.

    A plain APIView rather than a ViewSet: there is exactly one row, so
    list/create/detail routing would be three lies about the resource.
    """

    parser_classes = [MultiPartParser, FormParser, JSONParser]  # MultiPart for the logo upload

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH"):
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get(self, request):
        return Response(CompanyProfileSerializer(CompanyProfile.load()).data)

    def put(self, request):
        return self._update(request, partial=False)

    def patch(self, request):
        return self._update(request, partial=True)

    def _update(self, request, *, partial: bool):
        profile = CompanyProfile.load()
        serializer = CompanyProfileSerializer(profile, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save(updatedBy=request.user)

        # FR-82: the bank account customers pay into is exactly the kind of
        # field that must never change without a trail.
        from apps.audit.services import log_action

        log_action(
            actor=request.user, action="UPDATE_COMPANY_PROFILE", entity_type="CompanyProfile",
            entity_id=profile.pk, after={k: str(v) for k, v in serializer.validated_data.items()},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

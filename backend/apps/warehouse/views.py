from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Roles
from apps.accounts.permissions import IsAdmin, IsRole
from apps.buyers.models import SisterProfile
from apps.core.tenancy import TenantScopedViewSet
from apps.packing.models import PackingList
from apps.warehouse import services
from apps.warehouse.models import PACKAGING_COST_FIELDS, WarehouseCost
from apps.warehouse.serializers import WarehouseCostSelfSerializer, WarehouseCostSerializer

WRITE_ACTIONS = ("update", "partial_update", "destroy")


class WarehouseCostViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    queryset = WarehouseCost.objects.select_related("sisterProfile__buyerProfile", "packingList", "createdBy")
    tenant_lookup = "sisterProfile__buyerProfile_id"
    allowed_roles = [Roles.WAREHOUSE]
    # PUT excluded deliberately — see QCReportViewSet for the same note.
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.request.user.role == Roles.BUYER:
            return WarehouseCostSelfSerializer
        return WarehouseCostSerializer

    def get_permissions(self):
        if self.action == "create":
            return [IsRole()]
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        sister_profile_id = self.request.query_params.get("sisterProfile")
        if sister_profile_id:
            qs = qs.filter(sisterProfile_id=sister_profile_id)
        packing_list_id = self.request.query_params.get("packingList")
        if packing_list_id:
            qs = qs.filter(packingList_id=packing_list_id)
        return qs

    def create(self, request, *args, **kwargs):
        data = request.data
        sister_profile = SisterProfile.objects.filter(pk=data.get("sisterProfile")).first()
        if not sister_profile:
            raise DRFValidationError({"sisterProfile": "Not found."})
        packing_list = None
        if data.get("packingList"):
            packing_list = PackingList.objects.filter(pk=data["packingList"]).first()
            if not packing_list:
                raise DRFValidationError({"packingList": "Not found."})
        cost_fields = {f: data.get(f) or 0 for f in ["loaderCost", "extraWorkerCost", *PACKAGING_COST_FIELDS]}
        try:
            wc = services.create_warehouse_cost(
                sister_profile=sister_profile,
                packing_list=packing_list,
                created_by=request.user,
                custom_costs=data.get("customCosts") or [],
                extra_cost=data.get("extraCost") or 0,
                extra_cost_remarks=data.get("extraCostRemarks", ""),
                **cost_fields,
            )
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(self.get_serializer(wc).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        wc = self.get_object()
        data = request.data
        cost_fields = {f: data.get(f, getattr(wc, f)) or 0 for f in ["loaderCost", "extraWorkerCost", *PACKAGING_COST_FIELDS]}
        try:
            wc = services.update_warehouse_cost(
                wc,
                updated_by=request.user,
                custom_costs=data.get("customCosts", wc.customCosts),
                extra_cost=data.get("extraCost", wc.extraCost) or 0,
                extra_cost_remarks=data.get("extraCostRemarks", wc.extraCostRemarks),
                **cost_fields,
            )
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(self.get_serializer(wc).data)

    def destroy(self, request, *args, **kwargs):
        wc = self.get_object()
        services.delete_warehouse_cost(wc, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

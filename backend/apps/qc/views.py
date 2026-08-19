from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Roles
from apps.accounts.permissions import IsAdmin, IsRole
from apps.core.tenancy import TenantScopedViewSet
from apps.qc import services
from apps.qc.models import QCReport
from apps.qc.serializers import QCReportSelfSerializer, QCReportSerializer
from apps.sourcing.models import Product

WRITE_ACTIONS = ("update", "partial_update", "destroy")


class QCReportViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    queryset = QCReport.objects.select_related("product__sisterProfile__buyerProfile", "createdBy")
    tenant_lookup = "product__sisterProfile__buyerProfile_id"
    allowed_roles = [Roles.QC]
    # PUT excluded deliberately — edits go through partial_update (PATCH)
    # only, since update_qc_report() expects a full field set it computes
    # itself, not an arbitrary partial replace.
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.request.user.role == Roles.BUYER:
            return QCReportSelfSerializer
        return QCReportSerializer

    def get_permissions(self):
        if self.action == "create":
            return [IsRole()]
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        product_id = self.request.query_params.get("product")
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs

    def create(self, request, *args, **kwargs):
        data = request.data
        product = Product.objects.filter(pk=data.get("product")).first()
        if not product:
            raise DRFValidationError({"product": "Not found."})
        try:
            report = services.create_qc_report(
                product=product,
                created_by=request.user,
                lunch_cost_flag=bool(data.get("lunchCostFlag")),
                lunch_cost=data.get("lunchCost") or 0,
                goods_carrying_cost=data.get("goodsCarryingCost") or 0,
                travel_mode=data.get("travelMode", "travelling_with_goods"),
                extra_cost=data.get("extraCost") or 0,
            )
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(self.get_serializer(report).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        report = self.get_object()
        data = request.data
        try:
            report = services.update_qc_report(
                report,
                updated_by=request.user,
                lunch_cost_flag=bool(data.get("lunchCostFlag", report.lunchCostFlag)),
                lunch_cost=data.get("lunchCost", report.lunchCost),
                goods_carrying_cost=data.get("goodsCarryingCost", report.goodsCarryingCost),
                travel_mode=data.get("travelMode", report.travelMode),
                extra_cost=data.get("extraCost", report.extraCost),
            )
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(self.get_serializer(report).data)

    def destroy(self, request, *args, **kwargs):
        report = self.get_object()
        try:
            services.delete_qc_report(report)
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(status=status.HTTP_204_NO_CONTENT)

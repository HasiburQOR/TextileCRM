from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from qc.models import QCReport
from qc.serializers import QCReportSerializer
from qc.services import create_qc_report
from sourcing.models import SourcingRequest


class QCReportViewSet(viewsets.ModelViewSet):
    serializer_class = QCReportSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = QCReport.objects.select_related("request", "createdBy", "warehouseCost")
        request_id = self.request.query_params.get("requestId")
        if request_id:
            qs = qs.filter(request_id=request_id)
        return qs.order_by("-createdAt")

    def create(self, request, *args, **kwargs):
        data = request.data
        sourcing_request = SourcingRequest.objects.filter(pk=data.get("requestId") or data.get("request")).first()
        if not sourcing_request:
            raise ValidationError({"requestId": "Sourcing request not found."})
        try:
            report = create_qc_report(
                sourcing_request=sourcing_request,
                created_by=request.user,
                lunch_cost_flag=bool(data.get("lunchCostFlag")),
                lunch_cost=data.get("lunchCost") or 0,
                goods_carrying_cost=data.get("goodsCarryingCost") or 0,
                travel_mode=data.get("travelMode", "TRAVELLING_WITH_GOODS"),
                extra_cost=data.get("extraCost") or 0,
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.message if hasattr(exc, "message") else str(exc))
        return Response(self.get_serializer(report).data, status=201)

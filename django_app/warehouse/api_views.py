from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from qc.models import QCReport
from warehouse.models import CUSTOM_COST_FIELDS, WarehouseCost
from warehouse.serializers import WarehouseCostSerializer
from warehouse.services import create_warehouse_cost


class WarehouseCostViewSet(viewsets.ModelViewSet):
    serializer_class = WarehouseCostSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = WarehouseCost.objects.select_related("qcReport__request", "createdBy")
        qc_report_id = self.request.query_params.get("qcReportId")
        if qc_report_id:
            qs = qs.filter(qcReport_id=qc_report_id)
        return qs.order_by("-createdAt")

    def create(self, request, *args, **kwargs):
        data = request.data
        qc_report = QCReport.objects.filter(pk=data.get("qcReportId") or data.get("qcReport")).first()
        if not qc_report:
            raise ValidationError({"qcReportId": "QC report not found."})
        cost_fields = {f: data.get(f) or 0 for f in [
            "loaderCost", "extraWorkerCost", *CUSTOM_COST_FIELDS,
        ]}
        try:
            wc = create_warehouse_cost(
                qc_report=qc_report,
                created_by=request.user,
                custom_costs=data.get("customCosts"),
                **cost_fields,
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.message if hasattr(exc, "message") else str(exc))
        return Response(self.get_serializer(wc).data, status=201)

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from packing.models import PackingList
from packing.serializers import PackingListSerializer
from packing.services import create_packing_list
from sourcing.models import SourcingRequest


class PackingListViewSet(viewsets.ModelViewSet):
    serializer_class = PackingListSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = PackingList.objects.select_related("request").prefetch_related("cartons")
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
            pl = create_packing_list(
                sourcing_request=sourcing_request,
                order_qty=data.get("orderQty") or 0,
                shipment_qty=data.get("shipmentQty") or 0,
                front_mark=data.get("frontMark", ""),
                side_mark=data.get("sideMark", ""),
                cartons=data.get("cartons") or [],
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.message if hasattr(exc, "message") else str(exc))
        return Response(self.get_serializer(pl).data, status=201)

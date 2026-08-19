from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from trips.models import LocationStatus, SourcingTrip, TripLocation, TripStatus
from trips.serializers import SourcingTripSerializer, TripLocationSerializer


class SourcingTripViewSet(viewsets.ModelViewSet):
    queryset = SourcingTrip.objects.select_related("request", "closedBy").prefetch_related("locations")
    serializer_class = SourcingTripSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        request_id = self.request.query_params.get("requestId")
        if request_id:
            qs = qs.filter(request_id=request_id)
        return qs.order_by("-createdAt")

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        trip = self.get_object()
        if trip.status == TripStatus.CLOSED:
            return Response({"detail": "Trip is already closed."}, status=409)
        total = trip.locations.aggregate(total=Sum("advanceAmount"))["total"] or Decimal("0")
        trip.totalAdvance = total
        trip.status = TripStatus.CLOSED
        trip.closedAt = timezone.now()
        trip.closedBy = request.user
        trip.save(update_fields=["totalAdvance", "status", "closedAt", "closedBy", "updatedAt"])
        return Response(self.get_serializer(trip).data)


class TripLocationViewSet(viewsets.ModelViewSet):
    serializer_class = TripLocationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return TripLocation.objects.filter(sourcingTrip_id=self.kwargs["trip_pk"]).order_by("date")

    def perform_create(self, serializer):
        trip = SourcingTrip.objects.get(pk=self.kwargs["trip_pk"])
        if trip.status == TripStatus.CLOSED:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("Cannot add locations to a closed trip.")
        serializer.save(sourcingTrip=trip, status=LocationStatus.PENDING)

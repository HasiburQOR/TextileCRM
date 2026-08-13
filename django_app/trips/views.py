from decimal import Decimal

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Sum
from django.http import HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from audit.utils import client_ip, log_action
from sourcing.models import RequestStatus, SourcingRequest
from trips.models import LocationStatus, SourcingTrip, TripLocation, TripStatus


@login_required
def trip_list(request):
    trips = (
        SourcingTrip.objects.select_related("request", "closedBy")
        .prefetch_related("locations")
        .order_by("-createdAt")
    )
    trip_request_ids = trips.values_list("request_id", flat=True)
    available_requests = SourcingRequest.objects.filter(status=RequestStatus.APPROVED_FOR_QC).exclude(id__in=trip_request_ids)
    return render(request, "trips/trip_list.html", {"trips": trips, "available_requests": available_requests})


@login_required
def create_trip(request):
    if request.method != "POST":
        return redirect("trips:list")
    req = get_object_or_404(SourcingRequest, pk=request.POST.get("requestId"))
    trip = SourcingTrip.objects.create(request=req, status=TripStatus.OPEN)

    names = request.POST.getlist("loc_name")
    qtys = request.POST.getlist("loc_qty")
    advances = request.POST.getlist("loc_advance")
    dates = request.POST.getlist("loc_date")
    for i in range(len(names)):
        if not names[i]:
            continue
        TripLocation.objects.create(
            sourcingTrip=trip,
            locationName=names[i],
            quantity=int(qtys[i]) if i < len(qtys) and qtys[i].isdigit() else 0,
            advanceAmount=advances[i] if i < len(advances) and advances[i] else 0,
            date=parse_datetime(dates[i]) if i < len(dates) and dates[i] else timezone.now(),
            status=LocationStatus.PENDING,
        )
    log_action(request.user, "CREATE_TRIP", "SourcingTrip", trip.id, after={"requestId": str(req.id)}, ip_address=client_ip(request))
    messages.success(request, "Sourcing trip created.")
    return redirect("trips:list")


@login_required
def close_trip(request, pk):
    trip = get_object_or_404(SourcingTrip, pk=pk)
    if request.method == "POST":
        if trip.status == TripStatus.CLOSED:
            messages.error(request, "Trip is already closed.")
            return redirect("trips:list")
        total = trip.locations.aggregate(total=Sum("advanceAmount"))["total"] or Decimal("0")
        trip.totalAdvance = total
        trip.status = TripStatus.CLOSED
        trip.closedAt = timezone.now()
        trip.closedBy = request.user
        trip.save(update_fields=["totalAdvance", "status", "closedAt", "closedBy", "updatedAt"])
        log_action(request.user, "CLOSE_TRIP", "SourcingTrip", trip.id, after={"totalAdvance": float(trip.totalAdvance)}, ip_address=client_ip(request))
        messages.success(request, "Trip closed.")
    return redirect("trips:list")


@login_required
def report_location(request, pk, loc_pk):
    location = get_object_or_404(TripLocation, pk=loc_pk, sourcingTrip_id=pk)
    if location.sourcingTrip.status == TripStatus.CLOSED:
        return HttpResponseForbidden("Trip is closed.")
    if request.method == "POST":
        location.status = LocationStatus.REPORTED
        location.save(update_fields=["status", "updatedAt"])
    if request.htmx:
        return render(request, "trips/_location_row.html", {"loc": location})
    return redirect("trips:list")

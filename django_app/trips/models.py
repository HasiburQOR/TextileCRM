from django.conf import settings
from django.db import models

from core.models import TimeStampedModel, UUIDModel
from sourcing.models import SourcingRequest


class TripStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    CLOSED = "CLOSED", "Closed"


class LocationStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    REPORTED = "REPORTED", "Reported"


class SourcingTrip(UUIDModel, TimeStampedModel):
    request = models.ForeignKey(SourcingRequest, related_name="sourcingTrips", on_delete=models.CASCADE)
    status = models.CharField(max_length=16, choices=TripStatus.choices, default=TripStatus.OPEN)
    totalAdvance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    closedAt = models.DateTimeField(null=True, blank=True)
    closedBy = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="closedTrips", null=True, blank=True, on_delete=models.SET_NULL
    )

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return f"Trip for {self.request.productName} [{self.status}]"


class TripLocation(UUIDModel, TimeStampedModel):
    sourcingTrip = models.ForeignKey(SourcingTrip, related_name="locations", on_delete=models.CASCADE)
    locationName = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=0)
    advanceAmount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=16, choices=LocationStatus.choices, default=LocationStatus.PENDING)
    date = models.DateTimeField()

    class Meta:
        ordering = ["date"]

    def __str__(self):
        return f"{self.locationName} ({self.status})"

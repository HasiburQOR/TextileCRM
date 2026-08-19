from django.contrib import admin

from trips.models import SourcingTrip, TripLocation


class TripLocationInline(admin.TabularInline):
    model = TripLocation
    extra = 0


@admin.register(SourcingTrip)
class SourcingTripAdmin(admin.ModelAdmin):
    list_display = ("request", "status", "totalAdvance", "closedAt")
    list_filter = ("status",)
    inlines = [TripLocationInline]

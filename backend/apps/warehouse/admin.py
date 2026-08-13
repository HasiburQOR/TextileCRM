from django.contrib import admin

from apps.warehouse.models import WarehouseCost


@admin.register(WarehouseCost)
class WarehouseCostAdmin(admin.ModelAdmin):
    list_display = ("qcReport", "totalCost", "createdBy", "createdAt")

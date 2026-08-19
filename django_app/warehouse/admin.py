from django.contrib import admin

from warehouse.models import WarehouseCost


@admin.register(WarehouseCost)
class WarehouseCostAdmin(admin.ModelAdmin):
    list_display = ("qcReport", "totalCost", "createdBy", "createdAt")

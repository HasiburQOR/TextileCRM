from django.contrib import admin

from packing.models import PackingCarton, PackingList


class PackingCartonInline(admin.TabularInline):
    model = PackingCarton
    extra = 0


@admin.register(PackingList)
class PackingListAdmin(admin.ModelAdmin):
    list_display = ("request", "orderQty", "shipmentQty", "totalCbm", "createdAt")
    inlines = [PackingCartonInline]

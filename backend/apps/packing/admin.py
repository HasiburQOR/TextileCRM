from django.contrib import admin

from apps.packing.models import PackingCarton, PackingList, PackingRule


@admin.register(PackingRule)
class PackingRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "buyerProfile", "createdAt")


class PackingCartonInline(admin.TabularInline):
    model = PackingCarton
    extra = 0


@admin.register(PackingList)
class PackingListAdmin(admin.ModelAdmin):
    list_display = ("poNo", "sisterProfile", "totalCartonQty", "totalCbm", "createdAt")
    inlines = [PackingCartonInline]

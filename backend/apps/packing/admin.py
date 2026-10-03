from django.contrib import admin

from apps.packing.models import PackingRule


@admin.register(PackingRule)
class PackingRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "buyerProfile", "createdAt")

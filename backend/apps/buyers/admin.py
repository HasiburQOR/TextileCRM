from django.contrib import admin

from apps.buyers.models import BuyerProfile, SisterProfile


@admin.register(BuyerProfile)
class BuyerProfileAdmin(admin.ModelAdmin):
    list_display = ("name", "createdAt")
    search_fields = ("name",)


@admin.register(SisterProfile)
class SisterProfileAdmin(admin.ModelAdmin):
    list_display = ("poReference", "buyerProfile", "agreementType", "status", "createdAt")
    list_filter = ("agreementType", "status")

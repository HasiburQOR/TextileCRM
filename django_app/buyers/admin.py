from django.contrib import admin

from buyers.models import BuyerProfile, SisterProfile


@admin.register(BuyerProfile)
class BuyerProfileAdmin(admin.ModelAdmin):
    list_display = ("name", "portalUsername", "createdAt")
    search_fields = ("name", "portalUsername")


@admin.register(SisterProfile)
class SisterProfileAdmin(admin.ModelAdmin):
    list_display = ("name", "buyerProfile", "agreementType", "negotiatedRate", "status")
    list_filter = ("agreementType", "status")
    search_fields = ("name", "poReference")

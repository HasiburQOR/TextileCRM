from django.contrib import admin

from sourcing.models import SourcingRequest, SourcingVariant


class SourcingVariantInline(admin.TabularInline):
    model = SourcingVariant
    extra = 0


@admin.register(SourcingRequest)
class SourcingRequestAdmin(admin.ModelAdmin):
    list_display = ("productName", "styleNumber", "status", "brandName", "createdBy", "createdAt")
    list_filter = ("status", "brandName")
    search_fields = ("productName", "styleNumber")
    inlines = [SourcingVariantInline]

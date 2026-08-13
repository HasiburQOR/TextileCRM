from django.contrib import admin

from apps.sourcing.models import Product, ProductImage, ProductVariant, SourcingLocationEntry, SourcingTrip


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "styleNumber", "status", "brandName", "sisterProfile", "createdBy", "createdAt")
    list_filter = ("status", "brandName")
    search_fields = ("name", "styleNumber", "poNo")
    inlines = [ProductVariantInline, ProductImageInline]


class SourcingLocationEntryInline(admin.TabularInline):
    model = SourcingLocationEntry
    extra = 0


@admin.register(SourcingTrip)
class SourcingTripAdmin(admin.ModelAdmin):
    list_display = ("product", "status", "fullPaymentConfirmedAt", "createdAt")
    list_filter = ("status",)
    inlines = [SourcingLocationEntryInline]

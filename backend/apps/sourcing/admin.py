from django.contrib import admin

from apps.sourcing.models import (
    FieldGroup,
    Product,
    ProductImage,
    ProductTemplate,
    ProductTemplateField,
    ProductVariant,
    SourcingCost,
    SourcingCostItem,
    TemplateField,
)


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


class SourcingCostItemInline(admin.TabularInline):
    model = SourcingCostItem
    extra = 0


@admin.register(SourcingCost)
class SourcingCostAdmin(admin.ModelAdmin):
    list_display = ("sisterProfile", "status", "fullPaymentConfirmedAt", "createdAt")
    list_filter = ("status",)
    inlines = [SourcingCostItemInline]


@admin.register(FieldGroup)
class FieldGroupAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(TemplateField)
class TemplateFieldAdmin(admin.ModelAdmin):
    list_display = ("label", "fieldKey", "fieldType", "isRequired", "fieldGroup")
    list_filter = ("fieldType", "fieldGroup")
    search_fields = ("label", "fieldKey")


class ProductTemplateFieldInline(admin.TabularInline):
    model = ProductTemplateField
    extra = 0


@admin.register(ProductTemplate)
class ProductTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "isActive", "createdBy", "createdAt")
    list_filter = ("isActive",)
    search_fields = ("name",)
    inlines = [ProductTemplateFieldInline]

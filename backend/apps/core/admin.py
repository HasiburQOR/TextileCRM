from django.contrib import admin

from apps.core.models import CompanyProfile


@admin.register(CompanyProfile)
class CompanyProfileAdmin(admin.ModelAdmin):
    """Singleton — no add/delete, only edit the one row."""

    list_display = ["name", "bankName", "updatedAt"]
    fieldsets = [
        ("Letterhead", {"fields": ["name", "tagline", "logo", "addressLine", "email", "phone", "registrationNo"]}),
        ("Bank details", {"fields": ["bankName", "bankAccountTitle", "bankAccountNo", "bankSwiftCode", "bankAddress"]}),
    ]

    def has_add_permission(self, request):
        return not CompanyProfile.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

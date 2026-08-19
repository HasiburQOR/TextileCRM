from django.contrib import admin

from apps.documents.models import DocumentVaultItem


@admin.register(DocumentVaultItem)
class DocumentVaultItemAdmin(admin.ModelAdmin):
    list_display = ("fileName", "sisterProfile", "documentType", "uploadedBy", "createdAt")
    list_filter = ("documentType",)

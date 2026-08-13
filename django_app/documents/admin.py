from django.contrib import admin

from documents.models import DocumentVault


@admin.register(DocumentVault)
class DocumentVaultAdmin(admin.ModelAdmin):
    list_display = ("fileName", "sisterProfile", "documentType", "uploadedBy", "createdAt")
    list_filter = ("documentType",)

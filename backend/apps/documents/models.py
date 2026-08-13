from django.conf import settings
from django.db import models

from apps.buyers.models import SisterProfile
from apps.core.models import UUIDModel


class DocumentType(models.TextChoices):
    PO = "po", "Purchase Order"
    CONTRACT = "contract", "Contract"
    INVOICE = "invoice", "Invoice"
    PACKING_LIST = "packing_list", "Packing List"
    QC_PHOTO = "qc_photo", "QC Photo"
    OTHER = "other", "Other"


class DocumentVaultItem(UUIDModel):
    """BR-59 / FR-85: POs, contracts, invoices, packing lists, and QC
    photos, stored together per Sister Profile."""

    sisterProfile = models.ForeignKey(SisterProfile, related_name="documents", on_delete=models.CASCADE)
    documentType = models.CharField(max_length=16, choices=DocumentType.choices, default=DocumentType.OTHER)
    file = models.FileField(upload_to="document_vault/%Y/%m/")
    fileName = models.CharField(max_length=255, blank=True, default="")
    fileSize = models.PositiveIntegerField(default=0)
    uploadedBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="uploadedDocuments", on_delete=models.PROTECT)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return self.fileName or str(self.id)

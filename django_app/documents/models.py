from django.conf import settings
from django.db import models

from buyers.models import SisterProfile
from core.models import UUIDModel


class DocumentType(models.TextChoices):
    INVOICE = "INVOICE", "Invoice"
    PACKING_LIST = "PACKING_LIST", "Packing List"
    AGREEMENT = "AGREEMENT", "Agreement"
    QC_REPORT = "QC_REPORT", "QC Report"
    OTHER = "OTHER", "Other"


class DocumentVault(UUIDModel):
    sisterProfile = models.ForeignKey(SisterProfile, related_name="documentVaults", on_delete=models.CASCADE)
    documentType = models.CharField(max_length=32, choices=DocumentType.choices, default=DocumentType.OTHER)
    file = models.FileField(upload_to="documents/%Y/%m/")
    fileName = models.CharField(max_length=255, blank=True, default="")
    fileSize = models.PositiveIntegerField(default=0)
    uploadedBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="documentVaults", on_delete=models.CASCADE)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return self.fileName or str(self.id)

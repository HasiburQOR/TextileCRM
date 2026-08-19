import json

from django.conf import settings
from django.db import models

from buyers.models import SisterProfile
from core.models import TimeStampedModel, UUIDModel
from core.utils import generate_style_number


class RequestStatus(models.TextChoices):
    PENDING_ADMIN_APPROVAL = "PENDING_ADMIN_APPROVAL", "Pending Approval"
    APPROVED_FOR_QC = "APPROVED_FOR_QC", "Approved for QC"
    REJECTED = "REJECTED", "Rejected"


class SourcingRequest(UUIDModel, TimeStampedModel):
    productName = models.CharField(max_length=255)
    photoUrl = models.CharField(max_length=1024, blank=True, default="")
    packingListNotes = models.TextField(blank=True, default="")
    status = models.CharField(max_length=32, choices=RequestStatus.choices, default=RequestStatus.PENDING_ADMIN_APPROVAL)
    rejectionReason = models.TextField(blank=True, default="")
    createdBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="createdRequests", on_delete=models.CASCADE)
    reviewedBy = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="reviewedRequests", null=True, blank=True, on_delete=models.SET_NULL
    )
    reviewedAt = models.DateTimeField(null=True, blank=True)

    # Phase 2
    sisterProfile = models.ForeignKey(
        SisterProfile, related_name="sourcingRequests", null=True, blank=True, on_delete=models.SET_NULL
    )
    brandName = models.CharField(max_length=255, blank=True, default="NA")
    styleNumber = models.CharField(max_length=64, unique=True, default=generate_style_number)
    goodsName = models.CharField(max_length=255, blank=True, default="")
    fabricDetails = models.TextField(blank=True, default="")
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    productQrGenerated = models.BooleanField(default=False)
    cartonQrGenerated = models.BooleanField(default=False)
    imageUrls = models.TextField(blank=True, default="[]")

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return f"{self.productName} ({self.styleNumber})"

    def image_url_list(self):
        try:
            return json.loads(self.imageUrls or "[]")
        except (json.JSONDecodeError, TypeError):
            return []

    def variants_json(self) -> str:
        return json.dumps(
            [
                {
                    "styleNo": v.styleNo,
                    "color": v.color,
                    "itemNumber": v.itemNumber,
                    "size": v.size,
                    "qtyOrdered": v.qtyOrdered,
                }
                for v in self.variants.all()
            ]
        )


class SourcingVariant(UUIDModel, TimeStampedModel):
    request = models.ForeignKey(SourcingRequest, related_name="variants", on_delete=models.CASCADE)
    styleNo = models.CharField(max_length=255, blank=True, default="")
    buyer = models.CharField(max_length=255, blank=True, default="")
    poNo = models.CharField(max_length=255, blank=True, default="")
    color = models.CharField(max_length=255, blank=True, default="")
    itemNumber = models.CharField(max_length=255, blank=True, default="")
    size = models.CharField(max_length=64, blank=True, default="")
    qtyOrdered = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["createdAt"]

    def __str__(self):
        return f"{self.styleNo} / {self.color} / {self.size}"

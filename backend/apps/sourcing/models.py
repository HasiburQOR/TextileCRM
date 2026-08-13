import time
import random
import string

from django.conf import settings
from django.db import models

from apps.buyers.models import SisterProfile
from apps.core.models import TimeStampedModel, UUIDModel


def generate_style_number() -> str:
    """Auto-generated unique Style Number (BR-06 / FR-08)."""
    ms = int(time.time() * 1000)
    rand = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))
    return f"STY-{ms}-{rand}"


class ProductStatus(models.TextChoices):
    """Full lifecycle per SRS §1.3 Definitions + BRD §6/App_Workflow §6.
    REJECTED is not listed in the SRS glossary's terse status list but is
    required by BR-09/FR-06 (Admin can reject with a reason)."""

    SOURCING_TRIP_OPEN = "sourcing_trip_open", "Sourcing Trip Open"
    PENDING_ADMIN_APPROVAL = "pending_admin_approval", "Pending Admin Approval"
    REJECTED = "rejected", "Rejected"
    APPROVED_FOR_QC = "approved_for_qc", "Approved for QC"
    IN_WAREHOUSE = "in_warehouse", "In Warehouse"
    READY_FOR_FINAL_QC = "ready_for_final_qc", "Ready for Final QC"
    COMPLETED = "completed", "Completed"


class Product(UUIDModel, TimeStampedModel):
    """The core sourcing-request entity (called "Product" in the SRS data
    model, "sourcing request" in the BRD/Workflow doc — same entity).

    Every field below traces to a specific requirement:
      sisterProfile     FR-67 — every downstream record scoped to Sister Profile, enforced server-side
      styleNumber       BR-06 — auto-generated, unique per product
      name              BR-05 / FR-01 — Product Name
      brandName          BR-05 / FR-01 — defaults 'NA' if unbranded
      poNo               FR-08 — PO No at product-creation-form level
      status              BRD §6 / SRS §1.3 — lifecycle stage
      rejectionReason      BR-09 — required when Admin rejects
      goodsName, finalPrice, fabricDetails   BR-32 / FR-34 — Final QC upload (populated in a later phase; fields exist now)
      factoryPackingList     FR-03 — attach factory-provided packing list as photo/scan, OR skip to manual/catalog entry (Phase 4)
      productQrGenerated, cartonQrGenerated  BR-33-35 — dual QR gate; actual QR generation is apps.traceability (Phase 4), flags live here since they gate this model's own status
      createdBy, reviewedBy, reviewedAt      FR-07 — audit trail on every approval decision
    """

    sisterProfile = models.ForeignKey(SisterProfile, related_name="products", on_delete=models.PROTECT)
    styleNumber = models.CharField(max_length=64, unique=True, default=generate_style_number)
    name = models.CharField(max_length=255)
    brandName = models.CharField(max_length=255, blank=True, default="NA")
    poNo = models.CharField(max_length=255, blank=True, default="")

    status = models.CharField(max_length=32, choices=ProductStatus.choices, default=ProductStatus.SOURCING_TRIP_OPEN)
    rejectionReason = models.TextField(blank=True, default="")

    # Final QC upload (BR-32 / FR-34) — the fields exist now; the workflow
    # step that populates them is built in Phase 3 (QC module).
    goodsName = models.CharField(max_length=255, blank=True, default="")
    finalPrice = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    fabricDetails = models.TextField(blank=True, default="")

    # FR-03: factory-supplied packing list as a photo/scan, an alternative
    # entry path to manual/catalog packing-list generation (Phase 4).
    factoryPackingList = models.FileField(upload_to="factory_packing_lists/%Y/%m/", null=True, blank=True)

    # BR-33–35: status can only reach COMPLETED once both are True.
    # *QrPayload holds the versioned JSON that was actually encoded into
    # each QR — the PNG itself is rendered on demand from this (never
    # stored as a file), so there's one source of truth per code and no
    # stale image to regenerate if the rendering changes later.
    productQrGenerated = models.BooleanField(default=False)
    productQrPayload = models.JSONField(default=dict, blank=True)
    cartonQrGenerated = models.BooleanField(default=False)
    cartonQrPayload = models.JSONField(default=dict, blank=True)

    createdBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="createdProducts", on_delete=models.PROTECT)
    reviewedBy = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="reviewedProducts", null=True, blank=True, on_delete=models.SET_NULL
    )
    reviewedAt = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return f"{self.name} ({self.styleNumber})"

    def total_order_qty(self) -> int:
        """FR-10: auto-sum per-color Order Qty into a per-product total."""
        return sum(v.orderQty for v in self.variants.all())


class ImageLabel(models.TextChoices):
    """FR-01: labeled multi-image gallery."""

    FRONT_LABEL = "front_label", "Front Label"
    BACK_LABEL = "back_label", "Back Label"
    PRODUCT_OVERALL = "product_overall", "Product Overall"
    FABRIC_CLOSEUP = "fabric_closeup", "Fabric Close-up"
    CUSTOM = "custom", "Custom"


class ProductImage(UUIDModel):
    product = models.ForeignKey(Product, related_name="images", on_delete=models.CASCADE)
    image = models.ImageField(upload_to="product_photos/%Y/%m/")
    label = models.CharField(max_length=32, choices=ImageLabel.choices, default=ImageLabel.PRODUCT_OVERALL)
    customLabelName = models.CharField(max_length=100, blank=True, default="")

    # FR-02: GPS/timestamp metadata on photo upload — optional/configurable.
    gpsLat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    gpsLng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    capturedAt = models.DateTimeField(null=True, blank=True)

    uploadedBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="uploadedProductImages", on_delete=models.PROTECT)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["createdAt"]

    def __str__(self):
        return self.customLabelName or self.get_label_display()


class ProductVariant(UUIDModel, TimeStampedModel):
    """One row per Color (BR-07 / FR-09), carrying the same packing-detail
    field set as apps.packing.PackingCarton — per the updated Sourcing
    Intake spec, this is where the Packing List module's per-color data is
    first captured, not a separate/duplicated data model (see Module
    Documentation Pack §4). `sizeBreakdown` is the per-carton size ratio
    (units of each size that go in one carton), matching PackingCarton
    exactly; it is NOT a per-size share of `orderQty`.

    Every packing-detail field is nullable/zero-default and optional at
    intake time (business rule: weights/measurements may not be known
    in the field yet and are completed later, without blocking submission).

    patternNo is not named anywhere in the BRD/SRS text, but is present on
    every row of the real factory packing list the product owner supplied
    (distinct from Style No — e.g. Style MRF25 has pattern MR12528 for one
    colorway and MR12529 for another) — added so the intake form can
    actually capture what the factory hands over.
    """

    product = models.ForeignKey(Product, related_name="variants", on_delete=models.CASCADE)
    # User-defined color names -> quantity, e.g. {"Sky Blue": 40, "Maroon": 60}.
    # No predefined color list — same free-text-name shape as
    # apps.packing.PackingCarton.colorBreakdown.
    colorBreakdown = models.JSONField(default=dict)
    patternNo = models.CharField(max_length=100, blank=True, default="")

    orderQty = models.PositiveIntegerField(default=0)
    sizeBreakdown = models.JSONField(default=dict, blank=True)  # e.g. {"S": 1, "M": 3, "L": 5}
    pcsPerCarton = models.PositiveIntegerField(default=0)  # computed: sum(sizeBreakdown.values())
    innerBundle = models.PositiveIntegerField(default=1)

    # Carton numbering — a provisional sequential suggestion at intake time;
    # not authoritative until the Packing List module finalizes it.
    cartonNoFrom = models.PositiveIntegerField(null=True, blank=True)
    cartonNoTo = models.PositiveIntegerField(null=True, blank=True)
    noOfCartons = models.PositiveIntegerField(default=0)  # computed
    totalPcs = models.PositiveIntegerField(default=0)  # computed: pcsPerCarton * noOfCartons

    grossWeight = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)  # per carton, kg
    netWeight = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)  # per carton, kg
    totalGrossWeight = models.DecimalField(max_digits=10, decimal_places=2, default=0)  # computed
    totalNetWeight = models.DecimalField(max_digits=10, decimal_places=2, default=0)  # computed

    ctnLength = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)  # inches
    ctnWidth = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)  # inches
    ctnHeight = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)  # inches
    cbm = models.DecimalField(max_digits=10, decimal_places=4, default=0)  # computed, single carton
    totalCbm = models.DecimalField(max_digits=10, decimal_places=4, default=0)  # computed

    class Meta:
        ordering = ["createdAt"]

    def __str__(self):
        return f"{'/'.join(self.colorBreakdown.keys())} ({self.orderQty})"


class TripStatus(models.TextChoices):
    OPEN = "open", "Open"
    CLOSED = "closed", "Closed"


class SourcingTrip(UUIDModel, TimeStampedModel):
    """BR-11–15 / FR-68–71: multi-location sourcing for one Product."""

    product = models.ForeignKey(Product, related_name="sourcingTrips", on_delete=models.CASCADE)
    status = models.CharField(max_length=16, choices=TripStatus.choices, default=TripStatus.OPEN)
    fullPaymentConfirmedAt = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return f"Sourcing trip for {self.product.name} [{self.status}]"


class LocationEntryStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    REPORTED = "reported", "Reported"


class SourcingLocationEntry(UUIDModel, TimeStampedModel):
    """BR-12 / FR-68: one physical location visited within a Sourcing Trip."""

    sourcingTrip = models.ForeignKey(SourcingTrip, related_name="locations", on_delete=models.CASCADE)
    locationName = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=0)
    advanceAmount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=16, choices=LocationEntryStatus.choices, default=LocationEntryStatus.PENDING)
    date = models.DateTimeField()
    reportedAt = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["date"]

    def __str__(self):
        return f"{self.locationName} ({self.status})"

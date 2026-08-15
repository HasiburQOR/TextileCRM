from django.conf import settings
from django.db import models

from apps.buyers.models import BuyerProfile, SisterProfile
from apps.core.models import TimeStampedModel, UUIDModel
from apps.core.utils import generate_reference_code
from apps.sourcing.models import Product

# 1 m^3 in cubic inches (1 in = 0.0254 m, 1/0.0254^3).
CUBIC_INCHES_PER_CBM = 61023.7441


def generate_packing_list_reference_code() -> str:
    return generate_reference_code("PKG")


class PackingRule(UUIDModel, TimeStampedModel):
    """BR-19 / FR-18: reusable units-per-carton (size assortment ratio) +
    default carton dimensions/weight, saved as a template per Buyer Profile."""

    buyerProfile = models.ForeignKey(
        BuyerProfile, related_name="packingRules", null=True, blank=True, on_delete=models.SET_NULL
    )
    name = models.CharField(max_length=255, blank=True, default="")

    # e.g. {"S": 1, "M": 3, "L": 5, "XL": 4, "XXL": 2} — an ordered size -> per-carton-unit ratio.
    sizeRatio = models.JSONField(default=dict)

    # Defaults only — actual cartons can override on a PackingCarton row,
    # since real shipments vary slightly carton to carton (see the sample
    # packing list: 6.90 kg on the first carton row, 6.70 kg on every other).
    cartonLength = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # inches
    cartonWidth = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # inches
    cartonHeight = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # inches
    cartonNetWeight = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # kg
    cartonGrossWeight = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # kg

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name or str(self.id)

    def units_per_carton(self) -> int:
        return sum(int(v) for v in self.sizeRatio.values())


class PackingList(UUIDModel, TimeStampedModel):
    """BR-16–22 / FR-13–24: a shipment-level document. One PackingList can
    span MULTIPLE Products/styles (FR-17 — see PackingCarton.product), which
    is exactly what the sample factory packing list shows: styles MRF25
    through MRF28 all under one PO, one carton-number sequence, one list."""

    sisterProfile = models.ForeignKey(SisterProfile, related_name="packingLists", on_delete=models.PROTECT)
    packingRule = models.ForeignKey(
        PackingRule, related_name="packingLists", null=True, blank=True, on_delete=models.SET_NULL
    )

    # Reference_Numbers_Identifier_System.md pattern (same as
    # BuyerProfile/SisterProfile.referenceCode): a PackingList spans possibly
    # multiple Products/styles (see class docstring above), so it needs its
    # own identifier distinct from any one Product's styleNumber — shown on
    # invoices alongside each line's styleItemCode so both the product/style
    # and the shipment/packing-list it came from are traceable. Auto-
    # generated, immutable, never independently typed by the user.
    referenceCode = models.CharField(max_length=32, unique=True, default=generate_packing_list_reference_code)

    # FR-13 header fields (manual-entry mode still needs these even when a
    # list spans multiple products/brands — left blank if not applicable).
    poNo = models.CharField(max_length=255, blank=True, default="")
    brandName = models.CharField(max_length=255, blank=True, default="")
    date = models.DateField(null=True, blank=True)

    # BR-22 / FR-23: auto-generated shipping marks.
    frontMark = models.TextField(blank=True, default="")
    sideMark = models.TextField(blank=True, default="")

    # Aggregated from PackingCarton rows — see services.recompute_totals().
    # shortExcessQty/Pct are SIGNED: negative means the shipment exceeded
    # the order ("SHORT/EXCESS QTY" on the sample sheet, not just "Short").
    totalOrderQty = models.PositiveIntegerField(default=0)
    totalShipQty = models.PositiveIntegerField(default=0)
    shortExcessQty = models.IntegerField(default=0)
    shortExcessPct = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    totalCartonQty = models.PositiveIntegerField(default=0)
    totalGrossWeight = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # kg
    totalNetWeight = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # kg
    totalCbm = models.DecimalField(max_digits=12, decimal_places=4, default=0)

    createdBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="packingLists", on_delete=models.PROTECT)

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return f"Packing list {self.poNo or self.id}"


class PackingCarton(UUIDModel):
    """One row of the sample packing list = one (Product, color) carton
    range. Every column on that sheet has a field here."""

    packingList = models.ForeignKey(PackingList, related_name="cartons", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, related_name="packingCartons", on_delete=models.PROTECT)

    # Display copy of `product.styleNumber` — server-derived, unconditionally
    # re-set from `product` on every save (see
    # apps.packing.services.compute_carton_derived) per
    # Reference_Numbers_Identifier_System.md's "Reference, Don't Copy" rule.
    # Never independently editable, even though it's stored per row.
    styleNo = models.CharField(max_length=64, blank=True, default="")

    # Packing_List_Module_Instructions.md §3.1: entered once at the Style
    # level (defaults from `product.poNo` — see compute_carton_derived) and
    # auto-populated to every color row under it, but still independently
    # stored/editable per row so each carton stays exportable/traceable on
    # its own, e.g. if a split shipment needs a different PO on one row.
    poNo = models.CharField(max_length=255, blank=True, default="")

    # "CTN NO" (From-To) and "CTNS"
    cartonNoFrom = models.PositiveIntegerField()
    cartonNoTo = models.PositiveIntegerField()
    noOfCartons = models.PositiveIntegerField(default=0)

    # "PATTERN NO", "COLOR" (PO No comes from `product`) — one color per row,
    # never a bundle of several sharing one size breakdown (same rule as
    # apps.sourcing.ProductVariant.colorName — a row's size/weight/carton
    # data must be unambiguously that one color's).
    colorName = models.CharField(max_length=255, blank=True, default="")
    patternNo = models.CharField(max_length=100, blank=True, default="")
    assortId = models.CharField(max_length=100, blank=True, default="")

    # "SIZE RANG" columns + "TOTAL PC/PER CTN" + "INNER Bundle"
    # Custom_Size_Breakdown_Feature.md: a per-color, free-form array — not a
    # fixed S/M/L/XL/XXL dict — e.g. [{"size_label": "S", "quantity": 1}, ...].
    sizeBreakdown = models.JSONField(default=list)
    totalPcsPerCarton = models.PositiveIntegerField(default=0)
    innerBundle = models.PositiveIntegerField(default=1)

    # Product_Templates_Custom_Fields_Module.md, redesigned per user
    # feedback: mirrors apps.sourcing.ProductVariant.customFieldValues — this
    # row's own values for whatever active columns the source Product's
    # resolvedTemplateFields defines.
    customFieldValues = models.JSONField(default=list, blank=True)

    # "ORDER QUANTITY" / "TTL PCS" / derived short-or-excess
    orderQty = models.PositiveIntegerField(default=0)
    shipQty = models.PositiveIntegerField(default=0)
    shortExcessQty = models.IntegerField(default=0)  # negative = excess over order
    shortExcessPct = models.DecimalField(max_digits=6, decimal_places=2, default=0)

    # "G.W" / "N.W" (per carton) and "TTL G.W" / "TTL N.W" (row total), kg
    grossWeight = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    netWeight = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    totalGrossWeight = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    totalNetWeight = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # "CTN MEASUREMENT INCH" (L / W / H) and "CBM" (row total, per sample sheet)
    ctnLength = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # inches
    ctnWidth = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # inches
    ctnHeight = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # inches
    ctnCbm = models.DecimalField(max_digits=10, decimal_places=4, default=0)  # single carton
    totalCbm = models.DecimalField(max_digits=10, decimal_places=4, default=0)  # ctnCbm * noOfCartons

    class Meta:
        ordering = ["cartonNoFrom"]

    def __str__(self):
        return f"Ctn {self.cartonNoFrom}-{self.cartonNoTo} {self.colorName}"

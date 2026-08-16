from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import models

from apps.buyers.models import SisterProfile
from apps.core.models import TimeStampedModel, UUIDModel
from apps.core.utils import generate_code
from apps.sourcing.models import Product


class ExchangeRate(UUIDModel):
    """BR-40–42 / FR-55–58: a manually published rate, never a live market
    feed. Only Admin may create one (enforced in views/permissions);
    Employees may only reference an existing row, never enter a rate."""

    sourceCurrency = models.CharField(max_length=8)
    targetCurrency = models.CharField(max_length=8)
    rate = models.DecimalField(max_digits=14, decimal_places=6)
    effectiveDate = models.DateField()
    publishedBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="exchangeRates", on_delete=models.PROTECT)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-effectiveDate"]

    def __str__(self):
        return f"{self.sourceCurrency}->{self.targetCurrency} @ {self.rate} ({self.effectiveDate})"


def _generate_invoice_number() -> str:
    return generate_code("INV")


class InvoiceStatus(models.TextChoices):
    PENDING_APPROVAL = "pending_approval", "Pending Approval"
    ISSUED = "issued", "Issued"
    REJECTED = "rejected", "Rejected"
    VOID = "void", "Void"


class CommissionType(models.TextChoices):
    NONE = "none", "None"
    PERCENTAGE = "percentage", "Percentage"
    FLAT = "flat", "Flat"


class RateQuote(models.TextChoices):
    """How to read Invoice.exchangeRateValueLocked.

    MULTIPLY — target = source × rate. What a published ExchangeRate row
    means, and the default, so every invoice created before this field
    existed keeps calculating exactly as it did.

    DIVIDE — target = source ÷ rate, i.e. the rate is quoted as "1 target =
    <rate> source" (1 USD = 120 BDT). This is how rates are written by hand
    on a commercial invoice, and storing it verbatim keeps the printed
    figure identical to the one that was typed.
    """

    MULTIPLY = "multiply", "1 source × rate = target"
    DIVIDE = "divide", "1 target = rate × source"


class Invoice(UUIDModel, TimeStampedModel):
    """BR-36–47 / FR-42–59: a Commercial Invoice generated from one or more
    approved Packing Lists within a single Sister Profile."""

    sisterProfile = models.ForeignKey(SisterProfile, related_name="invoices", on_delete=models.PROTECT)
    invoiceNo = models.CharField(max_length=32, unique=True, default=_generate_invoice_number)
    status = models.CharField(max_length=20, choices=InvoiceStatus.choices, default=InvoiceStatus.PENDING_APPROVAL)
    rejectionReason = models.TextField(blank=True, default="")
    voidReason = models.TextField(blank=True, default="")

    # FR-57: the rate VALUE is copied here at generation time — `exchangeRate`
    # is kept only for reference/audit; `exchangeRateValueLocked` is what
    # every calculation and display actually uses, and never changes even if
    # the referenced ExchangeRate row is edited or a newer one is published.
    exchangeRate = models.ForeignKey(
        ExchangeRate, related_name="invoices", null=True, blank=True, on_delete=models.SET_NULL
    )
    exchangeRateValueLocked = models.DecimalField(max_digits=14, decimal_places=6, default=0)
    targetCurrency = models.CharField(max_length=8, blank=True, default="")

    # The currency the line items are priced in. Previously implicit (line
    # items carry no currency of their own), which was fine while the only
    # rate came from a published ExchangeRate row that named both sides —
    # but a manually-typed rate has no such row to read the source currency
    # off, and a commercial invoice must state what its numbers are in.
    sourceCurrency = models.CharField(max_length=8, blank=True, default="BDT")

    # Which way round `exchangeRateValueLocked` reads. Published rates are
    # stored as multipliers (BR-42's ExchangeRate.rate: target = source ×
    # rate), but nobody writes a hand-entered rate that way — they write
    # "1 USD = 120 BDT". Storing the direction explicitly lets the invoice
    # print the figure a human actually typed, and avoids pushing 1/120
    # through a Decimal and rounding a financial document by a few cents.
    rateQuote = models.CharField(max_length=16, choices=RateQuote.choices, default=RateQuote.MULTIPLY)

    commissionType = models.CharField(max_length=16, choices=CommissionType.choices, default=CommissionType.NONE)
    commissionValue = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    totalValue = models.DecimalField(max_digits=14, decimal_places=2, default=0)  # sum of line items, pre-commission
    convertedTotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)  # (totalValue+commission) * locked rate
    outstandingBalance = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    createdBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="invoicesCreated", on_delete=models.PROTECT)
    approvedBy = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="invoicesApproved", null=True, blank=True, on_delete=models.SET_NULL
    )
    approvedAt = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return self.invoiceNo

    def commission_amount(self):
        if self.commissionType == CommissionType.PERCENTAGE:
            return self.totalValue * self.commissionValue / 100
        if self.commissionType == CommissionType.FLAT:
            return self.commissionValue
        return 0

    def grand_total(self):
        return self.totalValue + self.commission_amount()

    def convert(self, amount):
        """`amount` (in sourceCurrency) expressed in targetCurrency, honouring
        which way `rateQuote` says the locked rate reads. Returns None when no
        rate is set, so callers can omit the converted column entirely rather
        than print a misleading 0.00."""
        rate = Decimal(self.exchangeRateValueLocked or 0)
        if not rate:
            return None
        amount = Decimal(amount or 0)
        converted = amount / rate if self.rateQuote == RateQuote.DIVIDE else amount * rate
        return converted.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def document_totals(self) -> dict:
        """The summary block at the foot of the Commercial Invoice / Packing
        List — every figure summed from the line items, never stored, so it
        can never disagree with the rows printed above it."""
        lines = list(self.lineItems.all())
        return {
            "totalQty": sum(li.totalQty for li in lines),
            "totalCtn": sum(li.ctn for li in lines),
            "totalCbm": sum((li.cbm for li in lines), Decimal("0")),
            "totalNetWeight": sum((li.netWeight for li in lines), Decimal("0")),
            "totalGrossWeight": sum((li.grossWeight for li in lines), Decimal("0")),
            "lineCount": len(lines),
        }

    def total_paid(self):
        return sum((p.amount for p in self.payments.all()), Decimal("0"))

    def rate_label(self) -> str:
        """The rate as it belongs on the printed document, in the direction it
        was entered — "1 USD = 120.000000 BDT", not its reciprocal."""
        if not self.exchangeRateValueLocked:
            return ""
        rate = f"{self.exchangeRateValueLocked.normalize():f}"
        if self.rateQuote == RateQuote.DIVIDE:
            return f"1 {self.targetCurrency} = {rate} {self.sourceCurrency}"
        return f"1 {self.sourceCurrency} = {rate} {self.targetCurrency}"


class InvoiceLineItem(UUIDModel):
    """FR-42/43/45: each line traces back to its source Product and Packing
    List row (PackingCarton) for full traceability (BR-37)."""

    invoice = models.ForeignKey(Invoice, related_name="lineItems", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, related_name="invoiceLineItems", null=True, blank=True, on_delete=models.SET_NULL)
    packingCarton = models.ForeignKey(
        "packing.PackingCarton", related_name="invoiceLineItems", null=True, blank=True, on_delete=models.SET_NULL
    )
    # A line pulled in from a recorded Warehouse Cost (loading/packaging/
    # extra costs for the shipment) rather than from a Packing Carton — same
    # "pick a row, it becomes a line" flow, same SET_NULL traceability rule:
    # the line's own amount/description are copied at generation time, so
    # deleting the source WarehouseCost later never breaks an issued invoice.
    warehouseCost = models.ForeignKey(
        "warehouse.WarehouseCost", related_name="invoiceLineItems", null=True, blank=True, on_delete=models.SET_NULL
    )

    description = models.CharField(max_length=255, blank=True, default="")
    brand = models.CharField(max_length=255, blank=True, default="")
    ctn = models.PositiveIntegerField(default=0)
    qtyPerCtn = models.PositiveIntegerField(default=0)
    totalQty = models.PositiveIntegerField(default=0)
    unitPrice = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    netWeight = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    grossWeight = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cbm = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    material = models.CharField(max_length=255, blank=True, default="")
    styleItemCode = models.CharField(max_length=255, blank=True, default="")  # Product's own style code ("PRO-...")
    # The Pattern No that pairs with styleItemCode on the document's Style No
    # column ("MRF25 / MR12528") — copied from PackingCarton.patternNo at
    # generation time, same lock discipline as styleItemCode.
    patternNo = models.CharField(max_length=100, blank=True, default="")
    # PackingList.referenceCode ("PKG-...") at generation time — copied, not
    # FK-derived-live, same "locked at generation" discipline as
    # exchangeRateValueLocked, so this invoice line stays correct even if the
    # source packingCarton/packingList is later edited or deleted.
    packingListRef = models.CharField(max_length=32, blank=True, default="")
    remarks = models.CharField(max_length=255, blank=True, default="")  # FR-45: flag exceptions before approval

    # ── Commercial Invoice / Packing List presentation columns ─────────
    # The size/colour assortment as it should read on the document, e.g.
    # "3 color. 70+70+70" or "4-16Y (2:2:4:4), 1box-12pc". Free text and
    # not parsed: it's a human summary of the carton's own structured
    # sizeBreakdown/colorName, and buyers word it their own way.
    colorSizeNote = models.CharField(max_length=255, blank=True, default="")
    # Shipping mark ("A2", "K35") — the reference painted on the carton,
    # which is how goods are identified on arrival.
    markRef = models.CharField(max_length=64, blank=True, default="")
    hsCode = models.CharField(max_length=32, blank=True, default="")  # customs tariff code

    # Carton dimensions in CENTIMETRES, unlike PackingCarton which stores
    # inches — copied and converted at generation time so CBM here is
    # always L×W×H÷1,000,000 and the printed figures match the buyer's
    # own paperwork. Locked at generation, same as every other column.
    ctnLengthCm = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    ctnWidthCm = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    ctnHeightCm = models.DecimalField(max_digits=8, decimal_places=2, default=0)

    # PER-CARTON weights and volume. The existing netWeight/grossWeight/cbm
    # fields above are line TOTALS (the invoice form copies PackingCarton's
    # totalNetWeight/totalGrossWeight/totalCbm into them), and the document
    # needs both: "N.W" per carton next to "T/N.W" for the line. Kept as
    # separate stored columns rather than total ÷ ctn, because a line whose
    # cartons aren't uniformly packed would give a per-carton figure that
    # matches no actual carton.
    netWeightPerCtn = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    grossWeightPerCtn = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cbmPerCtn = models.DecimalField(max_digits=12, decimal_places=6, default=0)

    def __str__(self):
        return self.description or str(self.id)


class InvoicePayment(UUIDModel):
    """BR-44 / FR-51: partial payments against an Issued invoice."""

    invoice = models.ForeignKey(Invoice, related_name="payments", on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=8, blank=True, default="USD")
    paymentDate = models.DateField()
    bankReference = models.CharField(max_length=255, blank=True, default="")
    recordedBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="invoicePayments", on_delete=models.PROTECT)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-paymentDate"]

    def __str__(self):
        return f"{self.amount} {self.currency} on {self.invoice.invoiceNo}"

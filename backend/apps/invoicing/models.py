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


class InvoiceLineItem(UUIDModel):
    """FR-42/43/45: each line traces back to its source Product and Packing
    List row (PackingCarton) for full traceability (BR-37)."""

    invoice = models.ForeignKey(Invoice, related_name="lineItems", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, related_name="invoiceLineItems", null=True, blank=True, on_delete=models.SET_NULL)
    packingCarton = models.ForeignKey(
        "packing.PackingCarton", related_name="invoiceLineItems", null=True, blank=True, on_delete=models.SET_NULL
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
    styleItemCode = models.CharField(max_length=255, blank=True, default="")
    remarks = models.CharField(max_length=255, blank=True, default="")  # FR-45: flag exceptions before approval

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

from django.conf import settings
from django.db import models

from buyers.models import SisterProfile
from core.models import TimeStampedModel, UUIDModel
from core.utils import generate_code


class ExchangeRate(UUIDModel):
    sourceCurrency = models.CharField(max_length=8)
    targetCurrency = models.CharField(max_length=8)
    rate = models.DecimalField(max_digits=14, decimal_places=6)
    effectiveDate = models.DateTimeField()
    publishedBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="exchangeRates", on_delete=models.CASCADE)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-effectiveDate"]

    def __str__(self):
        return f"{self.sourceCurrency}->{self.targetCurrency} @ {self.rate}"


class InvoiceStatus(models.TextChoices):
    PENDING_APPROVAL = "PENDING_APPROVAL", "Pending Approval"
    ISSUED = "ISSUED", "Issued"
    REJECTED = "REJECTED", "Rejected"
    VOID = "VOID", "Void"


class CommissionType(models.TextChoices):
    NONE = "NONE", "None"
    PERCENTAGE = "PERCENTAGE", "Percentage"
    FLAT = "FLAT", "Flat"


def _generate_invoice_number() -> str:
    return generate_code("INV")


class Invoice(UUIDModel, TimeStampedModel):
    invoiceNo = models.CharField(max_length=32, unique=True, default=_generate_invoice_number)
    buyerName = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=20, choices=InvoiceStatus.choices, default=InvoiceStatus.PENDING_APPROVAL)
    rejectionReason = models.TextField(blank=True, default="")
    exchangeRate = models.ForeignKey(
        ExchangeRate, related_name="invoices", null=True, blank=True, on_delete=models.SET_NULL
    )
    exchangeRateValue = models.DecimalField(max_digits=14, decimal_places=6, default=0)
    targetCurrency = models.CharField(max_length=8, blank=True, default="")
    commissionType = models.CharField(max_length=16, choices=CommissionType.choices, default=CommissionType.NONE)
    commissionValue = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    totalValue = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    convertedTotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    outstandingBalance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    createdBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="invoicesCreated", on_delete=models.CASCADE)
    approvedBy = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="invoicesApproved", null=True, blank=True, on_delete=models.SET_NULL
    )
    approvedAt = models.DateTimeField(null=True, blank=True)

    # Phase 2
    sisterProfile = models.ForeignKey(
        SisterProfile, related_name="invoices", null=True, blank=True, on_delete=models.SET_NULL
    )

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
    invoice = models.ForeignKey(Invoice, related_name="lineItems", on_delete=models.CASCADE)
    request = models.ForeignKey(
        "sourcing.SourcingRequest", related_name="invoiceLineItems", null=True, blank=True, on_delete=models.SET_NULL
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
    remarks = models.CharField(max_length=255, blank=True, default="")

    def __str__(self):
        return self.description or str(self.id)


class InvoicePayment(UUIDModel):
    invoice = models.ForeignKey(Invoice, related_name="payments", on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency = models.CharField(max_length=8, blank=True, default="USD")
    paymentDate = models.DateTimeField()
    bankReference = models.CharField(max_length=255, blank=True, default="")
    recordedBy = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="payments", on_delete=models.CASCADE)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-paymentDate"]

    def __str__(self):
        return f"{self.amount} {self.currency} for {self.invoice.invoiceNo}"

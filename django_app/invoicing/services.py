from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from core.utils import round_money
from invoicing.models import CommissionType, Invoice, InvoiceLineItem, InvoicePayment, InvoiceStatus


@transaction.atomic
def create_invoice(*, buyer_name, exchange_rate, commission_type, commission_value, line_items, created_by, sister_profile=None) -> Invoice:
    if not line_items:
        raise ValidationError("At least one line item is required.")

    total_value = round_money(sum(Decimal(str(li.get("amount") or 0)) for li in line_items))
    exchange_rate_value = Decimal(str(exchange_rate.rate)) if exchange_rate else Decimal("0")

    invoice = Invoice(
        buyerName=buyer_name or "",
        exchangeRate=exchange_rate,
        exchangeRateValue=exchange_rate_value,
        targetCurrency=exchange_rate.targetCurrency if exchange_rate else "",
        commissionType=commission_type or CommissionType.NONE,
        commissionValue=Decimal(str(commission_value or 0)),
        totalValue=total_value,
        createdBy=created_by,
        sisterProfile=sister_profile,
    )
    commission = invoice.commission_amount()
    grand_total = round_money(total_value + commission)
    invoice.convertedTotal = round_money(grand_total * invoice.exchangeRateValue) if invoice.exchangeRateValue else Decimal("0")
    invoice.outstandingBalance = grand_total
    invoice.save()

    for li in line_items:
        InvoiceLineItem.objects.create(
            invoice=invoice,
            request_id=li.get("requestId") or li.get("request") or None,
            description=li.get("description") or "",
            brand=li.get("brand") or "",
            ctn=li.get("ctn") or 0,
            qtyPerCtn=li.get("qtyPerCtn") or 0,
            totalQty=li.get("totalQty") or ((li.get("ctn") or 0) * (li.get("qtyPerCtn") or 0)),
            unitPrice=li.get("unitPrice") or 0,
            amount=li.get("amount") or 0,
            netWeight=li.get("netWeight") or 0,
            grossWeight=li.get("grossWeight") or 0,
            cbm=li.get("cbm") or 0,
            material=li.get("material") or "",
            styleItemCode=li.get("styleItemCode") or "",
            remarks=li.get("remarks") or "",
        )

    return invoice


def approve_invoice(invoice: Invoice, approved_by) -> Invoice:
    invoice.status = InvoiceStatus.ISSUED
    invoice.approvedBy = approved_by
    invoice.approvedAt = timezone.now()
    invoice.save(update_fields=["status", "approvedBy", "approvedAt", "updatedAt"])
    return invoice


def reject_invoice(invoice: Invoice, approved_by, reason: str) -> Invoice:
    invoice.status = InvoiceStatus.REJECTED
    invoice.rejectionReason = reason
    invoice.approvedBy = approved_by
    invoice.approvedAt = timezone.now()
    invoice.save(update_fields=["status", "rejectionReason", "approvedBy", "approvedAt", "updatedAt"])
    return invoice


def void_invoice(invoice: Invoice, reason: str) -> Invoice:
    invoice.status = InvoiceStatus.VOID
    invoice.rejectionReason = reason
    invoice.outstandingBalance = Decimal("0")
    invoice.save(update_fields=["status", "rejectionReason", "outstandingBalance", "updatedAt"])
    return invoice


@transaction.atomic
def record_payment(invoice: Invoice, *, amount, currency, payment_date, bank_reference, recorded_by) -> InvoicePayment:
    payment = InvoicePayment.objects.create(
        invoice=invoice,
        amount=amount,
        currency=currency or "USD",
        paymentDate=payment_date or timezone.now(),
        bankReference=bank_reference or "",
        recordedBy=recorded_by,
    )
    _recalculate_outstanding(invoice)
    return payment


def _recalculate_outstanding(invoice: Invoice) -> None:
    total_paid = sum((p.amount for p in invoice.payments.all()), Decimal("0"))
    grand_total = invoice.grand_total()
    outstanding = round_money(grand_total - total_paid)
    invoice.outstandingBalance = max(Decimal("0"), outstanding)
    invoice.save(update_fields=["outstandingBalance", "updatedAt"])

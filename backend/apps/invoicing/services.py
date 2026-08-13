"""
Invoice state machine + calculations (BR-36-47 / FR-42-59). Every
transition is a function here, never an ad-hoc status write from a view —
same convention as apps.sourcing.services.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from apps.invoicing.models import CommissionType, ExchangeRate, Invoice, InvoiceLineItem, InvoicePayment, InvoiceStatus


def _dec(value) -> Decimal:
    return Decimal(str(value or 0))


def _round2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def publish_exchange_rate(*, source_currency, target_currency, rate, effective_date, published_by) -> ExchangeRate:
    """BR-42 / FR-55: Admin-only (enforced in the view's permission class,
    not here — this function itself has no role awareness by design, same
    as every other service in this codebase)."""
    exchange_rate = ExchangeRate.objects.create(
        sourceCurrency=source_currency, targetCurrency=target_currency, rate=rate,
        effectiveDate=effective_date, publishedBy=published_by,
    )

    from apps.audit.services import log_action

    log_action(
        actor=published_by, action="PUBLISH_EXCHANGE_RATE", entity_type="ExchangeRate", entity_id=exchange_rate.id,
        after={"sourceCurrency": source_currency, "targetCurrency": target_currency, "rate": rate},
    )
    return exchange_rate


@transaction.atomic
def create_invoice(*, sister_profile, created_by, line_items: list, exchange_rate=None, commission_type=CommissionType.NONE, commission_value=0) -> Invoice:
    """BR-36/FR-42: pre-filled line items from one or more approved Packing
    Lists (the caller resolves which PackingCarton rows to pull from — this
    function just persists whatever line items it's handed).
    FR-57: the rate VALUE is copied onto the invoice now, permanently."""
    if not line_items:
        raise ValidationError("At least one line item is required.")

    total_value = _round2(sum((_dec(li.get("amount")) for li in line_items), Decimal("0")))

    invoice = Invoice(
        sisterProfile=sister_profile,
        exchangeRate=exchange_rate,
        exchangeRateValueLocked=_dec(exchange_rate.rate) if exchange_rate else Decimal("0"),
        targetCurrency=exchange_rate.targetCurrency if exchange_rate else "",
        commissionType=commission_type or CommissionType.NONE,
        commissionValue=_dec(commission_value),
        totalValue=total_value,
        createdBy=created_by,
    )
    commission = invoice.commission_amount()
    grand_total = _round2(total_value + commission)
    invoice.convertedTotal = _round2(grand_total * invoice.exchangeRateValueLocked) if invoice.exchangeRateValueLocked else Decimal("0")
    invoice.outstandingBalance = grand_total
    invoice.save()

    for li in line_items:
        InvoiceLineItem.objects.create(
            invoice=invoice,
            product=li.get("product"),
            packingCarton=li.get("packingCarton"),
            description=li.get("description", ""),
            brand=li.get("brand", ""),
            ctn=li.get("ctn") or 0,
            qtyPerCtn=li.get("qtyPerCtn") or 0,
            totalQty=li.get("totalQty") or ((li.get("ctn") or 0) * (li.get("qtyPerCtn") or 0)),
            unitPrice=li.get("unitPrice") or 0,
            amount=li.get("amount") or 0,
            netWeight=li.get("netWeight") or 0,
            grossWeight=li.get("grossWeight") or 0,
            cbm=li.get("cbm") or 0,
            material=li.get("material", ""),
            styleItemCode=li.get("styleItemCode", ""),
            remarks=li.get("remarks", ""),
        )

    from apps.audit.services import log_action

    log_action(
        actor=created_by, action="CREATE_INVOICE", entity_type="Invoice", entity_id=invoice.id,
        after={"invoiceNo": invoice.invoiceNo, "totalValue": invoice.totalValue, "sisterProfileId": str(sister_profile.id)},
    )
    return invoice


def approve_invoice(invoice: Invoice, approved_by) -> Invoice:
    """BR-39 / FR-48: Admin-only (enforced by the view)."""
    if invoice.status != InvoiceStatus.PENDING_APPROVAL:
        raise ValidationError(f"Cannot approve from status '{invoice.status}'.")
    before_status = invoice.status
    invoice.status = InvoiceStatus.ISSUED
    invoice.approvedBy = approved_by
    invoice.approvedAt = timezone.now()
    invoice.save(update_fields=["status", "approvedBy", "approvedAt", "updatedAt"])

    from apps.audit.services import log_action
    from apps.notifications.models import NotificationType
    from apps.notifications.services import notify_buyer

    log_action(
        actor=approved_by, action="APPROVE_INVOICE", entity_type="Invoice", entity_id=invoice.id,
        before={"status": before_status}, after={"status": invoice.status},
    )
    notify_buyer(
        sister_profile=invoice.sisterProfile, title="Invoice issued",
        message=f"Invoice {invoice.invoiceNo} has been issued.",
        notification_type=NotificationType.INVOICE_ISSUED,
    )
    return invoice


def reject_invoice(invoice: Invoice, approved_by, reason: str) -> Invoice:
    """BR-39 / FR-48: reason required, returns to Employee."""
    if invoice.status != InvoiceStatus.PENDING_APPROVAL:
        raise ValidationError(f"Cannot reject from status '{invoice.status}'.")
    if not reason:
        raise ValidationError("A rejection reason is required.")
    before_status = invoice.status
    invoice.status = InvoiceStatus.REJECTED
    invoice.rejectionReason = reason
    invoice.approvedBy = approved_by
    invoice.approvedAt = timezone.now()
    invoice.save(update_fields=["status", "rejectionReason", "approvedBy", "approvedAt", "updatedAt"])

    from apps.audit.services import log_action

    log_action(
        actor=approved_by, action="REJECT_INVOICE", entity_type="Invoice", entity_id=invoice.id,
        before={"status": before_status}, after={"status": invoice.status, "reason": reason},
    )
    return invoice


def void_invoice(invoice: Invoice, reason: str, actor) -> Invoice:
    """BR-46 / FR-53: never hard-delete — Void with a required reason.
    Only an Issued invoice can be voided (a Pending/Rejected invoice has
    never taken effect, so voiding it is meaningless)."""
    if invoice.status != InvoiceStatus.ISSUED:
        raise ValidationError(f"Cannot void from status '{invoice.status}'.")
    if not reason:
        raise ValidationError("A void reason is required.")
    before_status = invoice.status
    invoice.status = InvoiceStatus.VOID
    invoice.voidReason = reason
    invoice.outstandingBalance = Decimal("0")  # FR-53: voided invoices are excluded from active balances
    invoice.save(update_fields=["status", "voidReason", "outstandingBalance", "updatedAt"])

    from apps.audit.services import log_action

    log_action(
        actor=actor, action="VOID_INVOICE", entity_type="Invoice", entity_id=invoice.id,
        before={"status": before_status}, after={"status": invoice.status, "reason": reason},
    )
    return invoice


def delete_invoice(invoice: Invoice, actor) -> None:
    """A Pending/Rejected invoice never took effect (BR-46's rationale for
    why void_invoice() also excludes them) — no payments are possible
    against it and it was never issued, so it's safe to actually remove
    rather than route through Void. An Issued or Void invoice must never be
    deleted; Void (with a required reason, preserving the record) is the
    only lifecycle exit for those, per BR-46."""
    if invoice.status not in (InvoiceStatus.PENDING_APPROVAL, InvoiceStatus.REJECTED):
        raise ValidationError(f"Cannot delete an invoice with status '{invoice.status}' — void it instead.")

    from apps.audit.services import log_action

    log_action(
        actor=actor, action="DELETE_INVOICE", entity_type="Invoice", entity_id=invoice.id,
        before={"invoiceNo": invoice.invoiceNo, "status": invoice.status},
    )
    invoice.delete()


@transaction.atomic
def record_payment(invoice: Invoice, *, amount, currency, payment_date, bank_reference, recorded_by) -> InvoicePayment:
    """BR-44 / FR-51-52. Only an Issued invoice can receive payments — a
    Pending invoice isn't a confirmed obligation yet, and a Void/Rejected
    one shouldn't be collected against."""
    if invoice.status != InvoiceStatus.ISSUED:
        raise ValidationError(f"Cannot record a payment against a '{invoice.status}' invoice.")
    if not amount or _dec(amount) <= 0:
        raise ValidationError("Payment amount must be positive.")

    payment = InvoicePayment.objects.create(
        invoice=invoice, amount=amount, currency=currency or "USD",
        paymentDate=payment_date, bankReference=bank_reference or "", recordedBy=recorded_by,
    )
    _recalculate_outstanding(invoice)

    # FR-84: "payment recorded" is a notification trigger, not an audit-log
    # one — BR-57/FR-82's audit list names invoice create/approve/reject/void
    # explicitly and doesn't include payments, so this deliberately has no
    # log_action() call, unlike every invoice status transition above.
    from apps.notifications.models import NotificationType
    from apps.notifications.services import notify_buyer

    notify_buyer(
        sister_profile=invoice.sisterProfile, title="Payment recorded",
        message=f"A payment of {payment.amount} {payment.currency} was recorded against invoice {invoice.invoiceNo}.",
        notification_type=NotificationType.PAYMENT_RECORDED,
    )
    return payment


def _recalculate_outstanding(invoice: Invoice) -> None:
    """Full recompute from all payments each time, not an incremental
    subtract — self-correcting/idempotent regardless of payment order.

    Queries InvoicePayment directly rather than `invoice.payments.all()`:
    the caller's `invoice` instance may have come from a queryset with
    `.prefetch_related("payments")` (the ViewSet's does, for GET/list
    efficiency), which caches that relation's `.all()` result on the
    instance — a payment created moments earlier in the same request
    wouldn't show up in that stale cache, silently under-counting.
    """
    total_paid = InvoicePayment.objects.filter(invoice=invoice).aggregate(total=models.Sum("amount"))["total"] or Decimal("0")
    outstanding = _round2(invoice.grand_total() - total_paid)
    invoice.outstandingBalance = max(Decimal("0"), outstanding)
    invoice.save(update_fields=["outstandingBalance", "updatedAt"])

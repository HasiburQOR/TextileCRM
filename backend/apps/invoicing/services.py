"""
Invoice state machine + calculations (BR-36-47 / FR-42-59). Every
transition is a function here, never an ad-hoc status write from a view —
same convention as apps.sourcing.services.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from apps.invoicing.models import (
    CommissionType,
    ExchangeRate,
    Invoice,
    InvoiceLineItem,
    InvoicePayment,
    InvoiceStatus,
    RateQuote,
)


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


INCH_TO_CM = Decimal("2.54")


def _cm(value, *, already_cm: bool) -> Decimal:
    """PackingCarton stores carton dimensions in inches; the Commercial
    Invoice / Packing List prints centimetres (and computes CBM as
    L×W×H÷1,000,000 from them). Converting on the way into the invoice line
    keeps every stored packing row untouched."""
    value = _dec(value)
    return value if already_cm else (value * INCH_TO_CM).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute_line_item(li: dict) -> dict:
    """Fills in every derived figure on one invoice line, so the numbers on
    the document come from one place rather than from whatever the client
    happened to post.

        totalQty  = ctn × qtyPerCtn
        amount    = totalQty × unitPrice
        cbmPerCtn = L × W × H ÷ 1,000,000   (centimetres)
        cbm       = ctn × cbmPerCtn         (line total)
        netWeight = ctn × netWeightPerCtn   (line total, likewise gross)

    A value explicitly supplied by the caller always wins — a real shipment
    has short/excess cartons and odd part-loads, and the packing list is the
    authority on those, not this arithmetic. The formulas only fill blanks.
    """
    out = dict(li)
    ctn = int(out.get("ctn") or 0)
    qty_per_ctn = int(out.get("qtyPerCtn") or 0)

    out["totalQty"] = int(out.get("totalQty") or 0) or ctn * qty_per_ctn
    if not out.get("amount"):
        out["amount"] = _round2(_dec(out["totalQty"]) * _dec(out.get("unitPrice")))

    dims_in_cm = bool(out.pop("dimensionsInCm", False))
    length = _cm(out.get("ctnLengthCm"), already_cm=dims_in_cm)
    width = _cm(out.get("ctnWidthCm"), already_cm=dims_in_cm)
    height = _cm(out.get("ctnHeightCm"), already_cm=dims_in_cm)
    out["ctnLengthCm"], out["ctnWidthCm"], out["ctnHeightCm"] = length, width, height

    if not out.get("cbmPerCtn") and length and width and height:
        out["cbmPerCtn"] = (length * width * height / Decimal("1000000")).quantize(
            Decimal("0.000001"), rounding=ROUND_HALF_UP
        )
    if not out.get("cbm"):
        out["cbm"] = (_dec(ctn) * _dec(out.get("cbmPerCtn"))).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    for total_field, per_ctn_field in (("netWeight", "netWeightPerCtn"), ("grossWeight", "grossWeightPerCtn")):
        if not out.get(total_field):
            out[total_field] = _round2(_dec(ctn) * _dec(out.get(per_ctn_field)))
    return out


@transaction.atomic
def create_invoice(
    *, sister_profile, created_by, line_items: list, exchange_rate=None,
    commission_type=CommissionType.NONE, commission_value=0,
    source_currency="", target_currency="", manual_rate=None, rate_quote=None,
) -> Invoice:
    """BR-36/FR-42: pre-filled line items from one or more approved Packing
    Lists (the caller resolves which PackingCarton rows to pull from — this
    function just persists whatever line items it's handed).
    FR-57: the rate VALUE is copied onto the invoice now, permanently.

    The rate can come from a published ExchangeRate (`exchange_rate`) or be
    typed by hand (`manual_rate` + `target_currency` + `rate_quote`). A
    published rate wins when both are given: it's the auditable one.
    """
    if not line_items:
        raise ValidationError("At least one line item is required.")

    line_items = [compute_line_item(li) for li in line_items]
    total_value = _round2(sum((_dec(li.get("amount")) for li in line_items), Decimal("0")))

    if exchange_rate:
        locked_rate = _dec(exchange_rate.rate)
        resolved_target = exchange_rate.targetCurrency
        resolved_source = source_currency or exchange_rate.sourceCurrency
        resolved_quote = RateQuote.MULTIPLY  # what a published rate means
    else:
        locked_rate = _dec(manual_rate)
        resolved_target = target_currency or ""
        resolved_source = source_currency or "BDT"
        resolved_quote = rate_quote or RateQuote.DIVIDE  # "1 USD = 120 BDT"
        if locked_rate < 0:
            raise ValidationError("Exchange rate cannot be negative.")
        if locked_rate and not resolved_target:
            raise ValidationError("A target currency is required when an exchange rate is given.")

    invoice = Invoice(
        sisterProfile=sister_profile,
        exchangeRate=exchange_rate,
        exchangeRateValueLocked=locked_rate,
        sourceCurrency=resolved_source,
        targetCurrency=resolved_target,
        rateQuote=resolved_quote,
        commissionType=commission_type or CommissionType.NONE,
        commissionValue=_dec(commission_value),
        totalValue=total_value,
        createdBy=created_by,
    )
    commission = invoice.commission_amount()
    grand_total = _round2(total_value + commission)
    invoice.convertedTotal = invoice.convert(grand_total) or Decimal("0")
    invoice.outstandingBalance = grand_total
    invoice.save()

    for li in line_items:
        InvoiceLineItem.objects.create(
            invoice=invoice,
            product=li.get("product"),
            packingCarton=li.get("packingCarton"),
            warehouseCost=li.get("warehouseCost"),
            description=li.get("description", ""),
            brand=li.get("brand", ""),
            ctn=li.get("ctn") or 0,
            qtyPerCtn=li.get("qtyPerCtn") or 0,
            totalQty=li.get("totalQty") or 0,
            unitPrice=li.get("unitPrice") or 0,
            amount=li.get("amount") or 0,
            netWeight=li.get("netWeight") or 0,
            grossWeight=li.get("grossWeight") or 0,
            cbm=li.get("cbm") or 0,
            netWeightPerCtn=li.get("netWeightPerCtn") or 0,
            grossWeightPerCtn=li.get("grossWeightPerCtn") or 0,
            cbmPerCtn=li.get("cbmPerCtn") or 0,
            ctnLengthCm=li.get("ctnLengthCm") or 0,
            ctnWidthCm=li.get("ctnWidthCm") or 0,
            ctnHeightCm=li.get("ctnHeightCm") or 0,
            # Material normally arrives pre-filled from Product.material
            # (captured at Sourcing Intake) via PackingCarton.productMaterial.
            # The fallback here makes intake-captured material reach the line
            # even when a client sends nothing, while an explicit per-line
            # value still wins - same "locked at generation" discipline as
            # styleItemCode/patternNo.
            material=li.get("material") or getattr(li.get("product"), "material", ""),
            styleItemCode=li.get("styleItemCode", ""),
            patternNo=li.get("patternNo", ""),
            packingListRef=li.get("packingListRef", ""),
            remarks=li.get("remarks", ""),
            colorSizeNote=li.get("colorSizeNote", ""),
            markRef=li.get("markRef", ""),
            hsCode=li.get("hsCode", ""),
        )

    from apps.audit.services import log_action

    log_action(
        actor=created_by, action="CREATE_INVOICE", entity_type="Invoice", entity_id=invoice.id,
        after={"invoiceNo": invoice.invoiceNo, "totalValue": invoice.totalValue, "sisterProfileId": str(sister_profile.id)},
    )
    return invoice


_UNSET = object()  # distinguishes "field not supplied" from "field cleared"


@transaction.atomic
def update_invoice_payment_details(
    invoice: Invoice, *, actor, exchange_rate=_UNSET, commission_type=_UNSET,
    commission_value=_UNSET, source_currency=_UNSET, target_currency=_UNSET,
    manual_rate=_UNSET, rate_quote=_UNSET,
) -> Invoice:
    """Fix the payment options on an invoice that hasn't been approved yet.

    Rate and commission are chosen once, at generation time, and mistakes
    are easy — wrong rate row, percentage instead of flat. Until now the
    only remedy was delete-and-recreate, which throws away the assembled
    line items. This edits just that configuration, and only while the
    invoice is still Pending Approval: an Issued invoice is a financial
    document the buyer may already hold (BR-46's no-in-place-edits rule
    stays in force for it), and Rejected/Void are dead ends.

    PATCH semantics: omitted arguments keep the stored value. A supplied
    published ExchangeRate wins over the manual rate and re-locks its
    value — same resolution rules as create_invoice(). Every derived
    figure is recomputed from the unchanged line items; payments cannot
    exist against a pending invoice, so the outstanding balance is simply
    the new grand total.
    """
    if invoice.status != InvoiceStatus.PENDING_APPROVAL:
        raise ValidationError(
            f"Payment details can only be edited before approval — this invoice is '{invoice.status}'."
        )

    before = {
        "exchangeRateValueLocked": str(invoice.exchangeRateValueLocked),
        "sourceCurrency": invoice.sourceCurrency, "targetCurrency": invoice.targetCurrency,
        "commissionType": invoice.commissionType, "commissionValue": str(invoice.commissionValue),
    }

    resolved_rate = invoice.exchangeRate if exchange_rate is _UNSET else exchange_rate
    resolved_commission_type = invoice.commissionType if commission_type is _UNSET else commission_type
    resolved_commission_value = invoice.commissionValue if commission_value is _UNSET else _dec(commission_value)
    resolved_source = invoice.sourceCurrency if source_currency is _UNSET else source_currency
    resolved_target = invoice.targetCurrency if target_currency is _UNSET else target_currency
    resolved_quote = invoice.rateQuote if rate_quote is _UNSET else rate_quote

    if resolved_rate:
        locked_rate = _dec(resolved_rate.rate)
        resolved_target = resolved_rate.targetCurrency
        resolved_source = resolved_source or resolved_rate.sourceCurrency
        resolved_quote = RateQuote.MULTIPLY  # what a published rate means
    else:
        locked_rate = invoice.exchangeRateValueLocked if manual_rate is _UNSET else _dec(manual_rate)
        if not resolved_source:
            resolved_source = "BDT"
        if locked_rate < 0:
            raise ValidationError("Exchange rate cannot be negative.")
        if locked_rate and not resolved_target:
            raise ValidationError("A target currency is required when an exchange rate is given.")

    invoice.exchangeRate = resolved_rate
    invoice.exchangeRateValueLocked = locked_rate
    invoice.sourceCurrency = resolved_source
    invoice.targetCurrency = resolved_target
    invoice.rateQuote = resolved_quote
    invoice.commissionType = resolved_commission_type or CommissionType.NONE
    invoice.commissionValue = resolved_commission_value

    # Recompute every derived figure from the unchanged line items — the
    # same sequence create_invoice() runs.
    invoice.totalValue = _round2(
        sum((_dec(li.amount) for li in invoice.lineItems.all()), Decimal("0"))
    )
    grand_total = _round2(invoice.totalValue + invoice.commission_amount())
    invoice.convertedTotal = invoice.convert(grand_total) or Decimal("0")
    invoice.outstandingBalance = grand_total
    invoice.save()

    from apps.audit.services import log_action

    log_action(
        actor=actor, action="UPDATE_INVOICE", entity_type="Invoice", entity_id=invoice.id,
        before=before,
        after={
            "exchangeRateValueLocked": str(invoice.exchangeRateValueLocked),
            "sourceCurrency": invoice.sourceCurrency, "targetCurrency": invoice.targetCurrency,
            "commissionType": invoice.commissionType, "commissionValue": str(invoice.commissionValue),
        },
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


@transaction.atomic
def update_payment(payment: InvoicePayment, *, actor, amount=_UNSET, currency=_UNSET, payment_date=_UNSET, bank_reference=_UNSET) -> InvoicePayment:
    """Corrects a mistyped payment — wrong amount, wrong date, wrong
    reference. Until now the only remedy was leaving the mistake on the
    record forever (record_payment() has no update path). Mirrors
    update_invoice_payment_details()'s "still open" guard: only a payment
    against an Issued invoice may be corrected — a Voided invoice's
    payments are part of the closed record BR-46 protects, and a
    Pending/Rejected invoice can't have payments in the first place
    (record_payment() itself refuses those)."""
    invoice = payment.invoice
    if invoice.status != InvoiceStatus.ISSUED:
        raise ValidationError(f"Payments can only be edited on an Issued invoice — this one is '{invoice.status}'.")

    before = {
        "amount": str(payment.amount), "currency": payment.currency,
        "paymentDate": str(payment.paymentDate), "bankReference": payment.bankReference,
    }

    resolved_amount = payment.amount if amount is _UNSET else _dec(amount)
    if not resolved_amount or resolved_amount <= 0:
        raise ValidationError("Payment amount must be positive.")

    payment.amount = resolved_amount
    if currency is not _UNSET:
        payment.currency = currency or "USD"
    if payment_date is not _UNSET:
        payment.paymentDate = payment_date
    if bank_reference is not _UNSET:
        payment.bankReference = bank_reference or ""
    payment.save(update_fields=["amount", "currency", "paymentDate", "bankReference"])
    _recalculate_outstanding(invoice)

    from apps.audit.services import log_action

    log_action(
        actor=actor, action="UPDATE_PAYMENT", entity_type="InvoicePayment", entity_id=payment.id,
        before=before,
        after={
            "amount": str(payment.amount), "currency": payment.currency,
            "paymentDate": str(payment.paymentDate), "bankReference": payment.bankReference,
        },
    )
    return payment


@transaction.atomic
def delete_payment(payment: InvoicePayment, *, actor) -> None:
    """Removes a payment recorded in error. Same "still Issued" guard as
    update_payment() — once an invoice is Void, its payment history is
    frozen, not correctable."""
    invoice = payment.invoice
    if invoice.status != InvoiceStatus.ISSUED:
        raise ValidationError(f"Payments can only be deleted on an Issued invoice — this one is '{invoice.status}'.")

    from apps.audit.services import log_action

    log_action(
        actor=actor, action="DELETE_PAYMENT", entity_type="InvoicePayment", entity_id=payment.id,
        before={"amount": str(payment.amount), "currency": payment.currency, "paymentDate": str(payment.paymentDate)},
    )
    payment.delete()
    _recalculate_outstanding(invoice)


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

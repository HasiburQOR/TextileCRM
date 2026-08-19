from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from accounts.permissions import role_required
from audit.utils import client_ip, log_action
from invoicing.models import ExchangeRate, Invoice, InvoiceStatus
from invoicing.services import approve_invoice, create_invoice, record_payment, reject_invoice, void_invoice


def _line_items_from_post(request):
    fields = ["description", "brand", "ctn", "qtyPerCtn", "unitPrice", "netWeight", "grossWeight", "cbm", "material", "styleItemCode", "remarks"]
    lists = {f: request.POST.getlist(f"li_{f}") for f in fields}
    count = len(lists["description"])
    rows = []
    for i in range(count):
        if not lists["description"][i]:
            continue
        ctn = int(lists["ctn"][i] or 0)
        qty_per_ctn = int(lists["qtyPerCtn"][i] or 0)
        unit_price = float(lists["unitPrice"][i] or 0)
        rows.append(
            {
                "description": lists["description"][i],
                "brand": lists["brand"][i] if i < len(lists["brand"]) else "",
                "ctn": ctn,
                "qtyPerCtn": qty_per_ctn,
                "totalQty": ctn * qty_per_ctn,
                "unitPrice": unit_price,
                "amount": round(ctn * qty_per_ctn * unit_price, 2),
                "netWeight": float(lists["netWeight"][i] or 0) if i < len(lists["netWeight"]) else 0,
                "grossWeight": float(lists["grossWeight"][i] or 0) if i < len(lists["grossWeight"]) else 0,
                "cbm": float(lists["cbm"][i] or 0) if i < len(lists["cbm"]) else 0,
                "material": lists["material"][i] if i < len(lists["material"]) else "",
                "styleItemCode": lists["styleItemCode"][i] if i < len(lists["styleItemCode"]) else "",
                "remarks": lists["remarks"][i] if i < len(lists["remarks"]) else "",
            }
        )
    return rows


@login_required
def invoice_list(request):
    if request.method == "POST":
        rate = ExchangeRate.objects.filter(pk=request.POST.get("exchangeRateId")).first() if request.POST.get("exchangeRateId") else None
        try:
            invoice = create_invoice(
                buyer_name=request.POST.get("buyerName", ""),
                exchange_rate=rate,
                commission_type=request.POST.get("commissionType", "NONE"),
                commission_value=request.POST.get("commissionValue") or 0,
                line_items=_line_items_from_post(request),
                created_by=request.user,
            )
        except ValidationError as exc:
            messages.error(request, str(exc.message if hasattr(exc, "message") else exc))
        else:
            log_action(request.user, "CREATE_INVOICE", "Invoice", invoice.id, after={"invoiceNo": invoice.invoiceNo, "totalValue": float(invoice.totalValue)}, ip_address=client_ip(request))
            messages.success(request, f"Invoice {invoice.invoiceNo} created.")
            return redirect("invoicing:list")

    status = request.GET.get("status", "ALL")
    qs = Invoice.objects.select_related("createdBy", "approvedBy").prefetch_related("lineItems", "payments")
    if status != "ALL":
        qs = qs.filter(status=status)
    return render(
        request,
        "invoicing/invoice_list.html",
        {
            "invoices": qs.order_by("-createdAt"),
            "status_filter": status,
            "statuses": InvoiceStatus.choices,
            "exchange_rates": ExchangeRate.objects.order_by("-effectiveDate"),
        },
    )


@login_required
def invoice_detail(request, pk):
    invoice = get_object_or_404(Invoice.objects.select_related("createdBy", "approvedBy").prefetch_related("lineItems", "payments"), pk=pk)
    return render(request, "invoicing/invoice_detail.html", {"invoice": invoice})


@role_required()
def approve(request, pk):
    invoice = get_object_or_404(Invoice, pk=pk)
    if request.method == "POST":
        approve_invoice(invoice, request.user)
        log_action(request.user, "APPROVE_INVOICE", "Invoice", invoice.id, after={"status": invoice.status}, ip_address=client_ip(request))
        messages.success(request, "Invoice approved.")
    return redirect("invoicing:detail", pk=pk)


@role_required()
def reject(request, pk):
    invoice = get_object_or_404(Invoice, pk=pk)
    if request.method == "POST":
        reason = request.POST.get("reason", "")
        reject_invoice(invoice, request.user, reason)
        log_action(request.user, "REJECT_INVOICE", "Invoice", invoice.id, after={"status": invoice.status, "reason": reason}, ip_address=client_ip(request))
        messages.success(request, "Invoice rejected.")
    return redirect("invoicing:detail", pk=pk)


@role_required()
def void(request, pk):
    invoice = get_object_or_404(Invoice, pk=pk)
    if request.method == "POST":
        reason = request.POST.get("reason", "")
        void_invoice(invoice, reason)
        log_action(request.user, "VOID_INVOICE", "Invoice", invoice.id, after={"status": invoice.status, "reason": reason}, ip_address=client_ip(request))
        messages.success(request, "Invoice voided.")
    return redirect("invoicing:detail", pk=pk)


@login_required
def add_payment(request, pk):
    invoice = get_object_or_404(Invoice, pk=pk)
    if request.method == "POST":
        record_payment(
            invoice,
            amount=request.POST.get("amount") or 0,
            currency=request.POST.get("currency", "USD"),
            payment_date=timezone.now(),
            bank_reference=request.POST.get("bankReference", ""),
            recorded_by=request.user,
        )
        log_action(request.user, "RECORD_PAYMENT", "Invoice", invoice.id, after={"outstandingBalance": float(invoice.outstandingBalance)}, ip_address=client_ip(request))
        messages.success(request, "Payment recorded.")
    return redirect("invoicing:detail", pk=pk)


@role_required()
def exchange_rate_list(request):
    if request.method == "POST":
        ExchangeRate.objects.create(
            sourceCurrency=request.POST.get("sourceCurrency", "USD"),
            targetCurrency=request.POST.get("targetCurrency", "BDT"),
            rate=request.POST.get("rate") or 0,
            effectiveDate=request.POST.get("effectiveDate") or timezone.now(),
            publishedBy=request.user,
        )
        messages.success(request, "Exchange rate published.")
        return redirect("invoicing:exchange_rates")
    rates = ExchangeRate.objects.select_related("publishedBy").order_by("-effectiveDate")
    return render(request, "invoicing/exchange_rates.html", {"rates": rates})

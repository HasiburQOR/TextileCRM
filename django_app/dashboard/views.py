from decimal import Decimal

from django.contrib.auth.decorators import login_required
from django.db.models import Sum
from django.shortcuts import render

from buyers.models import BuyerProfile, SisterProfile
from expenses.models import Expense
from invoicing.models import Invoice, InvoiceStatus, InvoicePayment
from qc.models import QCReport
from sourcing.models import RequestStatus, SourcingRequest


@login_required
def index(request):
    requests_qs = SourcingRequest.objects.select_related("createdBy", "reviewedBy", "sisterProfile").prefetch_related("variants", "qcReport__warehouseCost")
    if request.user.role == "COMPANY_REP":
        requests_qs = requests_qs.filter(createdBy=request.user)

    total_invoice_value = Invoice.objects.aggregate(total=Sum("totalValue"))["total"] or Decimal("0")
    total_payments = InvoicePayment.objects.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    total_outstanding = (
        Invoice.objects.filter(status__in=[InvoiceStatus.PENDING_APPROVAL, InvoiceStatus.ISSUED]).aggregate(total=Sum("outstandingBalance"))["total"]
        or Decimal("0")
    )
    total_expenses = Expense.objects.aggregate(total=Sum("amount"))["total"] or Decimal("0")

    context = {
        "totalRequests": requests_qs.count(),
        "pendingRequests": requests_qs.filter(status=RequestStatus.PENDING_ADMIN_APPROVAL).count(),
        "approvedRequests": requests_qs.filter(status=RequestStatus.APPROVED_FOR_QC).count(),
        "rejectedRequests": requests_qs.filter(status=RequestStatus.REJECTED).count(),
        "totalQCReports": QCReport.objects.count(),
        "totalInvoices": Invoice.objects.count(),
        "pendingInvoices": Invoice.objects.filter(status=InvoiceStatus.PENDING_APPROVAL).count(),
        "issuedInvoices": Invoice.objects.filter(status=InvoiceStatus.ISSUED).count(),
        "totalInvoiceValue": total_invoice_value,
        "totalPayments": total_payments,
        "totalOutstanding": total_outstanding,
        "totalBuyers": BuyerProfile.objects.count(),
        "totalSisterProfiles": SisterProfile.objects.count(),
        "totalExpenses": total_expenses,
        "requests": requests_qs.order_by("-createdAt")[:50],
    }
    return render(request, "dashboard/index.html", context)


@login_required
def cost_reports(request):
    reports = (
        QCReport.objects.select_related("request", "warehouseCost")
        .order_by("-createdAt")
    )
    rows = []
    for r in reports:
        warehouse_total = r.warehouseCost.totalCost if hasattr(r, "warehouseCost") else Decimal("0")
        rows.append({"report": r, "warehouseTotal": warehouse_total, "grandTotal": r.totalCost + warehouse_total})
    return render(request, "dashboard/cost_reports.html", {"rows": rows})

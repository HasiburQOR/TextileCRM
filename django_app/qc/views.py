from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404, redirect, render

from audit.utils import client_ip, log_action
from qc.forms import QCReportForm
from qc.models import QCReport
from qc.services import create_qc_report
from sourcing.models import RequestStatus, SourcingRequest


@login_required
def qc_list(request):
    if request.method == "POST":
        form = QCReportForm(request.POST)
        if form.is_valid():
            sourcing_request = get_object_or_404(SourcingRequest, pk=form.cleaned_data["requestId"])
            try:
                report = create_qc_report(
                    sourcing_request=sourcing_request,
                    created_by=request.user,
                    lunch_cost_flag=form.cleaned_data["lunchCostFlag"],
                    lunch_cost=form.cleaned_data["lunchCost"],
                    goods_carrying_cost=form.cleaned_data["goodsCarryingCost"],
                    travel_mode=form.cleaned_data["travelMode"],
                    extra_cost=form.cleaned_data["extraCost"],
                )
            except ValidationError as exc:
                messages.error(request, str(exc.message if hasattr(exc, "message") else exc))
            else:
                log_action(request.user, "CREATE_QC_REPORT", "QCReport", report.id, after={"reportId": report.reportId, "totalCost": float(report.totalCost)}, ip_address=client_ip(request))
                messages.success(request, f"QC report {report.reportId} created.")
                return redirect("qc:list")
    reports = QCReport.objects.select_related("request", "createdBy", "warehouseCost").order_by("-createdAt")
    pending_requests = SourcingRequest.objects.filter(status=RequestStatus.APPROVED_FOR_QC, qcReport__isnull=True)
    return render(request, "qc/qc_list.html", {"reports": reports, "pending_requests": pending_requests})

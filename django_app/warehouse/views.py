from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404, redirect, render

from audit.utils import client_ip, log_action
from qc.models import QCReport
from warehouse.models import WarehouseCost
from warehouse.services import create_warehouse_cost

COST_FIELDS = ["loaderCost", "extraWorkerCost", "labelsCost", "htakeCost", "stickersCost", "cartonsCost", "polyBagsCost", "gamtapeCost"]


def _decimal(request, field):
    val = request.POST.get(field, "0")
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0


@login_required
def warehouse_list(request):
    if request.method == "POST":
        qc_report = get_object_or_404(QCReport, pk=request.POST.get("qcReportId"))
        custom_names = request.POST.getlist("custom_name")
        custom_amounts = request.POST.getlist("custom_amount")
        custom_costs = [
            {"fieldName": custom_names[i], "amount": float(custom_amounts[i] or 0)}
            for i in range(len(custom_names))
            if custom_names[i]
        ]
        try:
            wc = create_warehouse_cost(
                qc_report=qc_report,
                created_by=request.user,
                custom_costs=custom_costs,
                **{f: _decimal(request, f) for f in COST_FIELDS},
            )
        except ValidationError as exc:
            messages.error(request, str(exc.message if hasattr(exc, "message") else exc))
        else:
            log_action(request.user, "CREATE_WAREHOUSE_COST", "WarehouseCost", wc.id, after={"totalCost": float(wc.totalCost)}, ip_address=client_ip(request))
            messages.success(request, "Warehouse costs saved.")
            return redirect("warehouse:list")

    costs = WarehouseCost.objects.select_related("qcReport__request", "createdBy").order_by("-createdAt")
    pending_qc = QCReport.objects.filter(warehouseCost__isnull=True).select_related("request")
    return render(request, "warehouse/warehouse_list.html", {"costs": costs, "pending_qc": pending_qc})

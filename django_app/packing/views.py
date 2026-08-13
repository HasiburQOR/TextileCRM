from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404, redirect, render

from audit.utils import client_ip, log_action
from packing.models import PackingList
from packing.services import create_packing_list
from sourcing.models import RequestStatus, SourcingRequest


def _float(vals, i, default=0):
    try:
        return float(vals[i]) if i < len(vals) and vals[i] not in (None, "") else default
    except (TypeError, ValueError):
        return default


def _int(vals, i, default=0):
    try:
        return int(vals[i]) if i < len(vals) and vals[i] not in (None, "") else default
    except (TypeError, ValueError):
        return default


def _cartons_from_post(request):
    fields = ["cartonNoFrom", "cartonNoTo", "color", "assortId", "itemNumber", "sizeBreakdown", "qtyPerCarton", "orderQty", "ctnLength", "ctnWidth", "ctnHeight", "netWeight", "grossWeight"]
    lists = {f: request.POST.getlist(f"ctn_{f}") for f in fields}
    count = max((len(v) for v in lists.values()), default=0)
    rows = []
    for i in range(count):
        rows.append(
            {
                "cartonNoFrom": _int(lists["cartonNoFrom"], i),
                "cartonNoTo": _int(lists["cartonNoTo"], i),
                "color": lists["color"][i] if i < len(lists["color"]) else "",
                "assortId": lists["assortId"][i] if i < len(lists["assortId"]) else "",
                "itemNumber": lists["itemNumber"][i] if i < len(lists["itemNumber"]) else "",
                "sizeBreakdown": lists["sizeBreakdown"][i] if i < len(lists["sizeBreakdown"]) else "",
                "qtyPerCarton": _int(lists["qtyPerCarton"], i),
                "orderQty": _int(lists["orderQty"], i),
                "ctnLength": _float(lists["ctnLength"], i),
                "ctnWidth": _float(lists["ctnWidth"], i),
                "ctnHeight": _float(lists["ctnHeight"], i),
                "netWeight": _float(lists["netWeight"], i),
                "grossWeight": _float(lists["grossWeight"], i),
            }
        )
    return rows


@login_required
def packing_list_view(request):
    if request.method == "POST":
        sourcing_request = get_object_or_404(SourcingRequest, pk=request.POST.get("requestId"))
        try:
            pl = create_packing_list(
                sourcing_request=sourcing_request,
                order_qty=int(request.POST.get("orderQty") or 0),
                shipment_qty=int(request.POST.get("shipmentQty") or 0),
                front_mark=request.POST.get("frontMark", ""),
                side_mark=request.POST.get("sideMark", ""),
                cartons=_cartons_from_post(request),
            )
        except ValidationError as exc:
            messages.error(request, str(exc.message if hasattr(exc, "message") else exc))
        else:
            log_action(request.user, "CREATE_PACKING_LIST", "PackingList", pl.id, after={"totalCbm": float(pl.totalCbm)}, ip_address=client_ip(request))
            messages.success(request, "Packing list created.")
            return redirect("packing:list")

    lists = PackingList.objects.select_related("request").prefetch_related("cartons").order_by("-createdAt")
    pending_requests = SourcingRequest.objects.filter(status=RequestStatus.APPROVED_FOR_QC, packingList__isnull=True).prefetch_related("variants")
    return render(request, "packing/packing_list.html", {"lists": lists, "pending_requests": pending_requests})

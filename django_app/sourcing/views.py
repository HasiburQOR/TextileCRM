from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.files.storage import default_storage
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from accounts.permissions import ADMIN, COMPANY_REP, role_required
from audit.utils import client_ip, log_action
from buyers.models import SisterProfile
from sourcing.forms import RejectForm, SourcingRequestForm
from sourcing.models import RequestStatus, SourcingRequest, SourcingVariant


def _variants_from_post(request):
    style_nos = request.POST.getlist("variant_styleNo")
    buyers = request.POST.getlist("variant_buyer")
    po_nos = request.POST.getlist("variant_poNo")
    colors = request.POST.getlist("variant_color")
    item_numbers = request.POST.getlist("variant_itemNumber")
    sizes = request.POST.getlist("variant_size")
    qtys = request.POST.getlist("variant_qtyOrdered")
    rows = []
    for i in range(len(style_nos)):
        if not (style_nos[i] or (buyers[i] if i < len(buyers) else "") or (po_nos[i] if i < len(po_nos) else "")):
            continue
        rows.append(
            {
                "styleNo": style_nos[i],
                "buyer": buyers[i] if i < len(buyers) else "",
                "poNo": po_nos[i] if i < len(po_nos) else "",
                "color": colors[i] if i < len(colors) else "",
                "itemNumber": item_numbers[i] if i < len(item_numbers) else "",
                "size": sizes[i] if i < len(sizes) else "",
                "qtyOrdered": int(qtys[i]) if i < len(qtys) and qtys[i].isdigit() else 0,
            }
        )
    return rows


@login_required
def request_list(request):
    qs = SourcingRequest.objects.select_related("createdBy", "reviewedBy", "sisterProfile__buyerProfile").prefetch_related("variants")
    if request.user.role == COMPANY_REP:
        qs = qs.filter(createdBy=request.user)
    status = request.GET.get("status")
    if status and status != "ALL":
        qs = qs.filter(status=status)

    if request.method == "POST":
        form = SourcingRequestForm(request.POST, request.FILES)
        if form.is_valid():
            req = form.save(commit=False)
            req.createdBy = request.user
            photo = form.cleaned_data.get("photo")
            if photo:
                path = default_storage.save(f"sourcing_photos/{photo.name}", photo)
                req.photoUrl = default_storage.url(path)
            req.save()
            for v in _variants_from_post(request):
                SourcingVariant.objects.create(request=req, **v)
            log_action(request.user, "CREATE_REQUEST", "SourcingRequest", req.id, after={"productName": req.productName, "styleNumber": req.styleNumber}, ip_address=client_ip(request))
            messages.success(request, "Sourcing request created.")
            return redirect("sourcing:list")
    else:
        form = SourcingRequestForm()

    return render(
        request,
        "sourcing/request_list.html",
        {
            "requests": qs.order_by("-createdAt"),
            "form": form,
            "status_filter": status or "ALL",
            "statuses": RequestStatus.choices,
            "sister_profiles": SisterProfile.objects.select_related("buyerProfile").all(),
        },
    )


@login_required
def request_detail(request, pk):
    req = get_object_or_404(
        SourcingRequest.objects.select_related("createdBy", "reviewedBy", "sisterProfile__buyerProfile").prefetch_related("variants"),
        pk=pk,
    )
    if request.user.role == COMPANY_REP and req.createdBy_id != request.user.id:
        from django.core.exceptions import PermissionDenied

        raise PermissionDenied
    return render(request, "sourcing/request_detail.html", {"req": req})


@role_required()
def approval_queue(request):
    pending = (
        SourcingRequest.objects.filter(status=RequestStatus.PENDING_ADMIN_APPROVAL)
        .select_related("createdBy", "sisterProfile__buyerProfile")
        .prefetch_related("variants")
        .order_by("createdAt")
    )
    reject_form = RejectForm()
    return render(request, "sourcing/approval_queue.html", {"pending": pending, "reject_form": reject_form})


@role_required()
def approve_request(request, pk):
    req = get_object_or_404(SourcingRequest, pk=pk)
    if request.method == "POST":
        before = {"status": req.status}
        req.status = RequestStatus.APPROVED_FOR_QC
        req.reviewedBy = request.user
        req.reviewedAt = timezone.now()
        req.save(update_fields=["status", "reviewedBy", "reviewedAt", "updatedAt"])
        log_action(request.user, "APPROVE_REQUEST", "SourcingRequest", req.id, before=before, after={"status": req.status}, ip_address=client_ip(request))
        messages.success(request, "Request approved for QC.")
    return redirect("sourcing:approval")


@role_required()
def reject_request(request, pk):
    req = get_object_or_404(SourcingRequest, pk=pk)
    if request.method == "POST":
        form = RejectForm(request.POST)
        if form.is_valid():
            before = {"status": req.status}
            req.status = RequestStatus.REJECTED
            req.rejectionReason = form.cleaned_data["reason"]
            req.reviewedBy = request.user
            req.reviewedAt = timezone.now()
            req.save(update_fields=["status", "rejectionReason", "reviewedBy", "reviewedAt", "updatedAt"])
            log_action(request.user, "REJECT_REQUEST", "SourcingRequest", req.id, before=before, after={"status": req.status, "reason": req.rejectionReason}, ip_address=client_ip(request))
            messages.success(request, "Request rejected.")
    return redirect("sourcing:approval")


@login_required
def catalog(request):
    qs = SourcingRequest.objects.select_related("sisterProfile__buyerProfile").prefetch_related("variants")
    search = request.GET.get("q", "")
    if search:
        qs = qs.filter(productName__icontains=search)
    return render(request, "sourcing/catalog.html", {"requests": qs.order_by("-createdAt"), "search": search})

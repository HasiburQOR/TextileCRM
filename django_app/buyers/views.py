from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render

from accounts.permissions import role_required
from audit.utils import client_ip, log_action
from buyers.forms import BuyerProfileForm, SisterProfileForm
from buyers.models import BuyerProfile, SisterProfile


@role_required()
def buyer_list(request):
    if request.method == "POST":
        form = BuyerProfileForm(request.POST)
        if form.is_valid():
            buyer = form.save()
            log_action(request.user, "CREATE_BUYER", "BuyerProfile", buyer.id, after=_buyer_snapshot(buyer), ip_address=client_ip(request))
            messages.success(request, "Buyer profile created.")
            return redirect("buyers:list")
    else:
        form = BuyerProfileForm()
    buyers = BuyerProfile.objects.all().prefetch_related("sisterProfiles")
    return render(request, "buyers/buyer_list.html", {"buyers": buyers, "form": form})


@role_required()
def buyer_delete(request, pk):
    buyer = get_object_or_404(BuyerProfile, pk=pk)
    if request.method == "POST":
        if buyer.sisterProfiles.exists():
            messages.error(request, "Cannot delete a buyer with sister profiles.")
        else:
            log_action(request.user, "DELETE_BUYER", "BuyerProfile", buyer.id, before=_buyer_snapshot(buyer), ip_address=client_ip(request))
            buyer.delete()
            messages.success(request, "Buyer profile deleted.")
    return redirect("buyers:list")


@role_required()
def sister_list(request):
    if request.method == "POST":
        form = SisterProfileForm(request.POST)
        if form.is_valid():
            sister = form.save()
            log_action(request.user, "CREATE_SISTER_PROFILE", "SisterProfile", sister.id, after=_sister_snapshot(sister), ip_address=client_ip(request))
            messages.success(request, "Sister profile created.")
            return redirect("buyers:sister_list")
    else:
        form = SisterProfileForm()
    sisters = SisterProfile.objects.select_related("buyerProfile").all()
    return render(request, "buyers/sister_list.html", {"sisters": sisters, "form": form})


@role_required()
def sister_update(request, pk):
    sister = get_object_or_404(SisterProfile, pk=pk)
    if request.method == "POST":
        form = SisterProfileForm(request.POST, instance=sister)
        if form.is_valid():
            rate_or_type_changed = (
                form.cleaned_data["agreementType"] != sister.agreementType
                or form.cleaned_data["negotiatedRate"] != sister.negotiatedRate
            )
            if rate_or_type_changed and sister.has_expenses():
                messages.error(request, "Cannot change agreement type or rate when expenses exist for this sister profile.")
                return redirect("buyers:sister_list")
            before = _sister_snapshot(sister)
            updated = form.save()
            log_action(request.user, "UPDATE_SISTER_PROFILE", "SisterProfile", updated.id, before=before, after=_sister_snapshot(updated), ip_address=client_ip(request))
            messages.success(request, "Sister profile updated.")
        return redirect("buyers:sister_list")
    return redirect("buyers:sister_list")


@login_required
def sister_detail(request, pk):
    sister = get_object_or_404(SisterProfile.objects.select_related("buyerProfile"), pk=pk)
    return render(request, "buyers/sister_detail.html", {"sister": sister})


def _buyer_snapshot(buyer):
    return {"id": str(buyer.id), "name": buyer.name, "portalUsername": buyer.portalUsername}


def _sister_snapshot(sister):
    return {
        "id": str(sister.id),
        "name": sister.name,
        "agreementType": sister.agreementType,
        "negotiatedRate": float(sister.negotiatedRate),
    }

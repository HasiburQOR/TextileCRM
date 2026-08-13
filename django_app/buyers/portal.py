from functools import wraps

from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.shortcuts import get_object_or_404, redirect, render

from buyers.models import BuyerProfile


def portal_required(view_func):
    @wraps(view_func)
    def wrapped(request, *args, **kwargs):
        buyer_id = request.session.get(settings.BUYER_PORTAL_SESSION_KEY)
        if not buyer_id:
            return redirect("buyers:portal_login")
        request.portal_buyer = get_object_or_404(BuyerProfile, pk=buyer_id)
        return view_func(request, *args, **kwargs)

    return wrapped


def portal_login(request):
    error = None
    if request.method == "POST":
        username = request.POST.get("username", "")
        password = request.POST.get("password", "")
        buyer = BuyerProfile.objects.filter(portalUsername=username).first()
        if buyer and check_password(password, buyer.portalPasswordHash):
            request.session[settings.BUYER_PORTAL_SESSION_KEY] = str(buyer.id)
            return redirect("portal:dashboard")
        error = "Invalid portal username or password."
    return render(request, "buyers/portal_login.html", {"error": error})


def portal_logout(request):
    request.session.pop(settings.BUYER_PORTAL_SESSION_KEY, None)
    return redirect("buyers:portal_login")


@portal_required
def portal_dashboard(request):
    buyer = request.portal_buyer
    sisters = buyer.sisterProfiles.all().prefetch_related("sourcingRequests", "invoices", "expense_set", "documentVaults")
    return render(request, "buyers/portal_dashboard.html", {"buyer": buyer, "sisters": sisters})

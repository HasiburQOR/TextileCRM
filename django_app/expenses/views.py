from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, render

from audit.utils import client_ip, log_action
from buyers.models import SisterProfile
from expenses.models import Expense, SourceType
from expenses.services import compute_settlement


@login_required
def expense_list(request):
    if request.method == "POST":
        sister_profile = get_object_or_404(SisterProfile, pk=request.POST.get("sisterProfileId"))
        expense = Expense.objects.create(
            sisterProfile=sister_profile,
            productId=request.POST.get("productId") or None,
            sourceType=request.POST.get("sourceType"),
            amount=request.POST.get("amount") or 0,
            currency=request.POST.get("currency", "BDT"),
            remarks=request.POST.get("remarks", ""),
            createdBy=request.user,
        )
        log_action(request.user, "CREATE_EXPENSE", "Expense", expense.id, after={"amount": float(expense.amount), "sourceType": expense.sourceType}, ip_address=client_ip(request))
        messages.success(request, "Expense recorded.")

    qs = Expense.objects.select_related("sisterProfile__buyerProfile", "createdBy")
    sister_filter = request.GET.get("sisterProfile")
    if sister_filter:
        qs = qs.filter(sisterProfile_id=sister_filter)
    return render(
        request,
        "expenses/expense_list.html",
        {
            "expenses": qs.order_by("-createdAt"),
            "sister_profiles": SisterProfile.objects.select_related("buyerProfile").all(),
            "source_types": SourceType.choices,
            "sister_filter": sister_filter or "",
        },
    )


@login_required
def settlement_view(request):
    sister_profiles = SisterProfile.objects.select_related("buyerProfile").all()
    selected_id = request.GET.get("sisterProfile")
    settlement = None
    if selected_id:
        sister_profile = get_object_or_404(SisterProfile, pk=selected_id)
        settlement = compute_settlement(sister_profile)
    return render(request, "expenses/settlement.html", {"sister_profiles": sister_profiles, "settlement": settlement, "selected_id": selected_id or ""})

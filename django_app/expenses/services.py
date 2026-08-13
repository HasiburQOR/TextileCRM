from decimal import Decimal

from django.db.models import Sum

from buyers.models import AgreementType, SisterProfile
from core.utils import round_money
from expenses.models import Expense
from sourcing.models import SourcingVariant
from trips.models import SourcingTrip


def compute_settlement(sister_profile: SisterProfile) -> dict:
    total_advance = (
        SourcingTrip.objects.filter(request__sisterProfile=sister_profile).aggregate(total=Sum("totalAdvance"))["total"]
        or Decimal("0")
    )
    total_expense = (
        Expense.objects.filter(sisterProfile=sister_profile).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    )
    total_quantity = (
        SourcingVariant.objects.filter(request__sisterProfile=sister_profile).aggregate(total=Sum("qtyOrdered"))["total"]
        or 0
    )

    rate = sister_profile.negotiatedRate
    if sister_profile.agreementType == AgreementType.TYPE_1:
        amount_owed = total_expense * (rate / Decimal("100"))
    elif sister_profile.agreementType == AgreementType.TYPE_2:
        amount_owed = rate * total_quantity
    elif sister_profile.agreementType == AgreementType.TYPE_3:
        amount_owed = total_expense + total_expense * (rate / Decimal("100"))
    else:
        amount_owed = Decimal("0")

    amount_owed = round_money(amount_owed)
    net_position = round_money(total_advance - amount_owed)

    return {
        "sisterProfile": sister_profile,
        "agreementType": sister_profile.agreementType,
        "negotiatedRate": rate,
        "totalAdvance": round_money(total_advance),
        "totalExpense": round_money(total_expense),
        "amountOwed": amount_owed,
        "netPosition": net_position,
        "negativeBalance": net_position < 0,
    }

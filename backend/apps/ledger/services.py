"""
Settlement Ledger recompute (BR-49 / FR-74). Formulas per BRD §4.3:

  Type 1 (% of purchase value): amountOwed = totalExpense * (percentage_rate / 100)
  Type 2 (fixed rate per unit): amountOwed = rate_per_unit * totalQuantitySourced
  Type 3 (reimburse + commission): amountOwed = totalExpense + totalExpense * (commission_percentage / 100)

netPosition = totalAdvance - amountOwed; negative means the buyer's spend
has outrun their advance (BR-50's Negative-Balance Alert).
"""

from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Sum

from apps.buyers.models import AGREEMENT_TYPE_RATE_KEYS, AgreementType, SisterProfile
from apps.expenses.models import Expense, SourceType
from apps.ledger.models import SettlementLedger
from apps.sourcing.models import ProductVariant


def _round2(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def recompute_settlement(sister_profile: SisterProfile) -> SettlementLedger:
    total_advance = (
        Expense.objects.filter(sisterProfile=sister_profile, sourceType=SourceType.SOURCING_ADVANCE)
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0")
    )
    total_expense = (
        Expense.objects.filter(sisterProfile=sister_profile)
        .exclude(sourceType=SourceType.SOURCING_ADVANCE)
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0")
    )

    rate_key = AGREEMENT_TYPE_RATE_KEYS.get(sister_profile.agreementType)
    rate = Decimal(str((sister_profile.agreementRateConfig or {}).get(rate_key, 0)))

    if sister_profile.agreementType == AgreementType.TYPE_1:
        amount_owed = total_expense * (rate / Decimal("100"))
    elif sister_profile.agreementType == AgreementType.TYPE_2:
        total_qty = (
            ProductVariant.objects.filter(product__sisterProfile=sister_profile).aggregate(total=Sum("orderQty"))["total"]
            or 0
        )
        amount_owed = rate * total_qty
    elif sister_profile.agreementType == AgreementType.TYPE_3:
        amount_owed = total_expense + total_expense * (rate / Decimal("100"))
    else:
        amount_owed = Decimal("0")

    amount_owed = _round2(amount_owed)
    net_position = _round2(total_advance - amount_owed)
    is_negative = net_position < 0

    was_negative = SettlementLedger.objects.filter(sisterProfile=sister_profile, negativeBalance=True).exists()

    ledger, _ = SettlementLedger.objects.update_or_create(
        sisterProfile=sister_profile,
        defaults={
            "totalAdvance": _round2(total_advance),
            "totalExpense": _round2(total_expense),
            "amountOwed": amount_owed,
            "netPosition": net_position,
            "negativeBalance": is_negative,
        },
    )

    # BR-50 / FR-76: alert on the transition into a negative balance, not on
    # every recompute — otherwise every subsequent Expense write on an
    # already-negative Sister Profile would re-fire the same alert.
    if is_negative and not was_negative:
        from apps.notifications.models import NotificationType
        from apps.notifications.services import notify_admins_and_buyer

        notify_admins_and_buyer(
            sister_profile=sister_profile, title="Negative balance alert",
            message=f"{sister_profile.poReference or sister_profile.id}'s recorded expense now exceeds its advance (net position {net_position}).",
            notification_type=NotificationType.NEGATIVE_BALANCE_ALERT,
        )

    return ledger

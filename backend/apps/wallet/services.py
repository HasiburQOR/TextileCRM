"""
Buyer_Wallet_Module.md — Business Rules. Single write path, same convention
as apps.expenses.services.record_expense: nothing outside this module ever
creates a WalletTransaction directly, and nothing outside apps.expenses ever
calls record_deduction/record_refund below (they're wired in from
apps.expenses.services.record_expense/delete_expenses so the Expense row and
its wallet transaction land in the same atomic write — "Single write path"
business rule, never two separate calls from a third app).
"""

from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum

from apps.wallet.models import BuyerWallet, WalletTransaction, WalletTransactionType


def _round2(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def create_wallet(buyer_profile, currency="USD") -> BuyerWallet:
    """WF-01: exactly one BuyerWallet per Buyer Profile, created
    automatically — get_or_create makes this safe to call defensively from
    anywhere a BuyerProfile might come into existence (the ViewSet, a data
    migration backfilling pre-existing buyers, tests, ...) without ever
    producing a duplicate."""
    wallet, _ = BuyerWallet.objects.get_or_create(buyerProfile=buyer_profile, defaults={"currency": currency})
    return wallet


@transaction.atomic
def record_top_up(*, wallet: BuyerWallet, amount, currency, method_reference, created_by) -> WalletTransaction:
    """WF-02: Admin-only (enforced by the view, not here — same convention
    as every other service in this codebase, see apps.invoicing.services)."""
    amount = _round2(amount)
    if amount <= 0:
        raise ValidationError("Top-up amount must be positive.")
    if not method_reference:
        raise ValidationError("A method/reference is required for a top-up.")

    txn = WalletTransaction.objects.create(
        wallet=wallet, type=WalletTransactionType.TOP_UP, amount=amount, currency=currency or wallet.currency,
        sourceType="manual_top_up", methodReference=method_reference, createdBy=created_by,
    )
    recompute_wallet_balance(wallet)

    from apps.audit.services import log_action

    log_action(
        actor=created_by, action="WALLET_TOP_UP", entity_type="WalletTransaction", entity_id=txn.id,
        after={"walletId": str(wallet.buyerProfile_id), "amount": txn.amount, "methodReference": method_reference},
    )
    return txn


@transaction.atomic
def record_adjustment(*, wallet: BuyerWallet, amount, reason, created_by, sister_profile=None) -> WalletTransaction:
    """WF-06: Admin-only, positive or negative, reason always required —
    for corrections that don't map to a specific Expense."""
    amount = _round2(amount)
    if amount == 0:
        raise ValidationError("Adjustment amount must be non-zero.")
    if not reason:
        raise ValidationError("A reason is required for a manual adjustment.")

    txn = WalletTransaction.objects.create(
        wallet=wallet, type=WalletTransactionType.ADJUSTMENT, amount=amount, currency=wallet.currency,
        sourceType="manual_adjustment", sisterProfile=sister_profile, reason=reason, createdBy=created_by,
    )
    recompute_wallet_balance(wallet)

    from apps.audit.services import log_action

    log_action(
        actor=created_by, action="WALLET_ADJUSTMENT", entity_type="WalletTransaction", entity_id=txn.id,
        after={"walletId": str(wallet.buyerProfile_id), "amount": txn.amount, "reason": reason},
    )
    return txn


@transaction.atomic
def record_deduction(
    *, wallet: BuyerWallet, amount, source_type, sister_profile, created_by,
    source_expense=None, currency=None, exchange_rate_used=None,
) -> WalletTransaction | None:
    """WF-03/WF-04: called only from apps.expenses.services.record_expense,
    in the same atomic block as the Expense row it deducts for. `amount` is
    the positive cost being deducted; stored as a negative WalletTransaction
    amount (see models.py). Mirrors record_expense's own "skip on falsy
    amount" behavior so a zero-amount Expense never produces a zero-value
    wallet row either."""
    if not amount:
        return None
    txn = WalletTransaction.objects.create(
        wallet=wallet, type=WalletTransactionType.DEDUCTION, amount=-_round2(amount), currency=currency or wallet.currency,
        exchangeRateUsed=exchange_rate_used, sourceType=source_type, sourceExpense=source_expense,
        sisterProfile=sister_profile, createdBy=created_by,
    )
    recompute_wallet_balance(wallet)
    return txn


@transaction.atomic
def record_refund(
    *, wallet: BuyerWallet, amount, source_type, sister_profile, created_by,
    source_expense=None, currency=None, reason="",
) -> WalletTransaction | None:
    """WF-05: called only from apps.expenses.services.delete_expenses, when
    an Expense is voided/corrected — writes a new reversing row rather than
    ever touching the original deduction (append-only)."""
    if not amount:
        return None
    txn = WalletTransaction.objects.create(
        wallet=wallet, type=WalletTransactionType.REFUND, amount=_round2(amount), currency=currency or wallet.currency,
        sourceType=source_type, sourceExpense=source_expense, sisterProfile=sister_profile,
        reason=reason or "Expense corrected/voided", createdBy=created_by,
    )
    recompute_wallet_balance(wallet)
    return txn


def recompute_wallet_balance(wallet: BuyerWallet) -> BuyerWallet:
    """WF-07: recomputes near-real-time, in the same call as every write
    above — never a separate batch job. `balance` is a materialized cache of
    SUM(transactions.amount); see models.py's docstring for why it's never
    hand-edited. WF-08: fires the Negative/Low-Balance alert only on the
    transition into that state, not on every subsequent write, same pattern
    as apps.ledger.services.recompute_settlement."""
    total = _round2(wallet.transactions.aggregate(total=Sum("amount"))["total"] or Decimal("0"))

    was_negative = wallet.negativeBalance
    was_low = wallet.lowBalance

    is_negative = total < 0
    is_low = (
        not is_negative
        and wallet.lowBalanceThreshold is not None
        and Decimal("0") <= total <= wallet.lowBalanceThreshold
    )

    wallet.balance = total
    wallet.negativeBalance = is_negative
    wallet.lowBalance = is_low
    wallet.save(update_fields=["balance", "negativeBalance", "lowBalance", "updatedAt"])

    if is_negative and not was_negative:
        from apps.notifications.models import NotificationType
        from apps.notifications.services import notify_admins_and_buyer_profile

        notify_admins_and_buyer_profile(
            buyer_profile=wallet.buyerProfile, title="Wallet balance is negative",
            message=f"{wallet.buyerProfile.name}'s wallet balance is now {total} {wallet.currency}.",
            notification_type=NotificationType.WALLET_NEGATIVE_BALANCE,
        )
    elif is_low and not was_low:
        from apps.notifications.models import NotificationType
        from apps.notifications.services import notify_admins_and_buyer_profile

        notify_admins_and_buyer_profile(
            buyer_profile=wallet.buyerProfile, title="Wallet balance is low",
            message=f"{wallet.buyerProfile.name}'s wallet balance ({total} {wallet.currency}) is at or below its low-balance threshold ({wallet.lowBalanceThreshold} {wallet.currency}).",
            notification_type=NotificationType.WALLET_LOW_BALANCE,
        )

    return wallet

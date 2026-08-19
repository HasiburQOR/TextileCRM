"""
DRF Migration Instructions §3, Phase 3: "build this service function FIRST,
before Phase 3's other models, so QC and Warehouse modules call into it from
day one rather than being retrofitted." Every other app imports
`record_expense` — nothing outside this module ever calls
`Expense.objects.create()` directly.

Buyer_Wallet_Module.md "Single write path": this is also the one place that
writes the Buyer Wallet's `deduction`/`refund` WalletTransactions — never a
separate call from another app, so the Central Expense Table and the Buyer
Wallet can never drift apart.
"""

from decimal import ROUND_HALF_UP, Decimal

from apps.expenses.models import Expense


def _round2(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _refund_for_expenses(*, wallet, expenses, sister_profile, actor, reason=None) -> None:
    """Write one reversing `refund` WalletTransaction per Expense, mirroring
    the original deduction exactly — including its LOCKED exchange rate.

    Reversing at the profile's current rate instead would leak money whenever
    the rate has moved since: a 12,000 BDT cost deducted at 120 (100 USD) and
    refunded at 100 (120 USD) hands the buyer 20 USD they never paid. The
    original deduction row is the only source of truth for what was charged,
    so every figure is copied off it rather than recomputed.

    The deduction itself is never touched (append-only) and survives with its
    sourceExpense FK nulled once the Expense it points at is gone.
    """
    from apps.wallet.models import WalletTransaction, WalletTransactionType
    from apps.wallet.services import record_refund

    for expense in expenses:
        deduction = WalletTransaction.objects.filter(
            wallet=wallet, type=WalletTransactionType.DEDUCTION, sourceExpense=expense
        ).first()
        if not deduction:
            continue
        record_refund(
            wallet=wallet, amount=-deduction.amount, source_type=expense.sourceType,
            sister_profile=sister_profile, source_expense=expense,
            created_by=actor or deduction.createdBy, currency=deduction.currency,
            source_amount=-deduction.sourceAmount if deduction.sourceAmount is not None else None,
            source_currency=deduction.sourceCurrency,
            exchange_rate_used=deduction.exchangeRateUsed,
            reason=reason or f"Reversal of {expense.get_sourceType_display()} expense (corrected or removed)",
        )


def delete_expenses(*, product, source_types: list[str], warehouse_cost=None, actor=None) -> None:
    """Reverses record_expense() for a product's specific source types —
    used when a QC/warehouse cost report is edited or deleted, so the old
    line items don't linger in the Central Expense Table after the report
    they came from no longer reflects them.

    `product` keeps its original meaning, including `product=None` as a
    deliberate filter (e.g. "expenses with no product tie") — existing
    callers rely on that. `warehouse_cost`, when given, narrows the filter
    further: WarehouseCost isn't 1:1 with anything the way a QC report is
    with a Product (several WarehouseCost records can exist per Sister
    Profile), so `product` alone can't disambiguate which record's rows to
    touch — this is what lets editing or deleting one WarehouseCost leave
    a sibling record's Expense rows alone.

    WF-05: before the Expense rows are hard-deleted, writes a `refund`
    WalletTransaction reversing each one's original `deduction` — the
    deduction row itself is never touched (append-only), and survives with
    its sourceExpense FK set to null once the Expense it pointed to is gone.
    `actor` defaults to the original deduction's creator when the caller
    doesn't have a more specific one on hand (e.g. delete_qc_report has no
    "who's deleting this" parameter today).
    """
    qs = Expense.objects.filter(product=product, sourceType__in=source_types)
    if warehouse_cost is not None:
        qs = qs.filter(warehouseCost=warehouse_cost)
    expenses = list(qs)
    sister_profile = expenses[0].sisterProfile if expenses else None

    if expenses:
        from apps.wallet.services import create_wallet

        _refund_for_expenses(
            wallet=create_wallet(sister_profile.buyerProfile), expenses=expenses,
            sister_profile=sister_profile, actor=actor,
        )

    qs.delete()


def record_expense(*, sister_profile, source_type, amount, created_by, product=None, warehouse_cost=None, currency=None, remarks="", field_name="") -> Expense | None:
    """Skips recording when amount is falsy (0/None) — matches every
    cost-entry form in the spec (e.g. an unchecked warehouse packaging
    checkbox has no amount and shouldn't leave a zero-value audit row).

    `currency` defaults to the Sister Profile's supplierCurrency — where the
    cost was actually incurred — and the amount is then converted into the
    buyer's currency at the profile's rate before it hits the Buyer Wallet,
    which is denominated in the buyer's currency. Both figures and the rate
    are stored on the Expense and on the WalletTransaction, so each side
    sees the number it recognises and a later refund can reverse at exactly
    the rate that was charged.

    Two cases skip conversion and store the amount 1:1:
      * the profile has no rate yet (exchangeRate 0, "not agreed"), and
      * the caller named a currency of its own, which the profile's
        supplier→buyer rate says nothing about.
    Both leave `exchangeRateUsed` NULL, which is what "not converted" means
    everywhere downstream.
    """
    if not amount:
        return None

    currency = currency or sister_profile.supplierCurrency
    buyer_currency = sister_profile.buyerCurrency
    if currency == sister_profile.supplierCurrency:
        buyer_amount = sister_profile.convert_to_buyer_currency(amount)
    else:
        buyer_amount = None
    rate_used = sister_profile.exchangeRate if buyer_amount is not None else None
    if buyer_amount is None:
        buyer_amount = _round2(amount)
        buyer_currency = currency

    expense = Expense.objects.create(
        sisterProfile=sister_profile,
        product=product,
        warehouseCost=warehouse_cost,
        sourceType=source_type,
        amount=amount,
        currency=currency,
        buyerCurrency=buyer_currency,
        amountInBuyerCurrency=buyer_amount,
        exchangeRateUsed=rate_used,
        remarks=remarks,
        fieldName=field_name,
        createdBy=created_by,
    )

    # FR-82: "any Expense write" gets an audit log entry.
    # Buyer_Wallet_Module.md WF-03/WF-04: the same write also deducts the
    # Buyer Wallet, in the same atomic transaction as the Expense row.
    # Both imported lazily (not at module top) so apps.expenses — a
    # Phase 3 app — doesn't hard-depend on apps.audit/apps.wallet at
    # Django's app-loading time; only at call time, once all are installed.
    from apps.audit.services import log_action
    from apps.wallet.services import create_wallet, record_deduction

    wallet = create_wallet(sister_profile.buyerProfile)
    record_deduction(
        wallet=wallet, amount=buyer_amount, source_type=source_type, sister_profile=sister_profile,
        source_expense=expense, currency=buyer_currency, created_by=created_by,
        source_amount=amount, source_currency=currency, exchange_rate_used=rate_used,
    )
    log_action(
        actor=created_by, action="CREATE_EXPENSE", entity_type="Expense", entity_id=expense.id,
        after={
            "sourceType": expense.sourceType, "amount": expense.amount, "currency": expense.currency,
            "amountInBuyerCurrency": expense.amountInBuyerCurrency, "buyerCurrency": expense.buyerCurrency,
            "exchangeRateUsed": str(rate_used) if rate_used else None,
            "sisterProfileId": str(sister_profile.id),
        },
    )

    return expense

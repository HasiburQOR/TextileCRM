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

from apps.expenses.models import Expense


def delete_expenses(*, product, source_types: list[str], warehouse_cost=None, actor=None) -> None:
    """Reverses record_expense() for a product's specific source types —
    used when a QC/warehouse cost report is edited or deleted, so the old
    line items don't linger in the Central Expense Table after the report
    they came from no longer reflects them. Recomputes the Settlement
    Ledger afterward, same as record_expense() does on write.

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
        from apps.wallet.models import WalletTransaction, WalletTransactionType
        from apps.wallet.services import create_wallet, record_refund

        wallet = create_wallet(sister_profile.buyerProfile)
        for expense in expenses:
            deduction = WalletTransaction.objects.filter(
                wallet=wallet, type=WalletTransactionType.DEDUCTION, sourceExpense=expense
            ).first()
            if deduction:
                record_refund(
                    wallet=wallet, amount=-deduction.amount, source_type=expense.sourceType,
                    sister_profile=sister_profile, source_expense=expense,
                    created_by=actor or deduction.createdBy, currency=deduction.currency,
                    reason=f"Reversal of {expense.get_sourceType_display()} expense (corrected or removed)",
                )

    qs.delete()
    if sister_profile:
        from apps.ledger.services import recompute_settlement

        recompute_settlement(sister_profile)


def record_expense(*, sister_profile, source_type, amount, created_by, product=None, warehouse_cost=None, currency="BDT", remarks="", field_name="") -> Expense | None:
    """Skips recording when amount is falsy (0/None) — matches every
    cost-entry form in the spec (e.g. an unchecked warehouse packaging
    checkbox has no amount and shouldn't leave a zero-value audit row)."""
    if not amount:
        return None
    expense = Expense.objects.create(
        sisterProfile=sister_profile,
        product=product,
        warehouseCost=warehouse_cost,
        sourceType=source_type,
        amount=amount,
        currency=currency,
        remarks=remarks,
        fieldName=field_name,
        createdBy=created_by,
    )

    # FR-75: the Settlement Ledger recomputes on every new Expense row.
    # FR-82: "any Expense write" gets an audit log entry.
    # Buyer_Wallet_Module.md WF-03/WF-04: the same write also deducts the
    # Buyer Wallet, in the same atomic transaction as the Expense row.
    # All three imported lazily (not at module top) so apps.expenses — a
    # Phase 3 app — doesn't hard-depend on apps.ledger/apps.audit/apps.wallet
    # at Django's app-loading time; only at call time, once all are installed.
    from apps.audit.services import log_action
    from apps.ledger.services import recompute_settlement
    from apps.wallet.services import create_wallet, record_deduction

    recompute_settlement(sister_profile)
    wallet = create_wallet(sister_profile.buyerProfile)
    record_deduction(
        wallet=wallet, amount=amount, source_type=source_type, sister_profile=sister_profile,
        source_expense=expense, currency=currency, created_by=created_by,
    )
    log_action(
        actor=created_by, action="CREATE_EXPENSE", entity_type="Expense", entity_id=expense.id,
        after={"sourceType": expense.sourceType, "amount": expense.amount, "sisterProfileId": str(sister_profile.id)},
    )

    return expense

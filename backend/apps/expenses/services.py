"""
DRF Migration Instructions §3, Phase 3: "build this service function FIRST,
before Phase 3's other models, so QC and Warehouse modules call into it from
day one rather than being retrofitted." Every other app imports
`record_expense` — nothing outside this module ever calls
`Expense.objects.create()` directly.
"""

from apps.expenses.models import Expense


def delete_expenses(*, product, source_types: list[str]) -> None:
    """Reverses record_expense() for a product's specific source types —
    used when a QC/warehouse cost report is edited or deleted, so the old
    line items don't linger in the Central Expense Table after the report
    they came from no longer reflects them. Recomputes the Settlement
    Ledger afterward, same as record_expense() does on write."""
    qs = Expense.objects.filter(product=product, sourceType__in=source_types)
    sister_profile = qs.first().sisterProfile if qs.exists() else None
    qs.delete()
    if sister_profile:
        from apps.ledger.services import recompute_settlement

        recompute_settlement(sister_profile)


def record_expense(*, sister_profile, source_type, amount, created_by, product=None, currency="BDT", remarks="", field_name="") -> Expense | None:
    """Skips recording when amount is falsy (0/None) — matches every
    cost-entry form in the spec (e.g. an unchecked warehouse packaging
    checkbox has no amount and shouldn't leave a zero-value audit row)."""
    if not amount:
        return None
    expense = Expense.objects.create(
        sisterProfile=sister_profile,
        product=product,
        sourceType=source_type,
        amount=amount,
        currency=currency,
        remarks=remarks,
        fieldName=field_name,
        createdBy=created_by,
    )

    # FR-75: the Settlement Ledger recomputes on every new Expense row.
    # FR-82: "any Expense write" gets an audit log entry.
    # Both imported lazily (not at module top) so apps.expenses — a Phase 3
    # app — doesn't hard-depend on apps.ledger/apps.audit — Phase 5/6 apps —
    # at Django's app-loading time; only at call time, once all are installed.
    from apps.audit.services import log_action
    from apps.ledger.services import recompute_settlement

    recompute_settlement(sister_profile)
    log_action(
        actor=created_by, action="CREATE_EXPENSE", entity_type="Expense", entity_id=expense.id,
        after={"sourceType": expense.sourceType, "amount": expense.amount, "sisterProfileId": str(sister_profile.id)},
    )

    return expense

"""Backfill the dual-currency columns on pre-existing Expense rows.

Deliberately 1:1 — `amountInBuyerCurrency` is set to `amount` and
`exchangeRateUsed` is left NULL, NOT converted at the Sister Profile's
current rate.

The rate that applied when each of these costs was actually incurred was
never recorded (that is the whole point of the columns being added), so
converting them now would use today's rate for yesterday's spend. Because
BuyerWallet.balance is a materialized SUM of the wallet transactions that
these expenses produced, doing so would silently restate every buyer's
balance the moment this migration ran. A NULL rate is the honest value: it
means "not converted", which is exactly what happened.
"""

from django.db import migrations


def forwards(apps, schema_editor):
    Expense = apps.get_model("expenses", "Expense")

    to_update = []
    for expense in Expense.objects.select_related("sisterProfile").iterator(chunk_size=500):
        expense.buyerCurrency = expense.sisterProfile.buyerCurrency
        expense.amountInBuyerCurrency = expense.amount
        expense.exchangeRateUsed = None
        to_update.append(expense)
        if len(to_update) >= 500:
            Expense.objects.bulk_update(
                to_update, ["buyerCurrency", "amountInBuyerCurrency", "exchangeRateUsed"]
            )
            to_update = []
    if to_update:
        Expense.objects.bulk_update(
            to_update, ["buyerCurrency", "amountInBuyerCurrency", "exchangeRateUsed"]
        )


class Migration(migrations.Migration):

    dependencies = [
        ("expenses", "0003_expense_amountinbuyercurrency_expense_buyercurrency_and_more"),
        ("buyers", "0006_remove_sisterprofile_agreementrateconfig_and_more"),
    ]

    operations = [
        # Reverse is a no-op: the columns themselves are dropped by the
        # reverse of 0003, so there is nothing to undo here.
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]

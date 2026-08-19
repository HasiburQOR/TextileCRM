"""Split the pre-existing deduction/refund rows into their two currencies.

Until now `record_deduction` copied the Expense's currency (BDT) onto a row
whose `amount` was summed straight into a wallet held in USD — so the ledger
showed a USD running balance labelled BDT, and no conversion ever happened.
The new columns separate the two: `sourceAmount`/`sourceCurrency` is what was
spent, `amount`/`currency` is what the buyer was charged.

For historical rows the two are the same number (nothing was ever converted),
so this moves the old label into `sourceCurrency` and puts the wallet's own
currency on `currency`, where it belonged. `amount` is never touched, so no
balance moves — this is a labelling fix, not a restatement.

Top-ups and adjustments are left alone: they were always made in the wallet's
own currency and have no separate source figure.

Not cleanly reversible — the original (incorrect) `currency` value is not
recoverable once overwritten, hence the noop reverse.
"""

from django.db import migrations


def forwards(apps, schema_editor):
    WalletTransaction = apps.get_model("wallet", "WalletTransaction")

    to_update = []
    qs = WalletTransaction.objects.filter(type__in=["deduction", "refund"]).select_related("wallet")
    for txn in qs.iterator(chunk_size=500):
        txn.sourceAmount = txn.amount
        txn.sourceCurrency = txn.currency
        txn.currency = txn.wallet.currency
        to_update.append(txn)
        if len(to_update) >= 500:
            WalletTransaction.objects.bulk_update(to_update, ["sourceAmount", "sourceCurrency", "currency"])
            to_update = []
    if to_update:
        WalletTransaction.objects.bulk_update(to_update, ["sourceAmount", "sourceCurrency", "currency"])


class Migration(migrations.Migration):

    dependencies = [
        ("wallet", "0003_wallettransaction_sourceamount_and_more"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]

from django.db import migrations


class Migration(migrations.Migration):
    """Drops the per-invoice ExchangeRate FK and the rateQuote direction
    flag — currency configuration now lives on SisterProfile and is
    snapshotted onto the invoice at generation (exchangeRateValueLocked /
    sourceCurrency / targetCurrency)."""

    dependencies = [
        ("invoicing", "0008_backfill_invoice_agreement_snapshots"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="invoice",
            name="exchangeRate",
        ),
        migrations.RemoveField(
            model_name="invoice",
            name="rateQuote",
        ),
    ]

from django.db import migrations


class Migration(migrations.Migration):
    """Drops the SettlementLedger table — the settlement-ledger subsystem
    was removed in the agreement redesign (agreement = label-only, currency
    config on SisterProfile, amount-owed on Invoice)."""

    dependencies = [
        ("ledger", "0001_initial"),
    ]

    operations = [
        migrations.DeleteModel(name="SettlementLedger"),
    ]

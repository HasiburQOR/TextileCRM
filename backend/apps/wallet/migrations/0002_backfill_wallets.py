# Buyer_Wallet_Module.md WF-01: "Every Buyer Profile has exactly one
# BuyerWallet" must hold immediately, including for Buyer Profiles that
# already existed before this module shipped — not just ones created after.
from django.db import migrations


def backfill_wallets(apps, schema_editor):
    BuyerProfile = apps.get_model("buyers", "BuyerProfile")
    BuyerWallet = apps.get_model("wallet", "BuyerWallet")
    existing_ids = set(BuyerWallet.objects.values_list("buyerProfile_id", flat=True))
    BuyerWallet.objects.bulk_create(
        BuyerWallet(buyerProfile_id=buyer_id, currency="USD")
        for buyer_id in BuyerProfile.objects.exclude(id__in=existing_ids).values_list("id", flat=True)
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("wallet", "0001_initial"),
        ("buyers", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(backfill_wallets, noop_reverse),
    ]

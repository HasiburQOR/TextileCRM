# Step 2 of 3 — assigns each pre-existing BuyerProfile/SisterProfile a real,
# distinct BUY-####/SIS-#### code via the same atomic select_for_update()
# counter apps.core.utils.generate_reference_code uses at runtime (inlined
# here against historical models, same discipline as
# apps.wallet.migrations.0002_backfill_wallets — never import live app code
# into a migration). Same "BUY"/"SIS" counter keys, so future auto-generated
# codes continue this exact sequence with no risk of colliding with these.
from django.db import migrations, transaction


def _next_seq(SequenceCounter, key: str) -> int:
    counter, _ = SequenceCounter.objects.select_for_update().get_or_create(key=key, defaults={"value": 0})
    counter.value += 1
    counter.save(update_fields=["value"])
    return counter.value


def backfill_reference_codes(apps, schema_editor):
    BuyerProfile = apps.get_model("buyers", "BuyerProfile")
    SisterProfile = apps.get_model("buyers", "SisterProfile")
    SequenceCounter = apps.get_model("core", "SequenceCounter")

    with transaction.atomic():
        for buyer in BuyerProfile.objects.filter(referenceCode__isnull=True).order_by("createdAt"):
            buyer.referenceCode = f"BUY-{_next_seq(SequenceCounter, 'BUY'):04d}"
            buyer.save(update_fields=["referenceCode"])
        for sister in SisterProfile.objects.filter(referenceCode__isnull=True).order_by("createdAt"):
            sister.referenceCode = f"SIS-{_next_seq(SequenceCounter, 'SIS'):04d}"
            sister.save(update_fields=["referenceCode"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("buyers", "0003_referencecode_nullable"),
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(backfill_reference_codes, noop_reverse),
    ]

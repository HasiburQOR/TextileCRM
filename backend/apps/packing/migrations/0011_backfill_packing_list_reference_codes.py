# Step 2 of 3 — assigns each pre-existing PackingList a real, distinct
# PKG-#### code via the same atomic select_for_update() counter
# apps.core.utils.generate_reference_code uses at runtime (inlined here
# against historical models — never import live app code into a migration,
# same discipline as apps.buyers.migrations.0004_backfill_reference_codes).
# Same "PKG" counter key, so future auto-generated codes continue this exact
# sequence with no risk of colliding with these.
from django.db import migrations, transaction


def _next_seq(SequenceCounter, key: str) -> int:
    counter, _ = SequenceCounter.objects.select_for_update().get_or_create(key=key, defaults={"value": 0})
    counter.value += 1
    counter.save(update_fields=["value"])
    return counter.value


def backfill_reference_codes(apps, schema_editor):
    PackingList = apps.get_model("packing", "PackingList")
    SequenceCounter = apps.get_model("core", "SequenceCounter")

    with transaction.atomic():
        for packing_list in PackingList.objects.filter(referenceCode__isnull=True).order_by("createdAt"):
            packing_list.referenceCode = f"PKG-{_next_seq(SequenceCounter, 'PKG'):04d}"
            packing_list.save(update_fields=["referenceCode"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("packing", "0010_packinglist_referencecode_nullable"),
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(backfill_reference_codes, noop_reverse),
    ]

# Packing_List_Module_Instructions.md §3.1: PO No is a row-level field on
# PackingCarton, defaulting from the carton's Product but independently
# stored/editable per row. Backfills existing cartons from their product's
# poNo in the same migration — safe to combine with the AddField here since,
# unlike Reference_Numbers_Identifier_System.md's referenceCode, this field
# carries no uniqueness constraint (no null-then-backfill dance needed).
from django.db import migrations, models


def backfill_po_no(apps, schema_editor):
    PackingCarton = apps.get_model("packing", "PackingCarton")
    for carton in PackingCarton.objects.select_related("product").filter(poNo=""):
        if carton.product.poNo:
            carton.poNo = carton.product.poNo
            carton.save(update_fields=["poNo"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("packing", "0005_alter_packingcarton_sizebreakdown"),
    ]

    operations = [
        migrations.AddField(
            model_name="packingcarton",
            name="poNo",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.RunPython(backfill_po_no, noop_reverse),
    ]

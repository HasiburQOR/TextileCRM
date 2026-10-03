# Sourcing-Intake-as-Packing-List merge, part 3 of 4: swaps
# InvoiceLineItem.packingCarton for InvoiceLineItem.productVariant. The
# backfill re-points every existing line at the intake variant its carton
# merged into (apps.sourcing.migrations.0021 runs first and guarantees that
# variant exists — same product, same colorName).
from django.db import migrations, models
import django.db.models.deletion as deletion


def repoint_line_items(apps, schema_editor):
    InvoiceLineItem = apps.get_model("invoicing", "InvoiceLineItem")
    PackingCarton = apps.get_model("packing", "PackingCarton")
    ProductVariant = apps.get_model("sourcing", "ProductVariant")

    cartons = {
        c.id: c
        for c in PackingCarton.objects.select_related("product").only("id", "product_id", "colorName")
    }
    for li in InvoiceLineItem.objects.exclude(packingCarton=None):
        carton = cartons.get(li.packingCarton_id)
        if carton is None:
            continue
        variant = ProductVariant.objects.filter(
            product_id=carton.product_id, colorName=carton.colorName
        ).first()
        if variant is not None:
            li.productVariant = variant
            li.save(update_fields=["productVariant"])


class Migration(migrations.Migration):

    dependencies = [
        ("invoicing", "0011_invoicelineitem_sourcing_cost"),
        ("packing", "0015_alter_packingcarton_remarks"),
        ("sourcing", "0021_merge_packing_into_intake"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoicelineitem",
            name="productVariant",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=deletion.SET_NULL,
                related_name="invoiceLineItems",
                to="sourcing.productvariant",
            ),
        ),
        migrations.RunPython(repoint_line_items, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="invoicelineitem",
            name="packingCarton",
        ),
    ]

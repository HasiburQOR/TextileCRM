# Sourcing-Intake-as-Packing-List merge, part 4 of 4: deletes the
# PackingList/PackingCarton tables. Every field they carried now lives on
# Product/ProductVariant (apps.sourcing.migrations.0021 added the columns
# and copied the data), the WarehouseCost FK was dropped in
# apps.warehouse.migrations.0003 and the InvoiceLineItem FK was swapped in
# apps.invoicing.migrations.0013 â€” so nothing references these tables by
# the time this runs. PackingRule survives: it is a reusable ratio/
# dimensions template, not packing-list data.
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("invoicing", "0012_lineitem_productvariant"),
        ("packing", "0015_alter_packingcarton_remarks"),
        ("sourcing", "0021_merge_packing_into_intake"),
        ("warehouse", "0003_remove_warehousecost_packinglist"),
    ]

    operations = [
        migrations.DeleteModel(
            name="PackingCarton",
        ),
        migrations.DeleteModel(
            name="PackingList",
        ),
    ]


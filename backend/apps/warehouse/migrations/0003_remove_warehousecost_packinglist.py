# Sourcing-Intake-as-Packing-List merge, part 2 of 4: drops the optional
# WarehouseCost.packingList FK. The column is simply removed — historical
# cost rows keep everything else; there is just no separate packing-list
# entity to point at anymore (costs are recorded against the Sister
# Profile).
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("packing", "0015_alter_packingcarton_remarks"),
        ("warehouse", "0002_rework_warehouse_cost_scoping"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="warehousecost",
            name="packingList",
        ),
    ]

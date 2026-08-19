# Step 3 of 3: drop the old field now that 0008 has migrated every row's
# data out of it.
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("packing", "0008_split_carton_color_breakdown"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="packingcarton",
            name="colorBreakdown",
        ),
    ]

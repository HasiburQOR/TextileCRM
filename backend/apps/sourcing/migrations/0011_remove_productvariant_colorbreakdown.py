# Step 3 of 3: drop the old field now that 0010 has migrated every row's
# data out of it.
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("sourcing", "0010_split_variant_color_breakdown"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="productvariant",
            name="colorBreakdown",
        ),
    ]

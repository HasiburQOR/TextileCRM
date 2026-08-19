# Step 1 of 3 for the per-color-row redesign (user feedback: bundling
# several colors into one row with one shared size breakdown made it
# impossible to tell which color owned which sizes). Adds the new fields
# first, keeping colorBreakdown around so the data migration in
# 0010_split_variant_color_breakdown can read it before it's removed in
# 0011_remove_productvariant_colorbreakdown.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sourcing", "0008_seed_field_library"),
    ]

    operations = [
        migrations.AddField(
            model_name="productvariant",
            name="colorName",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="productvariant",
            name="customFieldValues",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

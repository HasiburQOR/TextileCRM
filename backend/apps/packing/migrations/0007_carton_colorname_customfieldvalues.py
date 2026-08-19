# Step 1 of 3 — mirrors apps.sourcing.migrations.0009 for PackingCarton.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("packing", "0006_packingcarton_pono"),
    ]

    operations = [
        migrations.AddField(
            model_name="packingcarton",
            name="colorName",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="packingcarton",
            name="customFieldValues",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

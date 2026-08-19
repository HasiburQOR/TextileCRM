# Step 3 of 3: tighten to the real field definition (NOT NULL, callable
# default for future rows) now that every existing row has a real value.
import apps.packing.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("packing", "0011_backfill_packing_list_reference_codes"),
    ]

    operations = [
        migrations.AlterField(
            model_name="packinglist",
            name="referenceCode",
            field=models.CharField(default=apps.packing.models.generate_packing_list_reference_code, max_length=32, unique=True),
        ),
    ]

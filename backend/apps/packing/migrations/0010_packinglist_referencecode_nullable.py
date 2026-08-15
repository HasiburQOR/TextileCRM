# Step 1 of 3 for PackingList's own PKG-#### reference code (mirrors
# apps.buyers.migrations.0003_referencecode_nullable): add the column
# nullable first (Postgres allows multiple NULLs under a unique constraint)
# so existing rows don't collide on one Python-computed default value —
# 0011_backfill_packing_list_reference_codes assigns each pre-existing row
# a real, distinct, sequential value before this is tightened to NOT NULL
# in 0012.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("packing", "0009_remove_packingcarton_colorbreakdown"),
    ]

    operations = [
        migrations.AddField(
            model_name="packinglist",
            name="referenceCode",
            field=models.CharField(max_length=32, null=True, unique=True),
        ),
    ]

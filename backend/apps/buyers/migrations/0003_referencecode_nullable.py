# Step 1 of 3 for Reference_Numbers_Identifier_System.md: add the column as
# nullable first (Postgres allows multiple NULLs under a unique constraint)
# so existing rows don't collide on a single Python-computed default value —
# apps.buyers.migrations.0004_backfill_reference_codes assigns a real,
# distinct, sequential value to each pre-existing row before this field is
# tightened to NOT NULL in 0005.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("buyers", "0002_alter_sisterprofile_agreementtype"),
    ]

    operations = [
        migrations.AddField(
            model_name="buyerprofile",
            name="referenceCode",
            field=models.CharField(max_length=32, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="sisterprofile",
            name="referenceCode",
            field=models.CharField(max_length=32, null=True, unique=True),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("packing", "0012_alter_packinglist_referencecode"),
    ]

    operations = [
        migrations.AddField(
            model_name="packingcarton",
            name="unitPrice",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name="packingcarton",
            name="totalAmount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
    ]

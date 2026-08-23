from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("packing", "0013_packingcarton_unit_price"),
    ]

    operations = [
        migrations.AddField(
            model_name="packingcarton",
            name="ctnSl",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="packingcarton",
            name="description",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="packingcarton",
            name="material",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="packingcarton",
            name="remarks",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sourcing", "0017_variant_unit_price"),
    ]

    operations = [
        migrations.AddField(
            model_name="productvariant",
            name="variantStyleNo",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="productvariant",
            name="ctnSl",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="productvariant",
            name="description",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="productvariant",
            name="remarks",
            field=models.TextField(blank=True, default=""),
        ),
    ]

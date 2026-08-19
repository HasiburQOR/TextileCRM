from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sourcing", "0015_alter_product_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="material",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]

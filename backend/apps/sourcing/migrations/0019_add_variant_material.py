from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sourcing", "0018_add_variant_row_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="productvariant",
            name="material",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]

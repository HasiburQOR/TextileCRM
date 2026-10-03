from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("sourcing", "0019_add_variant_material"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="productvariant",
            name="ctnSl",
        ),
    ]

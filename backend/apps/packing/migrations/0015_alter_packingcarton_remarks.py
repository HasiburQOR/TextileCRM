from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("packing", "0014_add_carton_intake_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="packingcarton",
            name="remarks",
            field=models.TextField(blank=True, default=""),
        ),
    ]

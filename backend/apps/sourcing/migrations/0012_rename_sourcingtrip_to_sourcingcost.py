# Rename SourcingTrip → SourcingCost (table + model-level metadata)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sourcing", "0011_remove_productvariant_colorbreakdown"),
    ]

    operations = [
        migrations.RenameModel(
            old_name="SourcingTrip",
            new_name="SourcingCost",
        ),
        migrations.AlterModelOptions(
            name="sourcingcost",
            options={
                "ordering": ["-createdAt"],
                "verbose_name": "Sourcing Cost",
                "verbose_name_plural": "Sourcing Costs",
            },
        ),
        migrations.AlterField(
            model_name="sourcingcost",
            name="product",
            field=models.ForeignKey(
                on_delete=models.deletion.CASCADE,
                related_name="sourcingCosts",
                to="sourcing.product",
            ),
        ),
    ]

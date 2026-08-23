from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("invoicing", "0010_alter_invoicebuyerdetails_customfields"),
        ("sourcing", "0017_variant_unit_price"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoicelineitem",
            name="sourcingCost",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="invoiceLineItems",
                to="sourcing.sourcingcost",
            ),
        ),
    ]

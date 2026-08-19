from django.db import migrations, models


class Migration(migrations.Migration):
    """customFields is documented (and always populated) as a LIST of
    {"label", "value"} dicts, but the field's default was `dict` (`{}`) —
    an invoice submitted with no custom buyer fields persisted `{}`, which
    then crashed the frontend's `.map()` over it. Fixes the default; see
    also the `or []` fix in apps.invoicing.services.generate_invoice."""

    dependencies = [
        ("invoicing", "0009_remove_invoice_exchangerate_ratequote"),
    ]

    operations = [
        migrations.AlterField(
            model_name="invoicebuyerdetails",
            name="customFields",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

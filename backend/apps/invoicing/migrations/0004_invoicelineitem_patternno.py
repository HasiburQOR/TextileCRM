from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("invoicing", "0003_invoice_ratequote_invoice_sourcecurrency_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoicelineitem",
            name="patternNo",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
    ]

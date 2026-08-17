from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("invoicing", "0005_invoicelineitem_warehousecost"),
    ]

    operations = [
        migrations.CreateModel(
            name="InvoiceBuyerDetails",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("createdAt", models.DateTimeField(auto_now_add=True)),
                ("updatedAt", models.DateTimeField(auto_now=True)),
                ("companyName", models.CharField(blank=True, default="", max_length=255)),
                ("idNumber", models.CharField(blank=True, default="", max_length=128)),
                ("address", models.TextField(blank=True, default="")),
                ("cityCountry", models.CharField(blank=True, default="", max_length=255)),
                ("contactPerson", models.CharField(blank=True, default="", max_length=255)),
                ("phone", models.CharField(blank=True, default="", max_length=64)),
                ("customFields", models.JSONField(blank=True, default=dict)),
                (
                    "invoice",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="buyerDetails",
                        to="invoicing.invoice",
                    ),
                ),
            ],
            options={
                "verbose_name": "Invoice buyer details",
                "verbose_name_plural": "Invoice buyer details",
            },
        ),
    ]

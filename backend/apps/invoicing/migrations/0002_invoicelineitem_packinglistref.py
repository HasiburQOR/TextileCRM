from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("invoicing", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoicelineitem",
            name="packingListRef",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
    ]

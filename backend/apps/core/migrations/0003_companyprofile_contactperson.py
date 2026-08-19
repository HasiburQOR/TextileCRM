from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0002_companyprofile"),
    ]

    operations = [
        migrations.AddField(
            model_name="companyprofile",
            name="contactPerson",
            field=models.CharField(blank=True, default="", help_text="Named contact printed on the invoice header next to TEL.", max_length=128),
        ),
    ]

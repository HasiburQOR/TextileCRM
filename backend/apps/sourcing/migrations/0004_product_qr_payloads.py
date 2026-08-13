from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sourcing', '0003_productvariant_colorbreakdown'),
    ]

    operations = [
        migrations.AddField(model_name='product', name='productQrPayload', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='product', name='cartonQrPayload', field=models.JSONField(blank=True, default=dict)),
    ]

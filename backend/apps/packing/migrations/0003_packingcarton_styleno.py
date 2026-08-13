from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('packing', '0002_packingcarton_colorbreakdown'),
    ]

    operations = [
        migrations.AddField(model_name='packingcarton', name='styleNo', field=models.CharField(blank=True, default='', max_length=64)),
    ]

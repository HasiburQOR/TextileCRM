from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('packing', '0001_initial'),
    ]

    operations = [
        migrations.RemoveField(model_name='packingcarton', name='color'),
        migrations.AddField(model_name='packingcarton', name='colorBreakdown', field=models.JSONField(default=dict)),
    ]

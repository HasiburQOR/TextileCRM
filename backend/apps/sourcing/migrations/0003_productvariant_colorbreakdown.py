from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sourcing', '0002_productvariant_packing_fields'),
    ]

    operations = [
        migrations.RemoveField(model_name='productvariant', name='color'),
        migrations.AddField(model_name='productvariant', name='colorBreakdown', field=models.JSONField(default=dict)),
    ]

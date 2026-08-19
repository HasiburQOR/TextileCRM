from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sourcing', '0001_initial'),
    ]

    operations = [
        migrations.RemoveField(model_name='productvariant', name='itemNbr'),
        migrations.RemoveField(model_name='productvariant', name='size'),
        migrations.RemoveField(model_name='productvariant', name='qtyOrdered'),
        migrations.AddField(model_name='productvariant', name='orderQty', field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name='productvariant', name='sizeBreakdown', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='productvariant', name='pcsPerCarton', field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name='productvariant', name='innerBundle', field=models.PositiveIntegerField(default=1)),
        migrations.AddField(model_name='productvariant', name='cartonNoFrom', field=models.PositiveIntegerField(blank=True, null=True)),
        migrations.AddField(model_name='productvariant', name='cartonNoTo', field=models.PositiveIntegerField(blank=True, null=True)),
        migrations.AddField(model_name='productvariant', name='noOfCartons', field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name='productvariant', name='totalPcs', field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name='productvariant', name='grossWeight', field=models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
        migrations.AddField(model_name='productvariant', name='netWeight', field=models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
        migrations.AddField(model_name='productvariant', name='totalGrossWeight', field=models.DecimalField(decimal_places=2, default=0, max_digits=10)),
        migrations.AddField(model_name='productvariant', name='totalNetWeight', field=models.DecimalField(decimal_places=2, default=0, max_digits=10)),
        migrations.AddField(model_name='productvariant', name='ctnLength', field=models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
        migrations.AddField(model_name='productvariant', name='ctnWidth', field=models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
        migrations.AddField(model_name='productvariant', name='ctnHeight', field=models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
        migrations.AddField(model_name='productvariant', name='cbm', field=models.DecimalField(decimal_places=4, default=0, max_digits=10)),
        migrations.AddField(model_name='productvariant', name='totalCbm', field=models.DecimalField(decimal_places=4, default=0, max_digits=10)),
    ]

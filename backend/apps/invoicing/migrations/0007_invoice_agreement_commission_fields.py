# Generated for the agreement redesign: schema additions only. The removals
# (Invoice.exchangeRate FK / rateQuote) deliberately live in 0009 so the
# 0008 data migration can still read them while backfilling the new fields.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoicing', '0006_invoicebuyerdetails'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoice',
            name='agreementTypeAtCreation',
            field=models.CharField(blank=True, default='', max_length=1),
        ),
        migrations.AddField(
            model_name='invoice',
            name='commissionTotalBuyer',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AddField(
            model_name='invoice',
            name='commissionTotalSupplier',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AddField(
            model_name='invoice',
            name='costTotalBuyer',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AddField(
            model_name='invoice',
            name='costTotalSupplier',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AlterField(
            model_name='invoice',
            name='commissionType',
            field=models.CharField(choices=[('none', 'None'), ('percentage', 'Percentage'), ('per_unit', 'Per Unit'), ('flat', 'Flat')], default='none', max_length=16),
        ),
    ]

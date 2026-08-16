import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Decouples WarehouseCost from QCReport: it's recorded directly against
    a Sister Profile (optionally scoped to one of its Packing Lists) rather
    than gated one-to-one behind a QC report — the QC step it used to chain
    off of isn't part of the live workflow, and warehouse costs shouldn't
    wait on a per-product pipeline that may never run.

    No data migration: nothing has ever been recorded through the old
    QCReport-gated flow (the QC nav item — and with it, any way to create a
    QC report — has been hidden since before this model existed in any
    real deployment), so this replaces the table outright rather than
    carrying rows forward field-by-field."""

    dependencies = [
        ('warehouse', '0001_initial'),
        ('buyers', '0005_alter_buyerprofile_referencecode_and_more'),
        ('packing', '0012_alter_packinglist_referencecode'),
    ]

    operations = [
        migrations.DeleteModel(name='WarehouseCost'),
        migrations.CreateModel(
            name='WarehouseCost',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('loaderCost', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('extraWorkerCost', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('labelsCost', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('htakeCost', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('stickersCost', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('cartonsCost', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('polyBagsCost', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('gamtapeCost', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('customCosts', models.JSONField(blank=True, default=list)),
                ('extraCost', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('extraCostRemarks', models.CharField(blank=True, default='', max_length=255)),
                ('totalCost', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('createdAt', models.DateTimeField(auto_now_add=True)),
                ('createdBy', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='warehouseCosts', to=settings.AUTH_USER_MODEL)),
                ('sisterProfile', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='warehouseCosts', to='buyers.sisterprofile')),
                ('packingList', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='warehouseCosts', to='packing.packinglist')),
            ],
            options={
                'ordering': ['-createdAt'],
            },
        ),
    ]

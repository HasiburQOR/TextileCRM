from django.db import migrations, models


class Migration(migrations.Migration):
    """Unified Sourcing Pipeline step 3 — tracks whether the optional
    packing-list document was downloaded (packingListExportedAt) or the step
    was explicitly skipped (packingListSkipped), per product."""

    dependencies = [
        ("sourcing", "0023_move_legacy_approval_statuses_forward"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="packingListExportedAt",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="product",
            name="packingListSkipped",
            field=models.BooleanField(default=False),
        ),
    ]

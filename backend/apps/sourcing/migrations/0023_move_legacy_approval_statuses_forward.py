from django.db import migrations

LEGACY_STATUSES = ("sourcing_trip_open", "pending_admin_approval", "rejected")


def move_legacy_approval_statuses_forward(apps, schema_editor):
    """Admin Approval removed (single-workflow decision): any product parked
    in a legacy approval-side status joins the workflow directly at Approved
    for QC, so a QC report can be recorded on it and it is never a dead end.
    The old decision fields are cleared; the history stays in the audit log."""
    Product = apps.get_model("sourcing", "Product")
    Product.objects.filter(status__in=LEGACY_STATUSES).update(
        status="approved_for_qc",
        rejectionReason="",
        reviewedBy=None,
        reviewedAt=None,
    )


def unmove(apps, schema_editor):
    # One-way forward fix: the legacy statuses cannot be reconstructed from
    # the updated rows, so this migration is not reversible.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("sourcing", "0022_alter_product_status"),
    ]

    operations = [
        migrations.RunPython(move_legacy_approval_statuses_forward, unmove),
    ]

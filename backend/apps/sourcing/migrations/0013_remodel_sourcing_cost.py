import uuid

from django.db import migrations, models


def migrate_forward(apps, schema_editor):
    """Populate sisterProfile from product.sisterProfile, and create
    SourcingCostItem rows from existing SourcingLocationEntry rows."""
    SourcingCost = apps.get_model("sourcing", "SourcingCost")
    SourcingCostItem = apps.get_model("sourcing", "SourcingCostItem")
    SourcingLocationEntry = apps.get_model("sourcing", "SourcingLocationEntry")

    for cost in SourcingCost.objects.all():
        if cost.product_id and cost.product.sisterProfile_id:
            cost.sisterProfile_id = cost.product.sisterProfile_id
            cost.save(update_fields=["sisterProfile_id"])

        # Migrate location entries to cost items
        for loc in SourcingLocationEntry.objects.filter(sourcingTrip=cost):
            SourcingCostItem.objects.get_or_create(
                sourcingCost=cost,
                product=cost.product,
                defaults={
                    "locationName": loc.locationName,
                    "quantity": loc.quantity,
                    "customCostFields": [{"name": "Advance", "amount": str(loc.advanceAmount)}] if loc.advanceAmount else [],
                    "date": loc.date,
                },
            )


def migrate_reverse(apps, schema_editor):
    """Reverse: clear migrated data."""
    SourcingCostItem = apps.get_model("sourcing", "SourcingCostItem")
    SourcingCostItem.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("sourcing", "0012_rename_sourcingtrip_to_sourcingcost"),
    ]

    operations = [
        # 1. Add sisterProfile FK (nullable first for data migration)
        migrations.AddField(
            model_name="sourcingcost",
            name="sisterProfile",
            field=models.ForeignKey(
                null=True, blank=True, on_delete=models.CASCADE,
                related_name="sourcingCosts", to="buyers.sisterprofile",
            ),
        ),
        # 2. Create SourcingCostItem model
        migrations.CreateModel(
            name="SourcingCostItem",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("locationName", models.CharField(max_length=255)),
                ("quantity", models.PositiveIntegerField(default=0)),
                ("customCostFields", models.JSONField(default=list, blank=True)),
                ("date", models.DateTimeField()),
                ("createdAt", models.DateTimeField(auto_now_add=True)),
                ("updatedAt", models.DateTimeField(auto_now=True)),
                ("sourcingCost", models.ForeignKey(
                    on_delete=models.CASCADE, related_name="items", to="sourcing.sourcingcost"
                )),
                ("product", models.ForeignKey(
                    on_delete=models.CASCADE, related_name="sourcingCostItems", to="sourcing.product"
                )),
            ],
            options={
                "ordering": ["date"],
            },
        ),
        # 3. Data migration: populate sisterProfile, migrate locations to items
        migrations.RunPython(migrate_forward, migrate_reverse),
        # 4. Make sisterProfile non-nullable
        migrations.AlterField(
            model_name="sourcingcost",
            name="sisterProfile",
            field=models.ForeignKey(
                on_delete=models.CASCADE, related_name="sourcingCosts", to="buyers.sisterprofile",
            ),
        ),
        # 5. Remove product FK (make nullable first, then remove)
        migrations.AlterField(
            model_name="sourcingcost",
            name="product",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=models.CASCADE,
                related_name="legacySourcingCosts", to="sourcing.product",
            ),
        ),
        migrations.RemoveField(
            model_name="sourcingcost",
            name="product",
        ),
    ]
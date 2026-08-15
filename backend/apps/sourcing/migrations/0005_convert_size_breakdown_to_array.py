# Custom_Size_Breakdown_Feature.md BR: "No migration/backfill logic should
# assume old data was in the fixed S/M/L/XL/XXL shape if any real data
# already exists under the old model — write an explicit migration script
# that converts old fixed-key records into the new array format
# ({"S": 1, "M": 3} -> [{"size_label": "S", "quantity": 1}, ...]) rather
# than assuming a clean slate." No schema change needed (JSONField stays
# JSONField) — this is a pure data migration.
from django.db import migrations


def dict_to_array(value):
    if isinstance(value, dict):
        return [{"size_label": k, "quantity": v} for k, v in value.items()]
    return value if isinstance(value, list) else []


def array_to_dict(value):
    if isinstance(value, list):
        return {e.get("size_label", ""): e.get("quantity", 0) for e in value if e.get("size_label")}
    return value if isinstance(value, dict) else {}


def convert_forward(apps, schema_editor):
    ProductVariant = apps.get_model("sourcing", "ProductVariant")
    for variant in ProductVariant.objects.all():
        converted = dict_to_array(variant.sizeBreakdown)
        if converted != variant.sizeBreakdown:
            variant.sizeBreakdown = converted
            variant.save(update_fields=["sizeBreakdown"])


def convert_backward(apps, schema_editor):
    ProductVariant = apps.get_model("sourcing", "ProductVariant")
    for variant in ProductVariant.objects.all():
        variant.sizeBreakdown = array_to_dict(variant.sizeBreakdown)
        variant.save(update_fields=["sizeBreakdown"])


class Migration(migrations.Migration):

    dependencies = [
        ("sourcing", "0004_product_qr_payloads"),
    ]

    operations = [
        migrations.RunPython(convert_forward, convert_backward),
    ]

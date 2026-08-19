# Same conversion as apps.sourcing.migrations.0005_convert_size_breakdown_to_array,
# for PackingCarton's copy of the same field shape. See that migration's
# docstring for the rationale (Custom_Size_Breakdown_Feature.md BR).
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
    PackingCarton = apps.get_model("packing", "PackingCarton")
    for carton in PackingCarton.objects.all():
        converted = dict_to_array(carton.sizeBreakdown)
        if converted != carton.sizeBreakdown:
            carton.sizeBreakdown = converted
            carton.save(update_fields=["sizeBreakdown"])


def convert_backward(apps, schema_editor):
    PackingCarton = apps.get_model("packing", "PackingCarton")
    for carton in PackingCarton.objects.all():
        carton.sizeBreakdown = array_to_dict(carton.sizeBreakdown)
        carton.save(update_fields=["sizeBreakdown"])


class Migration(migrations.Migration):

    dependencies = [
        ("packing", "0003_packingcarton_styleno"),
    ]

    operations = [
        migrations.RunPython(convert_forward, convert_backward),
    ]

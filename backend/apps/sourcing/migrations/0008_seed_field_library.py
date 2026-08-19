# Product_Templates_Custom_Fields_Module.md's suggested starter Field
# Groups + a representative Field Library entry per group, so the Template
# Manager isn't an empty screen on first use. Suggestion #1: "Start with
# 3-4 templates, not a huge library" — this seeds only what the doc itself
# names as examples, not an exhaustive catalog; Admin grows it from there.
from django.db import migrations

GROUPS = [
    ("Carton Measurements", "CBM is computed from Length/Width/Height — meaningless without all of them."),
    ("Inner Packing", "PC/CTN calculation depends on knowing the inner bundle structure."),
    ("Weight", "Partial weight data breaks the rollup totals."),
    ("Bottom-Wear Sizing", "Almost always sourced together for pants/trousers."),
    ("Footwear Sizing", "Footwear-specific, rarely needed alongside apparel fields."),
]

# (field_key, label, field_type, group_name)
FIELDS = [
    ("sleeve_length", "Sleeve Length", "decimal", None),
    ("neck_style", "Neck Style", "text", None),
    ("fabric_gsm", "Fabric GSM", "number", None),
    ("waist_size", "Waist Size", "decimal", "Bottom-Wear Sizing"),
    ("inseam_length", "Inseam Length", "decimal", "Bottom-Wear Sizing"),
    ("shoe_size_system", "Shoe Size System", "select", "Footwear Sizing"),
    ("sole_material", "Sole Material", "text", "Footwear Sizing"),
]


def seed(apps, schema_editor):
    FieldGroup = apps.get_model("sourcing", "FieldGroup")
    TemplateField = apps.get_model("sourcing", "TemplateField")

    group_by_name = {}
    for name, description in GROUPS:
        group, _ = FieldGroup.objects.get_or_create(name=name, defaults={"description": description})
        group_by_name[name] = group

    for field_key, label, field_type, group_name in FIELDS:
        select_options = ["EU", "UK", "US"] if field_key == "shoe_size_system" else []
        TemplateField.objects.get_or_create(
            fieldKey=field_key,
            defaults={
                "label": label,
                "fieldType": field_type,
                "selectOptions": select_options,
                "fieldGroup": group_by_name.get(group_name) if group_name else None,
            },
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("sourcing", "0007_fieldgroup_product_customfields_and_more"),
    ]

    operations = [
        migrations.RunPython(seed, noop_reverse),
    ]

# Step 2 of 3: splits any existing multi-color colorBreakdown row into one
# row per color (the whole point of this redesign), duplicating every other
# field (size breakdown, weights, carton range, etc.) across the new rows.
# The first color stays on the original row so its id/any FK references
# survive; the rest become new sibling rows. Carton ranges are NOT
# renumbered automatically (the migration has no way to know the real
# physical carton layout) — a genuinely multi-color row was rare (a
# spec-level simplification, not the intended way to enter this data), so
# this is flagged here rather than silently guessed at.
from django.db import migrations


def split_colors(apps, schema_editor):
    ProductVariant = apps.get_model("sourcing", "ProductVariant")
    for variant in list(ProductVariant.objects.all()):
        colors = list((variant.colorBreakdown or {}).items())
        if not colors:
            continue
        first_color, first_qty = colors[0]
        variant.colorName = first_color
        variant.orderQty = int(first_qty)
        variant.save(update_fields=["colorName", "orderQty"])
        for color, qty in colors[1:]:
            ProductVariant.objects.create(
                product_id=variant.product_id,
                colorName=color,
                orderQty=int(qty),
                patternNo=variant.patternNo,
                sizeBreakdown=variant.sizeBreakdown,
                pcsPerCarton=variant.pcsPerCarton,
                innerBundle=variant.innerBundle,
                cartonNoFrom=variant.cartonNoFrom,
                cartonNoTo=variant.cartonNoTo,
                noOfCartons=variant.noOfCartons,
                totalPcs=variant.totalPcs,
                grossWeight=variant.grossWeight,
                netWeight=variant.netWeight,
                totalGrossWeight=variant.totalGrossWeight,
                totalNetWeight=variant.totalNetWeight,
                ctnLength=variant.ctnLength,
                ctnWidth=variant.ctnWidth,
                ctnHeight=variant.ctnHeight,
                cbm=variant.cbm,
                totalCbm=variant.totalCbm,
            )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("sourcing", "0009_variant_colorname_customfieldvalues"),
    ]

    operations = [
        migrations.RunPython(split_colors, noop_reverse),
    ]

# Step 2 of 3 — mirrors apps.sourcing.migrations.0010_split_variant_color_breakdown
# for PackingCarton. See that migration's docstring for the rationale and
# the carton-range caveat (ranges are duplicated, not renumbered).
from django.db import migrations


def split_colors(apps, schema_editor):
    PackingCarton = apps.get_model("packing", "PackingCarton")
    for carton in list(PackingCarton.objects.all()):
        colors = list((carton.colorBreakdown or {}).items())
        if not colors:
            continue
        first_color, first_qty = colors[0]
        carton.colorName = first_color
        carton.orderQty = int(first_qty)
        carton.save(update_fields=["colorName", "orderQty"])
        for color, qty in colors[1:]:
            PackingCarton.objects.create(
                packingList_id=carton.packingList_id,
                product_id=carton.product_id,
                styleNo=carton.styleNo,
                poNo=carton.poNo,
                cartonNoFrom=carton.cartonNoFrom,
                cartonNoTo=carton.cartonNoTo,
                noOfCartons=carton.noOfCartons,
                colorName=color,
                patternNo=carton.patternNo,
                assortId=carton.assortId,
                sizeBreakdown=carton.sizeBreakdown,
                totalPcsPerCarton=carton.totalPcsPerCarton,
                innerBundle=carton.innerBundle,
                orderQty=int(qty),
                shipQty=carton.shipQty,
                shortExcessQty=carton.shortExcessQty,
                shortExcessPct=carton.shortExcessPct,
                grossWeight=carton.grossWeight,
                netWeight=carton.netWeight,
                totalGrossWeight=carton.totalGrossWeight,
                totalNetWeight=carton.totalNetWeight,
                ctnLength=carton.ctnLength,
                ctnWidth=carton.ctnWidth,
                ctnHeight=carton.ctnHeight,
                ctnCbm=carton.ctnCbm,
                totalCbm=carton.totalCbm,
            )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("packing", "0007_carton_colorname_customfieldvalues"),
    ]

    operations = [
        migrations.RunPython(split_colors, noop_reverse),
    ]

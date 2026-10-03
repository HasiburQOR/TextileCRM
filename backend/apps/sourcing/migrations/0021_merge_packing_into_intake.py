# Sourcing-Intake-as-Packing-List merge, part 1 of 4: absorbs every
# PackingList/PackingCarton field into Product/ProductVariant (adds the
# columns here), then copies existing packing data onto the matching intake
# rows so nothing is lost when the packing tables are deleted in
# apps.packing.migrations.0016.
#
# Merge rules (matching by product + colorName, the natural key both sides
# share):
#   * a carton with no matching variant becomes a NEW variant row;
#   * multiple cartons of one color merge into that color's variant:
#     min(cartonNoFrom), max(cartonNoTo), first non-blank of every text
#     field, first non-zero of every numeric field;
#   * carton dims were INCHES, intake dims are CENTIMETRES — converted at
#     this boundary, the only place the two conventions ever met;
#   * PackingList header fields (date, front/side marks) copy onto every
#     Product that appeared on that list, only where still blank.
from decimal import ROUND_HALF_UP, Decimal

from django.db import migrations, models


IN_TO_CM = Decimal("2.54")


def _q2(v):
    return Decimal(v).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _q4(v):
    return Decimal(v).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _sum_sizes(sb) -> int:
    return sum(int(e.get("quantity") or 0) for e in (sb or []))


def _recompute_variant(v) -> None:
    """Inline version of apps.sourcing.services.compute_variant_derived for
    the historical model (services can't be imported into migrations)."""
    v.pcsPerCarton = _sum_sizes(v.sizeBreakdown)
    if v.cartonNoTo is not None and v.cartonNoFrom is not None and v.cartonNoTo >= v.cartonNoFrom:
        v.noOfCartons = v.cartonNoTo - v.cartonNoFrom + 1

def merge_packing_into_intake(apps, schema_editor):
    Product = apps.get_model("sourcing", "Product")
    ProductVariant = apps.get_model("sourcing", "ProductVariant")
    PackingList = apps.get_model("packing", "PackingList")
    PackingCarton = apps.get_model("packing", "PackingCarton")

    # ── carton rows → variant rows ────────────────────────────────────────
    for carton in (
        PackingCarton.objects.select_related("product").order_by("cartonNoFrom")
    ):
        variant = ProductVariant.objects.filter(
            product_id=carton.product_id, colorName=carton.colorName
        ).first()
        if variant is None:
            variant = ProductVariant(product_id=carton.product_id, colorName=carton.colorName)

        for field in ("poNo", "assortId", "ctnSl", "patternNo", "description", "material", "remarks"):
            if not getattr(variant, field, ""):
                setattr(variant, field, getattr(carton, field, "") or "")
        if not variant.orderQty:
            variant.orderQty = carton.orderQty
        if not variant.sizeBreakdown:
            variant.sizeBreakdown = carton.sizeBreakdown
        if not variant.innerBundle:
            variant.innerBundle = carton.innerBundle
        if not variant.customFieldValues:
            variant.customFieldValues = carton.customFieldValues
        if variant.cartonNoFrom is None or (carton.cartonNoFrom or 0) < (variant.cartonNoFrom or 0):
            variant.cartonNoFrom = carton.cartonNoFrom
        if variant.cartonNoTo is None or (carton.cartonNoTo or 0) > (variant.cartonNoTo or 0):
            variant.cartonNoTo = carton.cartonNoTo
        if variant.grossWeight in (None, 0):
            variant.grossWeight = carton.grossWeight
        if variant.netWeight in (None, 0):
            variant.netWeight = carton.netWeight
        # Carton dims were inches; intake dims are centimetres.
        if variant.ctnLength in (None, 0):
            variant.ctnLength = _q2((carton.ctnLength or 0) * IN_TO_CM)
        if variant.ctnWidth in (None, 0):
            variant.ctnWidth = _q2((carton.ctnWidth or 0) * IN_TO_CM)
        if variant.ctnHeight in (None, 0):
            variant.ctnHeight = _q2((carton.ctnHeight or 0) * IN_TO_CM)
        if variant.unitPrice is None:
            variant.unitPrice = carton.unitPrice
        if not variant.poNo and carton.product.poNo:
            variant.poNo = carton.product.poNo

        _recompute_variant(variant)
        variant.save()


    # ── list headers → product headers ────────────────────────────────────
    seen_products = set()
    for pl in PackingList.objects.all().order_by("createdAt"):
        for carton in pl.cartons.select_related("product").all():
            product = carton.product
            if product.id in seen_products:
                continue
            seen_products.add(product.id)
            changed = False
            if product.packingDate is None and pl.date:
                product.packingDate = pl.date
                changed = True
            if not product.frontMark and pl.frontMark:
                product.frontMark = pl.frontMark
                changed = True
            if not product.sideMark and pl.sideMark:
                product.sideMark = pl.sideMark
                changed = True
            if not product.poNo and pl.poNo:
                product.poNo = pl.poNo
                changed = True
            if not product.brandName and pl.brandName:
                product.brandName = pl.brandName
                changed = True
            if changed:
                product.save(
                    update_fields=["packingDate", "frontMark", "sideMark", "poNo", "brandName"]
                )


class Migration(migrations.Migration):

    dependencies = [
        ("packing", "0015_alter_packingcarton_remarks"),
        ("sourcing", "0020_remove_productvariant_ctnsl"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="packingDate",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="product",
            name="frontMark",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="product",
            name="sideMark",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="productvariant",
            name="poNo",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="productvariant",
            name="assortId",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="productvariant",
            name="ctnSl",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="productvariant",
            name="shipQty",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="productvariant",
            name="shortExcessQty",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="productvariant",
            name="shortExcessPct",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=6),
        ),
        migrations.RunPython(merge_packing_into_intake, migrations.RunPython.noop),
    ]

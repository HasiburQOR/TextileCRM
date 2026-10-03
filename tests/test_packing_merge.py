"""
Sourcing-Intake-as-Packing-List merge: the packing-list semantics that used
to live on PackingCarton (ship qty, signed short/excess, per-row poNo,
inch/cm rule conversion) now live on ProductVariant / compute_variant_derived.

Spec: BR-16–22 / FR-13–24 and the user's merge rules — no field dropped or
renamed; shipQty = noOfCartons x pcsPerCarton; shortExcessQty signed
(positive = short of order, negative = excess); PackingRule defaults stay
in inches and convert to centimetres only at the draft-row boundary.
"""

from decimal import Decimal

import pytest

from apps.packing import exports as packing_exports
from apps.packing.services import generate_variant_rows_from_rule
from apps.sourcing.models import Product, ProductVariant
from apps.sourcing.services import compute_variant_derived
from tests.factories import PackingRuleFactory, ProductFactory, ProductVariantFactory

# 1+3+5+4+2 = 15 pcs per carton — the sample factory sheet's ratio.
SIZE_BREAKDOWN = [
    {"size_label": s, "quantity": q} for s, q in {"S": 1, "M": 3, "L": 5, "XL": 4, "XXL": 2}.items()
]


def _variant(**overrides) -> ProductVariant:
    """Unsaved variant wired to an unsaved Product — compute_variant_derived
    is pure, so the unit cases below never touch the DB."""
    kwargs = dict(
        product=Product(poNo="PO-1"),
        colorName="Navy",
        orderQty=100,
        sizeBreakdown=SIZE_BREAKDOWN,
        cartonNoFrom=1,
        cartonNoTo=6,
    )
    kwargs.update(overrides)
    return ProductVariant(**kwargs)


class TestShipQtyAndShortExcess:
    @pytest.mark.unit
    def test_ship_qty_is_cartons_times_pcs_per_carton(self):
        # 6 cartons x 15 pcs = 90 shipped.
        v = _variant()
        compute_variant_derived(v)
        assert v.pcsPerCarton == 15
        assert v.noOfCartons == 6
        assert v.shipQty == 90

    @pytest.mark.unit
    @pytest.mark.parametrize(
        "order_qty,expected_qty,expected_pct",
        [
            (100, 10, Decimal("10.00")),  # ordered 100, shipped 90 -> short 10 (10%)
            (80, -10, Decimal("-12.50")),  # ordered 80, shipped 90 -> excess 10
        ],
        ids=["short-is-positive", "excess-is-negative"],
    )
    def test_short_excess_is_signed(self, order_qty, expected_qty, expected_pct):
        v = _variant(orderQty=order_qty)
        compute_variant_derived(v)
        assert v.shortExcessQty == expected_qty
        assert v.shortExcessPct == expected_pct

    @pytest.mark.unit
    def test_zero_order_qty_short_excess_pct_is_zero(self):
        v = _variant(orderQty=0)
        compute_variant_derived(v)
        assert v.shipQty == 90
        assert v.shortExcessQty == -90
        assert v.shortExcessPct == 0


class TestPerRowPoNo:
    @pytest.mark.unit
    def test_po_no_defaults_from_product_when_blank(self):
        v = _variant()
        compute_variant_derived(v)
        assert v.poNo == "PO-1"

    @pytest.mark.unit
    def test_po_no_supplied_by_caller_is_never_overwritten(self):
        v = _variant(poNo="PO-SPLIT")
        compute_variant_derived(v)
        assert v.poNo == "PO-SPLIT"


class TestGenerateRowsFromRule:
    @pytest.mark.unit
    def test_carton_count_is_ceil_of_order_over_units_per_carton(self):
        # 100 pcs / 15 per carton -> 7 cartons, last one partial.
        rule = PackingRuleFactory.build()
        rows = generate_variant_rows_from_rule(
            product=Product(poNo="PO-9"), packing_rule=rule,
            colors=[{"colorName": "Red", "orderQty": 100}],
        )
        assert len(rows) == 1
        assert rows[0]["cartonNoFrom"] == 1
        assert rows[0]["cartonNoTo"] == 7

    @pytest.mark.unit
    def test_rule_inches_convert_to_variant_centimetres(self):
        rule = PackingRuleFactory.build()  # 24 x 18 x 12 inches
        rows = generate_variant_rows_from_rule(
            product=Product(poNo=""), packing_rule=rule,
            colors=[{"colorName": "Red", "orderQty": 15}],
        )
        assert rows[0]["ctnLength"] == Decimal("60.96")  # 24 x 2.54
        assert rows[0]["ctnWidth"] == Decimal("45.72")
        assert rows[0]["ctnHeight"] == Decimal("30.48")


class TestPackingListExportFromProduct:
    @pytest.mark.integration
    def test_renders_pdf_and_xlsx_from_the_intake_record(self, db):
        product = ProductFactory(frontMark="BRAND\nPO-1\nMADE IN BANGLADESH", sideMark="C/NO: 1-UP")
        ProductVariantFactory(
            product=product,
            colorName="Navy",
            orderQty=100,
            sizeBreakdown=SIZE_BREAKDOWN,
            cartonNoFrom=1,
            cartonNoTo=6,
            grossWeight=Decimal("6.9"),
            netWeight=Decimal("6.7"),
            ctnLength=Decimal("60.96"),
            ctnWidth=Decimal("45.72"),
            ctnHeight=Decimal("30.48"),
        )
        for variant in product.variants.all():
            compute_variant_derived(variant)
            variant.save()

        pdf = packing_exports.render_packing_list_pdf(product)
        xlsx = packing_exports.render_packing_list_xlsx(product)
        assert pdf[:4] == b"%PDF"
        assert xlsx[:2] == b"PK"  # xlsx is a zip container

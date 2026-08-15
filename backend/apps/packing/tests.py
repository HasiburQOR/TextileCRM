from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Roles, User
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile
from apps.packing import exports, services
from apps.packing.models import PackingCarton, PackingList, PackingRule
from apps.sourcing.models import Product

# Every row of the real factory packing list the product owner supplied,
# transcribed exactly, used below to prove the calculation engine matches
# the source document to the cent/cbm.
SAMPLE_ROWS = [
    # style, pattern, color, from, to, order_qty, gross, net, expected_ttl_gw, expected_ttl_nw, expected_cbm
    ("MRF25", "MR12528", "ECRU HERRINGBONE", 1, 4, 60, "6.90", "5.00", "27.60", "20.00", "0.1800"),
    ("MRF25", "MR12529", "BROWN HERRINGBONE", 5, 13, 135, "6.70", "5.00", "60.30", "45.00", "0.4000"),
    ("MRF25", "MR12526", "LT BLUE HERRINGBONE", 14, 21, 120, "6.70", "5.00", "53.60", "40.00", "0.3500"),
    ("MRF25", "MR12514", "ORANGE/BROWN PLAID", 22, 39, 270, "6.70", "5.00", "120.60", "90.00", "0.8000"),
    ("MRF25", "MR12515", "NAVY/TAN PLAID", 40, 46, 105, "6.70", "5.00", "46.90", "35.00", "0.3100"),
    ("MRF25", "MR12513", "GREEN/BLACK PLAID", 47, 51, 75, "6.70", "5.00", "33.50", "25.00", "0.2200"),
    ("MRF25", "MR12501", "CHARCOAL/BLUE", 52, 62, 165, "6.70", "5.00", "73.70", "55.00", "0.4900"),
    ("MRF25", "MR12503", "CHARCOAL/BLACK/TEAL", 63, 76, 210, "6.70", "5.00", "93.80", "70.00", "0.6200"),
    ("MRF25", "MR12504", "BLACK/BROWN/CREAM", 77, 90, 210, "6.70", "5.00", "93.80", "70.00", "0.6200"),
    ("MRF25", "MR12505", "CHOCOLATE/GREY/WHITE", 91, 95, 75, "6.70", "5.00", "33.50", "25.00", "0.2200"),
    ("MRF25", "MR12507", "BLUE/NAVY/WHITE", 96, 109, 210, "6.70", "5.00", "93.80", "70.00", "0.6200"),
    ("MRF25", "MR12518", "NAVY/RED/ORANGE/LAVENDER", 110, 126, 255, "6.70", "5.00", "113.90", "85.00", "0.7500"),
    ("MRF25", "MR12522", "BLUE/BLK/OCHRE/OLIVE", 127, 134, 120, "6.70", "5.00", "53.60", "40.00", "0.3500"),
    ("MRF26", "MR12523", "RED/BROWN/WHITE", 135, 140, 90, "6.70", "5.00", "40.20", "30.00", "0.2700"),
    ("MRF27", "MR125509", "CHOCOLATE/SIENNA/SAND", 141, 144, 60, "6.70", "5.00", "26.80", "20.00", "0.1800"),
    ("MRF28", "MR125510", "BLACK/GREY/WHITE", 145, 158, 210, "6.70", "5.00", "93.80", "70.00", "0.6200"),
]

# S:1, M:3, L:5, XL:4, XXL:2 -> 15 pcs/carton, constant for the whole sheet.
# PackingRule.sizeRatio stays dict-shaped (a reusable ratio template, out of
# scope for Custom_Size_Breakdown_Feature.md); SIZE_BREAKDOWN below is the
# same ratio in the new per-row array shape, for direct PackingCarton rows.
SIZE_RATIO = {"S": 1, "M": 3, "L": 5, "XL": 4, "XXL": 2}
SIZE_BREAKDOWN = [{"size_label": k, "quantity": v} for k, v in SIZE_RATIO.items()]


class PackingCalculationTests(APITestCase):
    """Recreates the real factory packing list row-for-row and asserts the
    computed columns (TTL G.W, TTL N.W, CBM, and the G.TOTAL row) match the
    source document exactly."""

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Some Buyer Co")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="002F25BV",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.employee = User.objects.create_user(username="emp", password="pass12345", role=Roles.EMPLOYEE)
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)

        self.products = {}
        for style in {row[0] for row in SAMPLE_ROWS}:
            self.products[style] = Product.objects.create(
                sisterProfile=self.sister, name=f"Style {style}", styleNumber=style, poNo="002F25BV",
                createdBy=self.rep,
            )

    def _carton_kwargs(self, row):
        style, pattern, color, ctn_from, ctn_to, order_qty, gross, net, *_ = row
        return dict(
            product=self.products[style],
            cartonNoFrom=ctn_from,
            cartonNoTo=ctn_to,
            colorName=color,
            patternNo=pattern,
            sizeBreakdown=SIZE_BREAKDOWN,
            orderQty=order_qty,
            grossWeight=Decimal(gross),
            netWeight=Decimal(net),
            ctnLength=Decimal("20"),
            ctnWidth=Decimal("18"),
            ctnHeight=Decimal("7.5"),
        )

    def test_per_carton_totals_match_source_document(self):
        for row in SAMPLE_ROWS:
            *_, expected_ttl_gw, expected_ttl_nw, expected_cbm = row
            carton = PackingCarton(**self._carton_kwargs(row))
            services.compute_carton_derived(carton)
            self.assertEqual(carton.totalGrossWeight, Decimal(expected_ttl_gw), msg=f"{row[2]} gross weight")
            self.assertEqual(carton.totalNetWeight, Decimal(expected_ttl_nw), msg=f"{row[2]} net weight")
            self.assertEqual(carton.totalCbm.quantize(Decimal("0.01")), Decimal(expected_cbm).quantize(Decimal("0.01")), msg=f"{row[2]} cbm")

    def test_grand_total_matches_source_document(self):
        packing_list = services.create_packing_list(
            sister_profile=self.sister,
            created_by=self.rep,
            cartons=[self._carton_kwargs(row) for row in SAMPLE_ROWS],
            poNo="002F25BV",
        )
        self.assertEqual(packing_list.totalCartonQty, 158)
        self.assertEqual(packing_list.totalOrderQty, 2370)
        self.assertEqual(packing_list.totalShipQty, 2370)
        self.assertEqual(packing_list.shortExcessQty, 0)
        self.assertEqual(packing_list.shortExcessPct, Decimal("0.00"))
        self.assertEqual(packing_list.totalGrossWeight, Decimal("1059.40"))
        self.assertEqual(packing_list.totalNetWeight, Decimal("790.00"))
        self.assertEqual(packing_list.totalCbm.quantize(Decimal("0.01")), Decimal("6.99"))

    def test_short_and_excess_are_signed(self):
        # Order 100, but only 6 cartons x 15/ctn = 90 shipped -> short by 10.
        short_carton = PackingCarton(**{**self._carton_kwargs(SAMPLE_ROWS[0]), "cartonNoFrom": 1, "cartonNoTo": 6, "orderQty": 100})
        services.compute_carton_derived(short_carton)
        self.assertEqual(short_carton.shipQty, 90)
        self.assertEqual(short_carton.shortExcessQty, 10)  # positive = short

        # Order 80, but 6 cartons x 15/ctn = 90 shipped -> excess of 10.
        excess_carton = PackingCarton(**{**self._carton_kwargs(SAMPLE_ROWS[0]), "cartonNoFrom": 1, "cartonNoTo": 6, "orderQty": 80})
        services.compute_carton_derived(excess_carton)
        self.assertEqual(excess_carton.shipQty, 90)
        self.assertEqual(excess_carton.shortExcessQty, -10)  # negative = excess

    def test_generate_cartons_from_rule_rounds_up_partial_carton(self):
        rule = PackingRule.objects.create(name="Standard 15pc", sizeRatio=SIZE_RATIO)
        cartons = services.generate_cartons_from_rule(
            product=self.products["MRF25"],
            packing_rule=rule,
            colors=[{"color": "Black", "patternNo": "MR1", "orderQty": 32}],  # 32 / 15 -> 3 cartons (last partial)
            start_carton_no=1,
        )
        self.assertEqual(len(cartons), 1)
        self.assertEqual(cartons[0]["cartonNoFrom"], 1)
        self.assertEqual(cartons[0]["cartonNoTo"], 3)

    def test_generate_cartons_continues_carton_numbers_across_colors(self):
        rule = PackingRule.objects.create(name="Standard 15pc", sizeRatio=SIZE_RATIO)
        cartons = services.generate_cartons_from_rule(
            product=self.products["MRF25"],
            packing_rule=rule,
            colors=[
                {"color": "Black", "orderQty": 60},  # 4 cartons: 1-4
                {"color": "Navy", "orderQty": 135},  # 9 cartons: 5-13
            ],
            start_carton_no=1,
        )
        self.assertEqual((cartons[0]["cartonNoFrom"], cartons[0]["cartonNoTo"]), (1, 4))
        self.assertEqual((cartons[1]["cartonNoFrom"], cartons[1]["cartonNoTo"]), (5, 13))


class PackingTenantIsolationTests(APITestCase):
    def setUp(self):
        self.buyer_a = BuyerProfile.objects.create(name="Buyer A")
        self.buyer_b = BuyerProfile.objects.create(name="Buyer B")
        self.sister_a = SisterProfile.objects.create(
            buyerProfile=self.buyer_a, poReference="PO-A",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.sister_b = SisterProfile.objects.create(
            buyerProfile=self.buyer_b, poReference="PO-B",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.buyer_a_user = User.objects.create_user(
            username="buyer_a", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer_a
        )
        product_a = Product.objects.create(sisterProfile=self.sister_a, name="P-A", createdBy=self.rep)
        product_b = Product.objects.create(sisterProfile=self.sister_b, name="P-B", createdBy=self.rep)
        self.list_a = services.create_packing_list(
            sister_profile=self.sister_a, created_by=self.rep,
            cartons=[dict(product=product_a, cartonNoFrom=1, cartonNoTo=1, colorName="Black", sizeBreakdown=SIZE_BREAKDOWN, orderQty=15, ctnLength=20, ctnWidth=18, ctnHeight=7.5)],
        )
        self.list_b = services.create_packing_list(
            sister_profile=self.sister_b, created_by=self.rep,
            cartons=[dict(product=product_b, cartonNoFrom=1, cartonNoTo=1, colorName="Navy", sizeBreakdown=SIZE_BREAKDOWN, orderQty=15, ctnLength=20, ctnWidth=18, ctnHeight=7.5)],
        )

    def test_buyer_cannot_see_another_buyers_packing_list(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("packing-list-detail", args=[self.list_b.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_buyer_list_scoped_to_own_buyer(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("packing-list-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {str(self.list_a.id)})

    def test_buyer_cannot_create_packing_list(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.post(reverse("packing-list-list"), {"sisterProfile": str(self.sister_a.id)}, format="json")
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED))


class StyleNoReferenceNotCopyTests(APITestCase):
    """Reference_Numbers_Identifier_System.md, "Reference, Don't Copy":
    Style No is generated once at Sourcing Intake and a Packing List row
    must never be able to independently drift from it — verified with the
    doc's own prescribed test: edit the Product after a Packing List
    already references it, confirm the carton's displayed value updates
    rather than going stale."""

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Buyer")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-1",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.product = Product.objects.create(sisterProfile=self.sister, name="Shirt", styleNumber="STY-ORIGINAL", createdBy=self.rep)

    def test_client_supplied_style_no_override_is_ignored(self):
        carton = PackingCarton(
            product=self.product, cartonNoFrom=1, cartonNoTo=1, colorName="Black",
            sizeBreakdown=SIZE_BREAKDOWN, orderQty=15, ctnLength=20, ctnWidth=18, ctnHeight=7.5,
            styleNo="SOMETHING-ELSE-ENTIRELY",  # a client trying to set its own value
        )
        services.compute_carton_derived(carton)
        self.assertEqual(carton.styleNo, "STY-ORIGINAL")

    def test_style_no_stays_in_sync_when_product_style_number_changes_later(self):
        packing_list = services.create_packing_list(
            sister_profile=self.sister, created_by=self.rep,
            cartons=[dict(
                product=self.product, cartonNoFrom=1, cartonNoTo=1, colorName="Black",
                sizeBreakdown=SIZE_BREAKDOWN, orderQty=15, ctnLength=20, ctnWidth=18, ctnHeight=7.5,
            )],
        )
        carton = packing_list.cartons.get()
        self.assertEqual(carton.styleNo, "STY-ORIGINAL")

        self.product.styleNumber = "STY-CORRECTED"
        self.product.save(update_fields=["styleNumber"])

        # Re-deriving (any subsequent save path) picks up the corrected value —
        # never silently stale, per the doc's explicit acceptance test.
        services.add_carton(
            packing_list, product=self.product, cartonNoFrom=2, cartonNoTo=2, colorName="Navy",
            sizeBreakdown=SIZE_BREAKDOWN, orderQty=15, ctnLength=20, ctnWidth=18, ctnHeight=7.5,
        )
        new_carton = packing_list.cartons.get(cartonNoFrom=2)
        self.assertEqual(new_carton.styleNo, "STY-CORRECTED")


class PoNoAndExportGroupingTests(APITestCase):
    """Packing_List_Module_Instructions.md §3.1 (per-row PO No, defaulting
    from the Style level) and §6 (export merged-cell grouping)."""

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Buyer")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-1",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.product_a = Product.objects.create(sisterProfile=self.sister, name="Shirt", poNo="002F25BV", createdBy=self.rep)
        self.product_b = Product.objects.create(sisterProfile=self.sister, name="Pants", poNo="003F25BV", createdBy=self.rep)

    def _kwargs(self, product, ctn_from, ctn_to, po_no=""):
        return dict(
            product=product, cartonNoFrom=ctn_from, cartonNoTo=ctn_to, colorName="Black",
            sizeBreakdown=SIZE_BREAKDOWN, orderQty=15, ctnLength=20, ctnWidth=18, ctnHeight=7.5, poNo=po_no,
        )

    def test_po_no_defaults_from_product_when_blank(self):
        carton = PackingCarton(**self._kwargs(self.product_a, 1, 1))
        services.compute_carton_derived(carton)
        self.assertEqual(carton.poNo, "002F25BV")

    def test_po_no_explicit_value_is_not_overwritten(self):
        carton = PackingCarton(**self._kwargs(self.product_a, 1, 1, po_no="SPLIT-SHIPMENT-PO"))
        services.compute_carton_derived(carton)
        self.assertEqual(carton.poNo, "SPLIT-SHIPMENT-PO")

    def test_xlsx_export_merges_style_product_pono_across_consecutive_same_product_rows(self):
        packing_list = services.create_packing_list(
            sister_profile=self.sister, created_by=self.rep, poNo="002F25BV",
            cartons=[
                self._kwargs(self.product_a, 1, 1),
                self._kwargs(self.product_a, 2, 2),  # same product, consecutive -> should merge
                self._kwargs(self.product_b, 3, 3),  # different product -> its own (unmerged) row
            ],
        )
        wb_bytes = exports.render_packing_list_xlsx(packing_list)
        self.assertGreater(len(wb_bytes), 0)

        import io as _io

        from openpyxl import load_workbook

        wb = load_workbook(_io.BytesIO(wb_bytes))
        ws = wb.active
        merged_ranges = [str(r) for r in ws.merged_cells.ranges]
        # Exactly one merge per style-level column (A=Style No, B=Product,
        # C=PO No) spanning the two product_a rows; the title bar's own
        # A1:H1 merge and product_b's single row (no merge needed) excluded.
        style_col_merges = [r for r in merged_ranges if r.startswith(("A", "B", "C")) and not r.startswith("A1:H1")]
        self.assertEqual(len(style_col_merges), 3)  # one per column (Style No, Product, PO No)
        for merge_range in style_col_merges:
            start, end = merge_range.split(":")
            self.assertNotEqual(start[1:], end[1:])  # spans more than one row

    def test_pdf_export_renders_without_error_for_multiple_groups(self):
        packing_list = services.create_packing_list(
            sister_profile=self.sister, created_by=self.rep, poNo="002F25BV",
            cartons=[
                self._kwargs(self.product_a, 1, 1),
                self._kwargs(self.product_a, 2, 2),
                self._kwargs(self.product_b, 3, 3),
            ],
        )
        pdf_bytes = exports.render_packing_list_pdf(packing_list)
        self.assertGreater(len(pdf_bytes), 0)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))

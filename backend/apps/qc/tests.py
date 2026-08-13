from decimal import Decimal

from django.core.exceptions import ValidationError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Roles, User
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile
from apps.expenses.models import Expense, SourceType
from apps.qc import services
from apps.qc.models import QCReport, TravelMode
from apps.sourcing.models import Product, ProductStatus


class QCReportServiceTests(APITestCase):
    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.qc_user = User.objects.create_user(username="qc", password="pass12345", role=Roles.QC)
        self.product = Product.objects.create(
            sisterProfile=self.sister, name="Kids T-Shirt", createdBy=self.rep, status=ProductStatus.APPROVED_FOR_QC
        )

    # ── Status gating ────────────────────────────────────────────────────

    def test_cannot_create_qc_report_unless_approved_for_qc(self):
        self.product.status = ProductStatus.SOURCING_TRIP_OPEN
        self.product.save()
        with self.assertRaises(ValidationError):
            services.create_qc_report(
                product=self.product, created_by=self.qc_user, lunch_cost_flag=False,
                lunch_cost=0, goods_carrying_cost=40, travel_mode=TravelMode.TRAVELLING_WITH_GOODS, extra_cost=0,
            )

    def test_cannot_create_second_qc_report_for_same_product(self):
        services.create_qc_report(
            product=self.product, created_by=self.qc_user, lunch_cost_flag=False,
            lunch_cost=0, goods_carrying_cost=40, travel_mode=TravelMode.TRAVELLING_WITH_GOODS, extra_cost=0,
        )
        # product.status is now IN_WAREHOUSE, so this correctly fails on the
        # status check too -- but even forced back to APPROVED_FOR_QC it must
        # still fail on the "already has a report" check.
        self.product.status = ProductStatus.APPROVED_FOR_QC
        self.product.save()
        with self.assertRaises(ValidationError):
            services.create_qc_report(
                product=self.product, created_by=self.qc_user, lunch_cost_flag=False,
                lunch_cost=0, goods_carrying_cost=10, travel_mode=TravelMode.TRAVELLING_WITH_GOODS, extra_cost=0,
            )

    def test_create_qc_report_advances_status_to_in_warehouse(self):
        services.create_qc_report(
            product=self.product, created_by=self.qc_user, lunch_cost_flag=False,
            lunch_cost=0, goods_carrying_cost=40, travel_mode=TravelMode.TRAVELLING_WITH_GOODS, extra_cost=0,
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, ProductStatus.IN_WAREHOUSE)

    # ── Cost formula (BR-24/25/26) ───────────────────────────────────────

    def test_total_cost_excludes_lunch_when_flag_false(self):
        report = services.create_qc_report(
            product=self.product, created_by=self.qc_user, lunch_cost_flag=False,
            lunch_cost=15, goods_carrying_cost=40, travel_mode=TravelMode.TRAVELLING_WITH_GOODS, extra_cost=0,
        )
        self.assertEqual(report.lunchCost, Decimal("0"))  # zeroed server-side, flag was False
        self.assertEqual(report.totalCost, Decimal("40"))

    def test_total_cost_excludes_extra_when_travelling_with_goods(self):
        report = services.create_qc_report(
            product=self.product, created_by=self.qc_user, lunch_cost_flag=True,
            lunch_cost=15, goods_carrying_cost=40, travel_mode=TravelMode.TRAVELLING_WITH_GOODS, extra_cost=25,
        )
        self.assertEqual(report.extraCost, Decimal("0"))  # zeroed server-side, wrong travel mode
        self.assertEqual(report.totalCost, Decimal("55"))  # 15 + 40

    def test_total_cost_includes_extra_when_travelling_individually(self):
        report = services.create_qc_report(
            product=self.product, created_by=self.qc_user, lunch_cost_flag=True,
            lunch_cost=15, goods_carrying_cost=40, travel_mode=TravelMode.TRAVELLING_INDIVIDUALLY, extra_cost=25,
        )
        self.assertEqual(report.totalCost, Decimal("80"))  # 15 + 40 + 25

    # ── Central Expense Table wiring (FR-29, DRF doc §5 item 4) ─────────

    def test_qc_report_writes_expense_rows_for_each_cost_line(self):
        services.create_qc_report(
            product=self.product, created_by=self.qc_user, lunch_cost_flag=True,
            lunch_cost=15, goods_carrying_cost=40, travel_mode=TravelMode.TRAVELLING_INDIVIDUALLY, extra_cost=25,
        )
        expenses = Expense.objects.filter(sisterProfile=self.sister, product=self.product)
        by_type = {e.sourceType: e.amount for e in expenses}
        self.assertEqual(by_type[SourceType.QC_LUNCH], Decimal("15"))
        self.assertEqual(by_type[SourceType.QC_CARRYING], Decimal("40"))
        self.assertEqual(by_type[SourceType.QC_TRAVEL_EXTRA], Decimal("25"))
        self.assertEqual(expenses.count(), 3)

    def test_qc_report_skips_expense_rows_for_zero_cost_lines(self):
        services.create_qc_report(
            product=self.product, created_by=self.qc_user, lunch_cost_flag=False,
            lunch_cost=0, goods_carrying_cost=40, travel_mode=TravelMode.TRAVELLING_WITH_GOODS, extra_cost=0,
        )
        expenses = Expense.objects.filter(product=self.product)
        self.assertEqual(expenses.count(), 1)  # only goods_carrying
        self.assertEqual(expenses.first().sourceType, SourceType.QC_CARRYING)

    def test_report_id_is_sequential_and_unique(self):
        r1 = services.create_qc_report(
            product=self.product, created_by=self.qc_user, lunch_cost_flag=False,
            lunch_cost=0, goods_carrying_cost=10, travel_mode=TravelMode.TRAVELLING_WITH_GOODS, extra_cost=0,
        )
        product2 = Product.objects.create(
            sisterProfile=self.sister, name="Socks", createdBy=self.rep, status=ProductStatus.APPROVED_FOR_QC
        )
        r2 = services.create_qc_report(
            product=product2, created_by=self.qc_user, lunch_cost_flag=False,
            lunch_cost=0, goods_carrying_cost=10, travel_mode=TravelMode.TRAVELLING_WITH_GOODS, extra_cost=0,
        )
        self.assertNotEqual(r1.reportId, r2.reportId)
        self.assertTrue(r1.reportId.startswith("QC-"))


class QCReportAPITenantTests(APITestCase):
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
        self.qc_user = User.objects.create_user(username="qc", password="pass12345", role=Roles.QC)
        self.buyer_a_user = User.objects.create_user(
            username="buyer_a", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer_a
        )
        product_a = Product.objects.create(
            sisterProfile=self.sister_a, name="P-A", createdBy=self.rep, status=ProductStatus.APPROVED_FOR_QC
        )
        product_b = Product.objects.create(
            sisterProfile=self.sister_b, name="P-B", createdBy=self.rep, status=ProductStatus.APPROVED_FOR_QC
        )
        self.report_a = services.create_qc_report(
            product=product_a, created_by=self.qc_user, lunch_cost_flag=False,
            lunch_cost=0, goods_carrying_cost=10, travel_mode=TravelMode.TRAVELLING_WITH_GOODS, extra_cost=0,
        )
        self.report_b = services.create_qc_report(
            product=product_b, created_by=self.qc_user, lunch_cost_flag=False,
            lunch_cost=0, goods_carrying_cost=10, travel_mode=TravelMode.TRAVELLING_WITH_GOODS, extra_cost=0,
        )

    def test_buyer_cannot_see_another_buyers_qc_report(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("qc-report-detail", args=[self.report_b.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_rep_cannot_create_qc_report(self):
        # QC report creation is QC-role-only, not Company Rep.
        product = Product.objects.create(
            sisterProfile=self.sister_a, name="Another", createdBy=self.rep, status=ProductStatus.APPROVED_FOR_QC
        )
        self.client.force_authenticate(user=self.rep)
        resp = self.client.post(reverse("qc-report-list"), {"product": str(product.id), "goodsCarryingCost": 10}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

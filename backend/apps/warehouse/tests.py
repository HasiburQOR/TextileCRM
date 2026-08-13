from decimal import Decimal

from django.core.exceptions import ValidationError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Roles, User
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile
from apps.expenses.models import Expense, SourceType
from apps.qc import services as qc_services
from apps.qc.models import TravelMode
from apps.sourcing.models import Product, ProductStatus
from apps.warehouse import services
from apps.warehouse.models import WarehouseCost


class WarehouseCostServiceTests(APITestCase):
    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.qc_user = User.objects.create_user(username="qc", password="pass12345", role=Roles.QC)
        self.wh_user = User.objects.create_user(username="wh", password="pass12345", role=Roles.WAREHOUSE)
        self.product = Product.objects.create(
            sisterProfile=self.sister, name="Denim Jacket", createdBy=self.rep, status=ProductStatus.APPROVED_FOR_QC
        )
        self.qc_report = qc_services.create_qc_report(
            product=self.product, created_by=self.qc_user, lunch_cost_flag=False,
            lunch_cost=0, goods_carrying_cost=40, travel_mode=TravelMode.TRAVELLING_WITH_GOODS, extra_cost=0,
        )
        # product.status is now IN_WAREHOUSE, correct precondition for warehouse costs.

    # ── Status gating ────────────────────────────────────────────────────

    def test_cannot_create_warehouse_cost_unless_in_warehouse(self):
        self.product.status = ProductStatus.APPROVED_FOR_QC
        self.product.save()
        with self.assertRaises(ValidationError):
            services.create_warehouse_cost(qc_report=self.qc_report, created_by=self.wh_user, loaderCost=50)

    def test_cannot_create_second_warehouse_cost_for_same_report(self):
        services.create_warehouse_cost(qc_report=self.qc_report, created_by=self.wh_user, loaderCost=50)
        self.product.status = ProductStatus.IN_WAREHOUSE
        self.product.save()
        with self.assertRaises(ValidationError):
            services.create_warehouse_cost(qc_report=self.qc_report, created_by=self.wh_user, loaderCost=10)

    def test_create_warehouse_cost_advances_status_to_ready_for_final_qc(self):
        services.create_warehouse_cost(qc_report=self.qc_report, created_by=self.wh_user, loaderCost=50)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, ProductStatus.READY_FOR_FINAL_QC)

    # ── Total cost formula (BR-27-31) ───────────────────────────────────

    def test_total_cost_sums_fixed_packaging_custom_and_extra(self):
        wc = services.create_warehouse_cost(
            qc_report=self.qc_report, created_by=self.wh_user,
            loaderCost=40, extraWorkerCost=15, labelsCost=8, cartonsCost=25,
            custom_costs=[{"fieldName": "Fumigation", "amount": 12, "remarks": "pest control"}],
            extra_cost=5, extra_cost_remarks="misc",
        )
        # 40 + 15 + 8 + 25 (fixed) + 12 (custom) + 5 (extra) = 105
        self.assertEqual(wc.totalCost, Decimal("105"))

    # ── Central Expense Table wiring (DRF doc §5 item 4) ─────────────────

    def test_warehouse_cost_writes_expense_row_per_checked_item_only(self):
        services.create_warehouse_cost(
            qc_report=self.qc_report, created_by=self.wh_user,
            loaderCost=40, extraWorkerCost=0, labelsCost=8, cartonsCost=25,  # htake/stickers/polybags/gamtape left at 0 ("unchecked")
        )
        # setUp already created a QC report with goods_carrying_cost=40 on this
        # same product, which itself wrote a qc_carrying Expense row -- scope
        # to warehouse-only source types so this test isolates the warehouse
        # cost's own contribution.
        expenses = Expense.objects.filter(
            product=self.product, sourceType__in=[SourceType.WAREHOUSE_LOADER, SourceType.WAREHOUSE_PACKAGING_ITEM]
        )
        by_type_and_field = {(e.sourceType, e.fieldName): e.amount for e in expenses}
        self.assertEqual(by_type_and_field[(SourceType.WAREHOUSE_LOADER, "")], Decimal("40"))
        self.assertEqual(by_type_and_field[(SourceType.WAREHOUSE_PACKAGING_ITEM, "labelsCost")], Decimal("8"))
        self.assertEqual(by_type_and_field[(SourceType.WAREHOUSE_PACKAGING_ITEM, "cartonsCost")], Decimal("25"))
        # extraWorkerCost was 0 ("unchecked") -> no row; only loader + 2 packaging items = 3 rows.
        self.assertEqual(expenses.count(), 3)

    def test_warehouse_cost_writes_expense_row_for_custom_and_extra_cost(self):
        services.create_warehouse_cost(
            qc_report=self.qc_report, created_by=self.wh_user, loaderCost=0,
            custom_costs=[{"fieldName": "Fumigation", "amount": 12}],
            extra_cost=7, extra_cost_remarks="rush fee",
        )
        expenses = Expense.objects.filter(product=self.product, sourceType__in=[SourceType.CUSTOM_FIELD, SourceType.EXTRA_COST])
        by_type = {e.sourceType: e.amount for e in expenses}
        self.assertEqual(by_type[SourceType.CUSTOM_FIELD], Decimal("12"))
        self.assertEqual(by_type[SourceType.EXTRA_COST], Decimal("7"))
        self.assertEqual(expenses.count(), 2)  # loaderCost was 0 -> no row


class WarehouseCostAPITenantTests(APITestCase):
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
        self.wh_user = User.objects.create_user(username="wh", password="pass12345", role=Roles.WAREHOUSE)
        self.buyer_a_user = User.objects.create_user(
            username="buyer_a", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer_a
        )

        def make_warehouse_cost(sister, name):
            product = Product.objects.create(
                sisterProfile=sister, name=name, createdBy=self.rep, status=ProductStatus.APPROVED_FOR_QC
            )
            report = qc_services.create_qc_report(
                product=product, created_by=self.qc_user, lunch_cost_flag=False,
                lunch_cost=0, goods_carrying_cost=10, travel_mode=TravelMode.TRAVELLING_WITH_GOODS, extra_cost=0,
            )
            return services.create_warehouse_cost(qc_report=report, created_by=self.wh_user, loaderCost=20)

        self.wc_a = make_warehouse_cost(self.sister_a, "P-A")
        self.wc_b = make_warehouse_cost(self.sister_b, "P-B")

    def test_buyer_cannot_see_another_buyers_warehouse_cost(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("warehouse-cost-detail", args=[self.wc_b.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_expenses_endpoint_scoped_per_buyer(self):
        # Sanity: each sister profile has exactly 2 expenses at this point
        # (1 qc_carrying from QC report creation + 1 warehouse_loader).
        self.assertEqual(Expense.objects.filter(sisterProfile=self.sister_a).count(), 2)
        self.assertEqual(Expense.objects.filter(sisterProfile=self.sister_b).count(), 2)

        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("expense-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Buyer-facing serializer omits sisterProfile (ExpenseSelfSerializer
        # is deliberately lighter) -- assert scoping via the count instead.
        self.assertEqual(resp.data["count"], 2)

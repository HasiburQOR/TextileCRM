from decimal import Decimal

from django.core.exceptions import ValidationError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Roles, User
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile
from apps.expenses.models import Expense, SourceType
from apps.packing.models import PackingList
from apps.warehouse import services
from apps.warehouse.models import WarehouseCost


class WarehouseCostServiceTests(APITestCase):
    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1,
        )
        self.other_sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-002",
            agreementType=AgreementType.TYPE_1,
        )
        self.wh_user = User.objects.create_user(username="wh", password="pass12345", role=Roles.WAREHOUSE)
        self.packing_list = PackingList.objects.create(sisterProfile=self.sister, poNo="PO-001", createdBy=self.wh_user)

    # ── No QC precondition, any number per Sister Profile ───────────────

    def test_create_warehouse_cost_against_sister_profile_only(self):
        wc = services.create_warehouse_cost(sister_profile=self.sister, created_by=self.wh_user, loaderCost=50)
        self.assertEqual(wc.sisterProfile, self.sister)
        self.assertIsNone(wc.packingList)

    def test_create_warehouse_cost_against_a_packing_list(self):
        wc = services.create_warehouse_cost(
            sister_profile=self.sister, created_by=self.wh_user, packing_list=self.packing_list, loaderCost=50,
        )
        self.assertEqual(wc.packingList, self.packing_list)

    def test_packing_list_must_belong_to_the_selected_sister_profile(self):
        other_list = PackingList.objects.create(sisterProfile=self.other_sister, poNo="PO-002", createdBy=self.wh_user)
        with self.assertRaises(ValidationError):
            services.create_warehouse_cost(
                sister_profile=self.sister, created_by=self.wh_user, packing_list=other_list, loaderCost=50,
            )

    def test_multiple_warehouse_costs_allowed_per_sister_profile(self):
        """Unlike the old one-per-QC-report rule — a shipment can rack up
        more than one round of warehouse costs (e.g. one per Packing List)."""
        services.create_warehouse_cost(sister_profile=self.sister, created_by=self.wh_user, loaderCost=50)
        second = services.create_warehouse_cost(sister_profile=self.sister, created_by=self.wh_user, loaderCost=30)
        self.assertEqual(WarehouseCost.objects.filter(sisterProfile=self.sister).count(), 2)
        self.assertEqual(second.loaderCost, Decimal("30"))

    # ── Total cost formula (BR-27-31) — unchanged ───────────────────────

    def test_total_cost_sums_fixed_packaging_custom_and_extra(self):
        wc = services.create_warehouse_cost(
            sister_profile=self.sister, created_by=self.wh_user,
            loaderCost=40, extraWorkerCost=15, labelsCost=8, cartonsCost=25,
            custom_costs=[{"fieldName": "Fumigation", "amount": 12, "remarks": "pest control"}],
            extra_cost=5, extra_cost_remarks="misc",
        )
        # 40 + 15 + 8 + 25 (fixed) + 12 (custom) + 5 (extra) = 105
        self.assertEqual(wc.totalCost, Decimal("105"))

    # ── Central Expense Table wiring (DRF doc §5 item 4) ─────────────────

    def test_warehouse_cost_writes_expense_row_per_checked_item_only(self):
        services.create_warehouse_cost(
            sister_profile=self.sister, created_by=self.wh_user,
            loaderCost=40, extraWorkerCost=0, labelsCost=8, cartonsCost=25,  # htake/stickers/polybags/gamtape left at 0 ("unchecked")
        )
        expenses = Expense.objects.filter(
            sisterProfile=self.sister, sourceType__in=[SourceType.WAREHOUSE_LOADER, SourceType.WAREHOUSE_PACKAGING_ITEM]
        )
        by_type_and_field = {(e.sourceType, e.fieldName): e.amount for e in expenses}
        self.assertEqual(by_type_and_field[(SourceType.WAREHOUSE_LOADER, "")], Decimal("40"))
        self.assertEqual(by_type_and_field[(SourceType.WAREHOUSE_PACKAGING_ITEM, "labelsCost")], Decimal("8"))
        self.assertEqual(by_type_and_field[(SourceType.WAREHOUSE_PACKAGING_ITEM, "cartonsCost")], Decimal("25"))
        # extraWorkerCost was 0 ("unchecked") -> no row; only loader + 2 packaging items = 3 rows.
        self.assertEqual(expenses.count(), 3)

    def test_warehouse_cost_writes_expense_row_for_custom_and_extra_cost(self):
        services.create_warehouse_cost(
            sister_profile=self.sister, created_by=self.wh_user, loaderCost=0,
            custom_costs=[{"fieldName": "Fumigation", "amount": 12}],
            extra_cost=7, extra_cost_remarks="rush fee",
        )
        expenses = Expense.objects.filter(sisterProfile=self.sister, sourceType__in=[SourceType.CUSTOM_FIELD, SourceType.EXTRA_COST])
        by_type = {e.sourceType: e.amount for e in expenses}
        self.assertEqual(by_type[SourceType.CUSTOM_FIELD], Decimal("12"))
        self.assertEqual(by_type[SourceType.EXTRA_COST], Decimal("7"))
        self.assertEqual(expenses.count(), 2)  # loaderCost was 0 -> no row

    def test_expense_rows_are_correlated_to_their_own_warehouse_cost_record(self):
        """Two WarehouseCost records against the SAME Sister Profile must
        each own only their own Expense rows — the old design could rely on
        `product` (1:1 with a QC report) to scope a correction; this one
        can't, since several records now share a Sister Profile."""
        first = services.create_warehouse_cost(sister_profile=self.sister, created_by=self.wh_user, loaderCost=40)
        second = services.create_warehouse_cost(sister_profile=self.sister, created_by=self.wh_user, loaderCost=60)
        self.assertEqual(Expense.objects.filter(warehouseCost=first).count(), 1)
        self.assertEqual(Expense.objects.filter(warehouseCost=second).count(), 1)
        self.assertEqual(Expense.objects.filter(warehouseCost=first).first().amount, Decimal("40"))
        self.assertEqual(Expense.objects.filter(warehouseCost=second).first().amount, Decimal("60"))

    # ── Edit / delete correctness under multiple records per profile ────

    def test_editing_one_warehouse_cost_does_not_touch_a_sibling_records_expenses(self):
        first = services.create_warehouse_cost(sister_profile=self.sister, created_by=self.wh_user, loaderCost=40)
        second = services.create_warehouse_cost(sister_profile=self.sister, created_by=self.wh_user, loaderCost=60)

        services.update_warehouse_cost(first, updated_by=self.wh_user, loaderCost=999)

        self.assertEqual(Expense.objects.filter(warehouseCost=second).count(), 1)
        self.assertEqual(Expense.objects.filter(warehouseCost=second).first().amount, Decimal("60"))
        self.assertEqual(Expense.objects.filter(warehouseCost=first).count(), 1)
        self.assertEqual(Expense.objects.filter(warehouseCost=first).first().amount, Decimal("999"))

    def test_deleting_one_warehouse_cost_does_not_touch_a_sibling_records_expenses(self):
        first = services.create_warehouse_cost(sister_profile=self.sister, created_by=self.wh_user, loaderCost=40)
        second = services.create_warehouse_cost(sister_profile=self.sister, created_by=self.wh_user, loaderCost=60)

        services.delete_warehouse_cost(first, actor=self.wh_user)

        self.assertFalse(WarehouseCost.objects.filter(pk=first.id).exists())
        self.assertTrue(WarehouseCost.objects.filter(pk=second.id).exists())
        self.assertEqual(Expense.objects.filter(warehouseCost=second).count(), 1)
        self.assertEqual(Expense.objects.filter(sisterProfile=self.sister, sourceType=SourceType.WAREHOUSE_LOADER).count(), 1)


class WarehouseCostAPITenantTests(APITestCase):
    def setUp(self):
        self.buyer_a = BuyerProfile.objects.create(name="Buyer A")
        self.buyer_b = BuyerProfile.objects.create(name="Buyer B")
        self.sister_a = SisterProfile.objects.create(
            buyerProfile=self.buyer_a, poReference="PO-A",
            agreementType=AgreementType.TYPE_1,
        )
        self.sister_b = SisterProfile.objects.create(
            buyerProfile=self.buyer_b, poReference="PO-B",
            agreementType=AgreementType.TYPE_1,
        )
        self.wh_user = User.objects.create_user(username="wh", password="pass12345", role=Roles.WAREHOUSE)
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.buyer_a_user = User.objects.create_user(
            username="buyer_a", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer_a
        )

        self.wc_a = services.create_warehouse_cost(sister_profile=self.sister_a, created_by=self.wh_user, loaderCost=20)
        self.wc_b = services.create_warehouse_cost(sister_profile=self.sister_b, created_by=self.wh_user, loaderCost=20)

    def test_buyer_cannot_see_another_buyers_warehouse_cost(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("warehouse-cost-detail", args=[self.wc_b.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_expenses_endpoint_scoped_per_buyer(self):
        self.assertEqual(Expense.objects.filter(sisterProfile=self.sister_a).count(), 1)
        self.assertEqual(Expense.objects.filter(sisterProfile=self.sister_b).count(), 1)

        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("expense-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)

    def test_warehouse_role_can_create_against_own_sister_profile_via_api(self):
        self.client.force_authenticate(user=self.wh_user)
        resp = self.client.post(
            reverse("warehouse-cost-list"),
            {"sisterProfile": str(self.sister_a.id), "loaderCost": 15}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["sisterProfile"], self.sister_a.id)
        self.assertEqual(resp.data["sisterProfilePoReference"], "PO-A")

    def test_create_rejects_a_packing_list_from_a_different_sister_profile_via_api(self):
        other_list = PackingList.objects.create(sisterProfile=self.sister_b, poNo="PO-B", createdBy=self.wh_user)
        self.client.force_authenticate(user=self.wh_user)
        resp = self.client.post(
            reverse("warehouse-cost-list"),
            {"sisterProfile": str(self.sister_a.id), "packingList": str(other_list.id), "loaderCost": 15}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_buyer_can_view_but_not_create_a_warehouse_cost(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("warehouse-cost-detail", args=[self.wc_a.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertNotIn("loaderCost", resp.data)  # WarehouseCostSelfSerializer — totals only

        resp = self.client.post(
            reverse("warehouse-cost-list"),
            {"sisterProfile": str(self.sister_a.id), "loaderCost": 15}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

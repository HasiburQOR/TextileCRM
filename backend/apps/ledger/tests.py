from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Roles, User
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile
from apps.expenses.models import SourceType
from apps.expenses.services import record_expense
from apps.ledger.models import SettlementLedger
from apps.ledger.services import recompute_settlement
from apps.sourcing.models import Product, ProductVariant


class SettlementFormulaTests(APITestCase):
    """DRF Migration Instructions §5 item 5: Settlement Ledger numbers must
    match hand-calculated expected values for at least one scenario per
    Agreement Type."""

    def setUp(self):
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.buyer = BuyerProfile.objects.create(name="Buyer")

    # ── Type 1: amountOwed = totalExpense * (percentage_rate / 100) ─────

    def test_type_1_formula(self):
        sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-T1",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        record_expense(sister_profile=sister, source_type=SourceType.SOURCING_ADVANCE, amount=500, created_by=self.admin)
        record_expense(sister_profile=sister, source_type=SourceType.QC_CARRYING, amount=600, created_by=self.admin)
        record_expense(sister_profile=sister, source_type=SourceType.WAREHOUSE_LOADER, amount=400, created_by=self.admin)
        # totalAdvance=500, totalExpense=1000, amountOwed=1000*0.08=80, netPosition=500-80=420
        ledger = SettlementLedger.objects.get(sisterProfile=sister)
        self.assertEqual(ledger.totalAdvance, Decimal("500.00"))
        self.assertEqual(ledger.totalExpense, Decimal("1000.00"))
        self.assertEqual(ledger.amountOwed, Decimal("80.00"))
        self.assertEqual(ledger.netPosition, Decimal("420.00"))
        self.assertFalse(ledger.negativeBalance)

    # ── Type 2: amountOwed = rate_per_unit * totalQuantitySourced ────────

    def test_type_2_formula_and_negative_balance(self):
        sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-T2",
            agreementType=AgreementType.TYPE_2, agreementRateConfig={"rate_per_unit": "1.5"},
        )
        rep = User.objects.create_user(username="rep_t2", password="pass12345", role=Roles.COMPANY_REP)
        product = Product.objects.create(sisterProfile=sister, name="Socks", createdBy=rep)
        ProductVariant.objects.create(product=product, colorName="Black", orderQty=120)
        ProductVariant.objects.create(product=product, colorName="Navy", orderQty=80)
        # totalQty = 200

        record_expense(sister_profile=sister, source_type=SourceType.SOURCING_ADVANCE, amount=100, created_by=self.admin)
        # amountOwed = 1.5 * 200 = 300, totalAdvance=100, netPosition=100-300=-200 -> negative
        ledger = SettlementLedger.objects.get(sisterProfile=sister)
        self.assertEqual(ledger.amountOwed, Decimal("300.00"))
        self.assertEqual(ledger.netPosition, Decimal("-200.00"))
        self.assertTrue(ledger.negativeBalance)

    # ── Type 3: amountOwed = totalExpense + totalExpense * (commission_percentage / 100) ─

    def test_type_3_formula(self):
        sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-T3",
            agreementType=AgreementType.TYPE_3, agreementRateConfig={"commission_percentage": 5},
        )
        record_expense(sister_profile=sister, source_type=SourceType.SOURCING_ADVANCE, amount=2000, created_by=self.admin)
        record_expense(sister_profile=sister, source_type=SourceType.QC_CARRYING, amount=1000, created_by=self.admin)
        # amountOwed = 1000 + 1000*0.05 = 1050, totalAdvance=2000, netPosition=2000-1050=950
        ledger = SettlementLedger.objects.get(sisterProfile=sister)
        self.assertEqual(ledger.amountOwed, Decimal("1050.00"))
        self.assertEqual(ledger.netPosition, Decimal("950.00"))
        self.assertFalse(ledger.negativeBalance)

    # ── Recompute-on-write (FR-75) ────────────────────────────────────────

    def test_ledger_recomputes_automatically_on_each_expense_write(self):
        sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-AUTO",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 10},
        )
        self.assertFalse(SettlementLedger.objects.filter(sisterProfile=sister).exists())
        record_expense(sister_profile=sister, source_type=SourceType.QC_CARRYING, amount=100, created_by=self.admin)
        ledger = SettlementLedger.objects.get(sisterProfile=sister)
        self.assertEqual(ledger.amountOwed, Decimal("10.00"))

        record_expense(sister_profile=sister, source_type=SourceType.WAREHOUSE_LOADER, amount=100, created_by=self.admin)
        ledger.refresh_from_db()
        self.assertEqual(ledger.totalExpense, Decimal("200.00"))
        self.assertEqual(ledger.amountOwed, Decimal("20.00"))

    def test_zero_amount_expense_does_not_create_a_row_or_recompute_crash(self):
        sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-ZERO",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 10},
        )
        result = record_expense(sister_profile=sister, source_type=SourceType.QC_LUNCH, amount=0, created_by=self.admin)
        self.assertIsNone(result)
        self.assertFalse(SettlementLedger.objects.filter(sisterProfile=sister).exists())

    def test_recompute_is_idempotent(self):
        sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-IDEM",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        record_expense(sister_profile=sister, source_type=SourceType.QC_CARRYING, amount=500, created_by=self.admin)
        first = recompute_settlement(sister)
        second = recompute_settlement(sister)
        self.assertEqual(first.amountOwed, second.amountOwed)
        self.assertEqual(SettlementLedger.objects.filter(sisterProfile=sister).count(), 1)


class SettlementAPITenantTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
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
        record_expense(sister_profile=self.sister_a, source_type=SourceType.QC_CARRYING, amount=100, created_by=self.admin)
        record_expense(sister_profile=self.sister_b, source_type=SourceType.QC_CARRYING, amount=100, created_by=self.admin)
        self.buyer_a_user = User.objects.create_user(
            username="buyer_a", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer_a
        )

    def test_buyer_cannot_see_another_buyers_settlement(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("settlement-detail", args=[self.sister_b.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_buyer_can_see_own_settlement(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("settlement-detail", args=[self.sister_a.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["amountOwed"], "8.00")

    def test_settlement_has_no_write_endpoints(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(reverse("settlement-list"), {"sisterProfile": str(self.sister_a.id)}, format="json")
        self.assertIn(resp.status_code, (status.HTTP_405_METHOD_NOT_ALLOWED, status.HTTP_403_FORBIDDEN))

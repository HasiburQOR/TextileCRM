from decimal import Decimal

from django.core.exceptions import ValidationError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Roles, User
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile
from apps.expenses.models import SourceType
from apps.expenses.services import delete_expenses, record_expense
from apps.notifications.models import Notification, NotificationType
from apps.qc.services import create_qc_report, update_qc_report
from apps.sourcing.models import Product, ProductStatus
from apps.wallet import services
from apps.wallet.models import BuyerWallet, WalletTransaction, WalletTransactionType


class WalletAutoCreationTests(APITestCase):
    """WF-01: exactly one BuyerWallet, created automatically at Buyer
    creation — never created separately/manually."""

    def setUp(self):
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)

    def test_wallet_created_via_api_buyer_creation(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(reverse("buyer-profile-list"), {"name": "New Buyer"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(BuyerWallet.objects.filter(buyerProfile_id=resp.data["id"]).exists())

    def test_create_wallet_is_idempotent(self):
        buyer = BuyerProfile.objects.create(name="Idempotent Buyer")
        w1 = services.create_wallet(buyer)
        w2 = services.create_wallet(buyer)
        self.assertEqual(w1.buyerProfile_id, w2.buyerProfile_id)
        self.assertEqual(BuyerWallet.objects.filter(buyerProfile=buyer).count(), 1)


class WalletServiceTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.wallet = services.create_wallet(self.buyer)
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )

    # ── Top-up + Expense-driven deduction (Acceptance Checklist item 2) ──

    def test_top_up_then_expense_deduction_running_balance(self):
        services.record_top_up(wallet=self.wallet, amount=1000, currency="USD", method_reference="TXN-001", created_by=self.admin)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("1000.00"))

        record_expense(sister_profile=self.sister, source_type=SourceType.QC_CARRYING, amount=150, created_by=self.admin)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("850.00"))

        transactions = list(WalletTransaction.objects.filter(wallet=self.wallet).order_by("createdAt"))
        self.assertEqual(len(transactions), 2)
        self.assertEqual(transactions[0].type, WalletTransactionType.TOP_UP)
        self.assertEqual(transactions[0].amount, Decimal("1000.00"))
        self.assertEqual(transactions[1].type, WalletTransactionType.DEDUCTION)
        self.assertEqual(transactions[1].amount, Decimal("-150.00"))
        self.assertEqual(transactions[1].sourceExpense.sourceType, SourceType.QC_CARRYING)

    def test_top_up_requires_method_reference(self):
        with self.assertRaises(ValidationError):
            services.record_top_up(wallet=self.wallet, amount=500, currency="USD", method_reference="", created_by=self.admin)

    def test_top_up_requires_positive_amount(self):
        with self.assertRaises(ValidationError):
            services.record_top_up(wallet=self.wallet, amount=0, currency="USD", method_reference="ref", created_by=self.admin)

    # ── Manual adjustment always requires a reason ────────────────────────

    def test_adjustment_requires_reason(self):
        with self.assertRaises(ValidationError):
            services.record_adjustment(wallet=self.wallet, amount=-50, reason="", created_by=self.admin)

    def test_adjustment_with_reason_succeeds_and_can_be_negative(self):
        services.record_adjustment(wallet=self.wallet, amount=-25, reason="Bank fee", created_by=self.admin)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("-25.00"))

    # ── Voiding/correcting an Expense produces a Refund, never edits ─────

    def test_correcting_a_qc_report_refunds_instead_of_editing_original_deduction(self):
        product = Product.objects.create(sisterProfile=self.sister, name="T-Shirts", createdBy=self.rep, status=ProductStatus.APPROVED_FOR_QC)
        create_qc_report(
            product=product, created_by=self.rep, lunch_cost_flag=True, lunch_cost=100,
            goods_carrying_cost=50, travel_mode="travelling_with_goods", extra_cost=0,
        )
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("-150.00"))
        original_deduction_count = WalletTransaction.objects.filter(wallet=self.wallet, type=WalletTransactionType.DEDUCTION).count()
        self.assertEqual(original_deduction_count, 2)

        report = product.qcReport
        update_qc_report(
            report, updated_by=self.rep, lunch_cost_flag=True, lunch_cost=100,
            goods_carrying_cost=20, travel_mode="travelling_with_goods", extra_cost=0,
        )
        self.wallet.refresh_from_db()
        # Original 150 fully refunded, new 120 (100 lunch + 20 carrying) deducted.
        self.assertEqual(self.wallet.balance, Decimal("-120.00"))

        # Original deduction rows are untouched, never deleted/edited — only
        # new refund + deduction rows were appended.
        self.assertEqual(
            WalletTransaction.objects.filter(wallet=self.wallet, type=WalletTransactionType.DEDUCTION).count(),
            original_deduction_count + 2,
        )
        self.assertEqual(WalletTransaction.objects.filter(wallet=self.wallet, type=WalletTransactionType.REFUND).count(), 2)

    def test_delete_expenses_refunds_even_with_no_actor_passed(self):
        record_expense(sister_profile=self.sister, source_type=SourceType.EXTRA_COST, amount=40, created_by=self.admin)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("-40.00"))

        delete_expenses(product=None, source_types=[SourceType.EXTRA_COST])
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("0.00"))
        refund = WalletTransaction.objects.get(wallet=self.wallet, type=WalletTransactionType.REFUND)
        self.assertEqual(refund.amount, Decimal("40.00"))
        self.assertEqual(refund.createdBy, self.admin)  # fell back to the original deduction's creator

    # ── Balance always == SUM(transactions) (Acceptance Checklist item 4) ─

    def test_balance_is_always_sum_of_transactions(self):
        services.record_top_up(wallet=self.wallet, amount=500, currency="USD", method_reference="ref1", created_by=self.admin)
        record_expense(sister_profile=self.sister, source_type=SourceType.QC_LUNCH, amount=30, created_by=self.admin)
        services.record_adjustment(wallet=self.wallet, amount=-10, reason="correction", created_by=self.admin)

        self.wallet.refresh_from_db()
        from django.db.models import Sum

        total = WalletTransaction.objects.filter(wallet=self.wallet).aggregate(total=Sum("amount"))["total"]
        self.assertEqual(self.wallet.balance, total)

    # ── Negative/low-balance alerts fire on transition only ──────────────

    def test_negative_balance_alert_fires_once_on_transition(self):
        buyer_user = User.objects.create_user(username="buyer1", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer)
        record_expense(sister_profile=self.sister, source_type=SourceType.QC_LUNCH, amount=100, created_by=self.admin)
        self.assertTrue(
            Notification.objects.filter(user=buyer_user, type=NotificationType.WALLET_NEGATIVE_BALANCE).exists()
        )
        self.assertTrue(
            Notification.objects.filter(user=self.admin, type=NotificationType.WALLET_NEGATIVE_BALANCE).exists()
        )
        alert_count = Notification.objects.filter(type=NotificationType.WALLET_NEGATIVE_BALANCE).count()

        record_expense(sister_profile=self.sister, source_type=SourceType.QC_CARRYING, amount=50, created_by=self.admin)
        self.assertEqual(Notification.objects.filter(type=NotificationType.WALLET_NEGATIVE_BALANCE).count(), alert_count)

    def test_low_balance_alert_fires_within_threshold(self):
        self.wallet.lowBalanceThreshold = Decimal("100.00")
        self.wallet.save(update_fields=["lowBalanceThreshold"])
        services.record_top_up(wallet=self.wallet, amount=150, currency="USD", method_reference="ref", created_by=self.admin)
        record_expense(sister_profile=self.sister, source_type=SourceType.QC_LUNCH, amount=80, created_by=self.admin)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("70.00"))
        self.assertTrue(self.wallet.lowBalance)
        self.assertTrue(Notification.objects.filter(type=NotificationType.WALLET_LOW_BALANCE).exists())


class WalletAPITenantTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.buyer_a = BuyerProfile.objects.create(name="Buyer A")
        self.buyer_b = BuyerProfile.objects.create(name="Buyer B")
        self.wallet_a = services.create_wallet(self.buyer_a)
        services.create_wallet(self.buyer_b)
        self.buyer_a_user = User.objects.create_user(
            username="buyer_a", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer_a
        )

    def test_buyer_cannot_see_another_buyers_wallet(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("buyer-profile-wallet-detail", args=[self.buyer_b.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_buyer_can_see_own_wallet_read_only(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("buyer-profile-wallet-detail", args=[self.buyer_a.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertNotIn("lowBalanceThreshold", resp.data)  # WalletSelfSerializer omits admin-only internals

    def test_buyer_cannot_top_up(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.post(
            reverse("buyer-profile-top-up", args=[self.buyer_a.id]),
            {"amount": 100, "methodReference": "ref"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_top_up_and_adjust(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            reverse("buyer-profile-top-up", args=[self.buyer_a.id]),
            {"amount": 200, "methodReference": "bank-ref-1"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        resp = self.client.post(
            reverse("buyer-profile-adjust", args=[self.buyer_a.id]),
            {"amount": -20, "reason": "bank fee"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        resp = self.client.get(reverse("buyer-profile-wallet-detail", args=[self.buyer_a.id]))
        self.assertEqual(resp.data["balance"], "180.00")

    def test_adjust_without_reason_is_rejected(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            reverse("buyer-profile-adjust", args=[self.buyer_a.id]), {"amount": -20}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_portal_wallet_endpoint_scoped_to_self(self):
        services.record_top_up(wallet=self.wallet_a, amount=300, currency="USD", method_reference="ref", created_by=self.admin)
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("portal-wallet"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["wallet"]["balance"], "300.00")
        self.assertEqual(len(resp.data["transactions"]), 1)

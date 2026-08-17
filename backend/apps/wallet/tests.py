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
            agreementType=AgreementType.TYPE_1,
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

    # ── Dual currency: costs are incurred in BDT, charged in USD ─────────

    def _rated_profile(self, rate="120"):
        self.sister.supplierCurrency = "BDT"
        self.sister.buyerCurrency = "USD"
        self.sister.exchangeRate = Decimal(rate)
        self.sister.save(update_fields=["supplierCurrency", "buyerCurrency", "exchangeRate"])
        return self.sister

    def test_a_supplier_currency_cost_is_converted_into_the_buyer_wallet(self):
        self._rated_profile("120")
        services.record_top_up(wallet=self.wallet, amount=1000, currency="USD", method_reference="TXN-001", created_by=self.admin)

        expense = record_expense(
            sister_profile=self.sister, source_type=SourceType.WAREHOUSE_LOADER, amount=12000, created_by=self.admin,
        )
        # The Expense keeps both figures and the rate it used.
        self.assertEqual(expense.amount, Decimal("12000"))
        self.assertEqual(expense.currency, "BDT")
        self.assertEqual(expense.amountInBuyerCurrency, Decimal("100.00"))  # 12,000 / 120
        self.assertEqual(expense.buyerCurrency, "USD")
        self.assertEqual(expense.exchangeRateUsed, Decimal("120"))

        # The wallet is charged in ITS currency, and shows what was spent.
        txn = WalletTransaction.objects.get(sourceExpense=expense, type=WalletTransactionType.DEDUCTION)
        self.assertEqual(txn.amount, Decimal("-100.00"))
        self.assertEqual(txn.currency, "USD")
        self.assertEqual(txn.sourceAmount, Decimal("-12000.00"))
        self.assertEqual(txn.sourceCurrency, "BDT")
        self.assertEqual(txn.exchangeRateUsed, Decimal("120"))

        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("900.00"))  # 1,000 - 100

    def test_an_unrated_profile_deducts_one_to_one(self):
        """Rate 0 means the deal's rate hasn't been agreed yet — the cost
        passes through unconverted rather than vanishing or dividing by 0."""
        record_expense(sister_profile=self.sister, source_type=SourceType.QC_LUNCH, amount=150, created_by=self.admin)
        txn = WalletTransaction.objects.get(type=WalletTransactionType.DEDUCTION)
        self.assertEqual(txn.amount, Decimal("-150.00"))
        self.assertIsNone(txn.exchangeRateUsed)

    def test_a_caller_supplied_currency_is_not_converted(self):
        """The profile's rate describes supplier→buyer only; it says nothing
        about a third currency, so an explicit one passes through as-is."""
        self._rated_profile("120")
        expense = record_expense(
            sister_profile=self.sister, source_type=SourceType.EXTRA_COST, amount=90,
            currency="EUR", created_by=self.admin,
        )
        self.assertEqual(expense.currency, "EUR")
        self.assertEqual(expense.amountInBuyerCurrency, Decimal("90.00"))
        self.assertIsNone(expense.exchangeRateUsed)

    def test_a_refund_reverses_at_the_rate_it_was_charged_at(self):
        """The regression that matters: re-negotiating the rate must not
        change what an already-charged cost is worth. Refunding 12,000 BDT
        at a new rate of 100 would hand back 120 USD for a 100 USD charge."""
        self._rated_profile("120")
        product = Product.objects.create(sisterProfile=self.sister, name="Tote", createdBy=self.rep)
        record_expense(
            sister_profile=self.sister, product=product, source_type=SourceType.WAREHOUSE_LOADER,
            amount=12000, created_by=self.admin,
        )
        self.wallet.refresh_from_db()
        balance_after_charge = self.wallet.balance
        self.assertEqual(balance_after_charge, Decimal("-100.00"))

        # The deal is re-negotiated before the cost is corrected away.
        self._rated_profile("100")
        delete_expenses(product=product, source_types=[SourceType.WAREHOUSE_LOADER], actor=self.admin)

        refund = WalletTransaction.objects.get(type=WalletTransactionType.REFUND)
        self.assertEqual(refund.amount, Decimal("100.00"))  # NOT 120
        self.assertEqual(refund.sourceAmount, Decimal("12000.00"))
        self.assertEqual(refund.exchangeRateUsed, Decimal("120"))  # the original, not the new one

        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("0.00"))  # exactly back to where it started

    def test_the_balance_is_always_the_sum_of_the_buyer_currency_amounts(self):
        self._rated_profile("120")
        services.record_top_up(wallet=self.wallet, amount=500, currency="USD", method_reference="T1", created_by=self.admin)
        record_expense(sister_profile=self.sister, source_type=SourceType.WAREHOUSE_LOADER, amount=6000, created_by=self.admin)
        record_expense(sister_profile=self.sister, source_type=SourceType.QC_LUNCH, amount=1200, created_by=self.admin)

        self.wallet.refresh_from_db()
        # 500 - 50 - 10
        self.assertEqual(self.wallet.balance, Decimal("440.00"))
        self.assertEqual(
            sum(t.amount for t in WalletTransaction.objects.filter(wallet=self.wallet)),
            self.wallet.balance,
        )

    def test_wallet_summary_reports_both_currencies(self):
        self._rated_profile("120")
        services.record_top_up(wallet=self.wallet, amount=1000, currency="USD", method_reference="T1", created_by=self.admin)
        record_expense(sister_profile=self.sister, source_type=SourceType.WAREHOUSE_LOADER, amount=12000, created_by=self.admin)

        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(reverse("wallets-summary"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        usd = next(r for r in resp.data["byCurrency"] if r["currency"] == "USD")
        self.assertEqual(usd["topUps"], Decimal("1000.00"))
        self.assertEqual(usd["charged"], Decimal("100.00"))
        self.assertEqual(usd["balance"], Decimal("900.00"))

        bdt = next(r for r in resp.data["bySupplierCurrency"] if r["currency"] == "BDT")
        self.assertEqual(bdt["spent"], Decimal("12000.00"))

    def test_wallet_summary_is_admin_only(self):
        self.client.force_authenticate(user=self.rep)
        self.assertEqual(self.client.get(reverse("wallets-summary")).status_code, status.HTTP_403_FORBIDDEN)

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

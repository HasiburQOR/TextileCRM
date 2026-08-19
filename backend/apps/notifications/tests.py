from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Roles, User
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile
from apps.expenses.models import SourceType
from apps.expenses.services import record_expense
from apps.invoicing import services as invoicing_services
from apps.notifications.models import Notification, NotificationType
from apps.sourcing import services as sourcing_services
from apps.sourcing.models import Product, ProductStatus, SourcingCost, SourcingCostItem, TripStatus


class NotificationTriggerTests(APITestCase):
    """BR-58 / FR-84: exactly the trigger points the spec names."""

    def setUp(self):
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.employee = User.objects.create_user(username="emp", password="pass12345", role=Roles.EMPLOYEE)
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.buyer_user = User.objects.create_user(
            username="buyer_portal", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer
        )
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1,
        )

    def test_trip_closure_notifies_the_creating_rep(self):
        product = Product.objects.create(sisterProfile=self.sister, name="Jacket", createdBy=self.rep)
        cost = SourcingCost.objects.create(sisterProfile=self.sister)
        SourcingCostItem.objects.create(
            sourcingCost=cost, product=product, locationName="Gazipur",
            customCostFields=[{"name": "Transport", "amount": 500}],
            date=timezone.now(),
        )
        sourcing_services.close_sourcing_cost(cost)

        notif = Notification.objects.filter(type=NotificationType.TRIP_CLOSED).first()
        self.assertIsNotNone(notif)
        self.assertIn(cost.sisterProfile.poReference, notif.message)

    def test_approval_and_rejection_notify_the_creating_rep(self):
        product = Product.objects.create(
            sisterProfile=self.sister, name="Shorts", createdBy=self.rep, status=ProductStatus.PENDING_ADMIN_APPROVAL
        )
        sourcing_services.approve_product(product, self.admin)
        self.assertTrue(Notification.objects.filter(user=self.rep, type=NotificationType.REQUEST_APPROVED).exists())

        product2 = Product.objects.create(
            sisterProfile=self.sister, name="Hats", createdBy=self.rep, status=ProductStatus.PENDING_ADMIN_APPROVAL
        )
        sourcing_services.reject_product(product2, self.admin, "quality")
        self.assertTrue(Notification.objects.filter(user=self.rep, type=NotificationType.REQUEST_REJECTED).exists())

    def test_invoice_issuance_notifies_the_buyer(self):
        invoice = invoicing_services.create_invoice(
            sister_profile=self.sister, created_by=self.employee,
            line_items=[{"description": "Goods", "amount": "500"}], commission_rate=10,
        )
        invoicing_services.approve_invoice(invoice, self.admin)
        self.assertTrue(Notification.objects.filter(user=self.buyer_user, type=NotificationType.INVOICE_ISSUED).exists())

    def test_payment_recorded_notifies_the_buyer(self):
        invoice = invoicing_services.create_invoice(
            sister_profile=self.sister, created_by=self.employee,
            line_items=[{"description": "Goods", "amount": "500"}], commission_rate=10,
        )
        invoicing_services.approve_invoice(invoice, self.admin)
        invoicing_services.record_payment(
            invoice, amount=100, currency="USD", payment_date="2026-08-10", bank_reference="", recorded_by=self.admin,
        )
        self.assertTrue(Notification.objects.filter(user=self.buyer_user, type=NotificationType.PAYMENT_RECORDED).exists())

    def test_negative_balance_notifies_admin_and_buyer_only_on_transition(self):
        """The Settlement Ledger's own alert is gone with the ledger — the
        Buyer Wallet is now the single negative-balance signal. An expense
        against an un-topped-up wallet drives it straight below zero."""
        record_expense(sister_profile=self.sister, source_type=SourceType.SOURCING_ADVANCE, amount=50, created_by=self.admin)
        # One alert event -> one row per recipient (Admin + buyer) = 2 rows.
        self.assertEqual(Notification.objects.filter(type=NotificationType.WALLET_NEGATIVE_BALANCE).count(), 2)
        self.assertTrue(Notification.objects.filter(user=self.admin, type=NotificationType.WALLET_NEGATIVE_BALANCE).exists())
        self.assertTrue(Notification.objects.filter(user=self.buyer_user, type=NotificationType.WALLET_NEGATIVE_BALANCE).exists())

        # A second Expense write while still negative must NOT re-fire the alert.
        record_expense(sister_profile=self.sister, source_type=SourceType.QC_CARRYING, amount=10, created_by=self.admin)
        self.assertEqual(Notification.objects.filter(type=NotificationType.WALLET_NEGATIVE_BALANCE).count(), 2)


class NotificationAPITests(APITestCase):
    def setUp(self):
        self.user_a = User.objects.create_user(username="user_a", password="pass12345", role=Roles.COMPANY_REP)
        self.user_b = User.objects.create_user(username="user_b", password="pass12345", role=Roles.COMPANY_REP)
        Notification.objects.create(user=self.user_a, title="For A", message="x", type=NotificationType.TRIP_CLOSED)
        Notification.objects.create(user=self.user_b, title="For B", message="x", type=NotificationType.TRIP_CLOSED)

    def test_user_only_sees_own_notifications(self):
        self.client.force_authenticate(user=self.user_a)
        resp = self.client.get(reverse("notification-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["title"], "For A")

    def test_mark_read(self):
        notif = Notification.objects.get(user=self.user_a)
        self.client.force_authenticate(user=self.user_a)
        resp = self.client.patch(reverse("notification-read", args=[notif.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        notif.refresh_from_db()
        self.assertTrue(notif.isRead)

    def test_cannot_mark_another_users_notification_read(self):
        notif_b = Notification.objects.get(user=self.user_b)
        self.client.force_authenticate(user=self.user_a)
        resp = self.client.patch(reverse("notification-read", args=[notif_b.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

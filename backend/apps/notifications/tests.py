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
from apps.sourcing.models import LocationEntryStatus, Product, ProductStatus, SourcingLocationEntry, SourcingTrip, TripStatus


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
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )

    def test_trip_closure_notifies_the_creating_rep(self):
        product = Product.objects.create(sisterProfile=self.sister, name="Jacket", createdBy=self.rep)
        trip = SourcingTrip.objects.create(product=product)
        loc = SourcingLocationEntry.objects.create(sourcingTrip=trip, locationName="Gazipur", date=timezone.now())
        sourcing_services.report_location(loc, self.rep)
        sourcing_services.close_sourcing_trip(trip)

        notif = Notification.objects.get(user=self.rep, type=NotificationType.TRIP_CLOSED)
        self.assertIn("Jacket", notif.message)

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
            sister_profile=self.sister, created_by=self.employee, line_items=[{"description": "Goods", "amount": "500"}],
        )
        invoicing_services.approve_invoice(invoice, self.admin)
        self.assertTrue(Notification.objects.filter(user=self.buyer_user, type=NotificationType.INVOICE_ISSUED).exists())

    def test_payment_recorded_notifies_the_buyer(self):
        invoice = invoicing_services.create_invoice(
            sister_profile=self.sister, created_by=self.employee, line_items=[{"description": "Goods", "amount": "500"}],
        )
        invoicing_services.approve_invoice(invoice, self.admin)
        invoicing_services.record_payment(
            invoice, amount=100, currency="USD", payment_date="2026-08-10", bank_reference="", recorded_by=self.admin,
        )
        self.assertTrue(Notification.objects.filter(user=self.buyer_user, type=NotificationType.PAYMENT_RECORDED).exists())

    def test_negative_balance_notifies_admin_and_buyer_only_on_transition(self):
        # TYPE_2: rate=10/unit. 20 units sourced -> owed=200. Advance=50 -> net=-150 (negative).
        product = Product.objects.create(sisterProfile=self.sister, name="Bags", createdBy=self.rep)
        from apps.sourcing.models import ProductVariant

        ProductVariant.objects.create(product=product, colorBreakdown={"Black": 20}, orderQty=20)
        self.sister.agreementType = AgreementType.TYPE_2
        self.sister.agreementRateConfig = {"rate_per_unit": 10}
        self.sister.save()

        record_expense(sister_profile=self.sister, source_type=SourceType.SOURCING_ADVANCE, amount=50, created_by=self.admin)
        # One alert event -> one row per recipient (Admin + buyer) = 2 rows.
        self.assertEqual(Notification.objects.filter(type=NotificationType.NEGATIVE_BALANCE_ALERT).count(), 2)
        self.assertTrue(Notification.objects.filter(user=self.admin, type=NotificationType.NEGATIVE_BALANCE_ALERT).exists())
        self.assertTrue(Notification.objects.filter(user=self.buyer_user, type=NotificationType.NEGATIVE_BALANCE_ALERT).exists())

        # A second Expense write while still negative must NOT re-fire the alert.
        record_expense(sister_profile=self.sister, source_type=SourceType.QC_CARRYING, amount=10, created_by=self.admin)
        self.assertEqual(Notification.objects.filter(type=NotificationType.NEGATIVE_BALANCE_ALERT).count(), 2)


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

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Roles, User
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile
from apps.expenses.models import Expense, SourceType
from apps.sourcing import services
from apps.sourcing.models import (
    LocationEntryStatus,
    Product,
    ProductStatus,
    SourcingLocationEntry,
    SourcingTrip,
    TripStatus,
)


class StateMachineTests(APITestCase):
    """DRF Migration Instructions §5 item 3: every state machine transition
    must reject invalid transitions."""

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.product = Product.objects.create(sisterProfile=self.sister, name="Kids T-Shirt", createdBy=self.rep)

    def _trip_with_locations(self, count=2):
        trip = SourcingTrip.objects.create(product=self.product)
        for i in range(count):
            SourcingLocationEntry.objects.create(
                sourcingTrip=trip, locationName=f"Location {i}", quantity=100, advanceAmount=500, date=timezone.now()
            )
        return trip

    # ── Sourcing Trip closing ───────────────────────────────────────────

    def test_cannot_close_trip_with_pending_locations(self):
        trip = self._trip_with_locations()
        with self.assertRaises(ValidationError):
            services.close_sourcing_trip(trip)
        trip.refresh_from_db()
        self.assertEqual(trip.status, TripStatus.OPEN)

    def test_cannot_close_trip_with_no_locations(self):
        trip = SourcingTrip.objects.create(product=self.product)
        with self.assertRaises(ValidationError):
            services.close_sourcing_trip(trip)

    def test_close_trip_succeeds_once_all_locations_reported(self):
        trip = self._trip_with_locations()
        for location in trip.locations.all():
            services.report_location(location, self.rep)
        services.close_sourcing_trip(trip)
        trip.refresh_from_db()
        self.assertEqual(trip.status, TripStatus.CLOSED)
        self.assertIsNotNone(trip.fullPaymentConfirmedAt)

    def test_cannot_close_an_already_closed_trip(self):
        trip = self._trip_with_locations(count=1)
        services.report_location(trip.locations.first(), self.rep)
        services.close_sourcing_trip(trip)
        with self.assertRaises(ValidationError):
            services.close_sourcing_trip(trip)

    def test_cannot_report_location_on_closed_trip(self):
        trip = self._trip_with_locations(count=1)
        location = trip.locations.first()
        services.report_location(location, self.rep)
        services.close_sourcing_trip(trip)
        extra = SourcingLocationEntry.objects.create(
            sourcingTrip=trip, locationName="Late Location", date=timezone.now()
        )
        with self.assertRaises(ValidationError):
            services.report_location(extra, self.rep)

    # ── Approval gate: FR-70 hard gate ──────────────────────────────────

    def test_cannot_submit_for_approval_while_trip_open(self):
        self._trip_with_locations()
        with self.assertRaises(ValidationError):
            services.submit_for_approval(self.product)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, ProductStatus.SOURCING_TRIP_OPEN)

    def test_cannot_submit_for_approval_with_no_trip_at_all(self):
        with self.assertRaises(ValidationError):
            services.submit_for_approval(self.product)

    def test_submit_for_approval_succeeds_once_trip_closed(self):
        trip = self._trip_with_locations(count=1)
        services.report_location(trip.locations.first(), self.rep)
        services.close_sourcing_trip(trip)
        services.submit_for_approval(self.product)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, ProductStatus.PENDING_ADMIN_APPROVAL)

    def test_cannot_submit_twice(self):
        trip = self._trip_with_locations(count=1)
        services.report_location(trip.locations.first(), self.rep)
        services.close_sourcing_trip(trip)
        services.submit_for_approval(self.product)
        with self.assertRaises(ValidationError):
            services.submit_for_approval(self.product)

    # ── Approve / reject transitions ────────────────────────────────────

    def test_cannot_approve_a_product_not_pending(self):
        with self.assertRaises(ValidationError):
            services.approve_product(self.product, self.admin)

    def test_cannot_reject_a_product_not_pending(self):
        with self.assertRaises(ValidationError):
            services.reject_product(self.product, self.admin, "bad fabric")

    def test_reject_requires_a_reason(self):
        self.product.status = ProductStatus.PENDING_ADMIN_APPROVAL
        self.product.save()
        with self.assertRaises(ValidationError):
            services.reject_product(self.product, self.admin, "")

    def test_approve_sets_status_and_reviewer(self):
        self.product.status = ProductStatus.PENDING_ADMIN_APPROVAL
        self.product.save()
        services.approve_product(self.product, self.admin)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, ProductStatus.APPROVED_FOR_QC)
        self.assertEqual(self.product.reviewedBy, self.admin)
        self.assertIsNotNone(self.product.reviewedAt)

    def test_reject_sets_status_reason_and_reviewer(self):
        self.product.status = ProductStatus.PENDING_ADMIN_APPROVAL
        self.product.save()
        services.reject_product(self.product, self.admin, "Fabric quality below spec.")
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, ProductStatus.REJECTED)
        self.assertEqual(self.product.rejectionReason, "Fabric quality below spec.")

    def test_cannot_approve_an_already_approved_product(self):
        self.product.status = ProductStatus.PENDING_ADMIN_APPROVAL
        self.product.save()
        services.approve_product(self.product, self.admin)
        with self.assertRaises(ValidationError):
            services.approve_product(self.product, self.admin)


class SourcingTenantIsolationTests(APITestCase):
    """Same rules as Phase 1, applied to the new sourcing endpoints."""

    def setUp(self):
        self.buyer_a = BuyerProfile.objects.create(name="Zara Textiles")
        self.buyer_b = BuyerProfile.objects.create(name="H&M Sourcing")
        self.sister_a = SisterProfile.objects.create(
            buyerProfile=self.buyer_a, poReference="PO-A",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.sister_b = SisterProfile.objects.create(
            buyerProfile=self.buyer_b, poReference="PO-B",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.buyer_a_user = User.objects.create_user(
            username="buyer_a", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer_a
        )

        self.product_a = Product.objects.create(sisterProfile=self.sister_a, name="Product A", createdBy=self.rep)
        self.product_b = Product.objects.create(sisterProfile=self.sister_b, name="Product B", createdBy=self.rep)
        self.trip_a = SourcingTrip.objects.create(product=self.product_a)
        self.trip_b = SourcingTrip.objects.create(product=self.product_b)

    def auth_as(self, user):
        self.client.force_authenticate(user=user)

    def test_buyer_cannot_see_another_buyers_product(self):
        self.auth_as(self.buyer_a_user)
        resp = self.client.get(reverse("product-detail", args=[self.product_b.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_buyer_product_list_scoped_to_own_buyer(self):
        self.auth_as(self.buyer_a_user)
        resp = self.client.get(reverse("product-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {str(self.product_a.id)})

    def test_buyer_cannot_see_another_buyers_trip(self):
        self.auth_as(self.buyer_a_user)
        resp = self.client.get(reverse("sourcing-trip-detail", args=[self.trip_b.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_buyer_cannot_create_product(self):
        self.auth_as(self.buyer_a_user)
        resp = self.client.post(
            reverse("product-list"), {"sisterProfile": str(self.sister_a.id), "name": "Sneaky"}, format="json"
        )
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED))

    def test_buyer_cannot_approve_product(self):
        self.auth_as(self.buyer_a_user)
        resp = self.client.post(reverse("product-approve", args=[self.product_a.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_company_rep_cannot_approve_product(self):
        # Approval is Admin-only (BR-10), even for the rep who created it.
        self.product_a.status = ProductStatus.PENDING_ADMIN_APPROVAL
        self.product_a.save()
        self.auth_as(self.rep)
        resp = self.client.post(reverse("product-approve", args=[self.product_a.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_management_role_can_read_but_not_create(self):
        management = User.objects.create_user(username="mgmt", password="pass12345", role=Roles.MANAGEMENT)
        self.auth_as(management)
        resp = self.client.get(reverse("product-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 2)

        resp = self.client.post(
            reverse("product-list"), {"sisterProfile": str(self.sister_a.id), "name": "X"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class FullWorkflowAPITests(APITestCase):
    """End-to-end happy path through the Phase 2 API surface."""

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)

    def test_full_intake_to_approval_flow(self):
        self.client.force_authenticate(user=self.rep)

        # 1. create product with variants (color x size matrix)
        resp = self.client.post(
            reverse("product-list"),
            {
                "sisterProfile": str(self.sister.id),
                "name": "Kids Cotton T-Shirt",
                "brandName": "ZARA",
                "poNo": "PO-ZARA-001",
                "variants": [
                    {"colorBreakdown": {"Black": 500}, "patternNo": "MR12528", "orderQty": 500},
                    {"colorBreakdown": {"Navy": 300}, "patternNo": "MR12529", "orderQty": 300},
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        product_id = resp.data["id"]
        self.assertEqual(resp.data["totalOrderQty"], 800)
        self.assertTrue(resp.data["styleNumber"].startswith("STY-"))

        # 2. create a sourcing trip with two locations
        resp = self.client.post(
            reverse("sourcing-trip-list"),
            {
                "product": product_id,
                "locations": [
                    {"locationName": "Gazipur Factory", "quantity": 500, "advanceAmount": 2000, "date": timezone.now().isoformat()},
                    {"locationName": "Narayanganj Mill", "quantity": 300, "advanceAmount": 1500, "date": timezone.now().isoformat()},
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        trip_id = resp.data["id"]
        location_ids = [loc["id"] for loc in resp.data["locations"]]

        # 3. attempting to submit for approval while trip is open fails
        resp = self.client.post(reverse("product-submit-for-approval", args=[product_id]))
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. report both locations
        for loc_id in location_ids:
            resp = self.client.post(
                reverse("sourcing-trip-locations-report", args=[trip_id, loc_id])
            )
            self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # 5. close the trip
        resp = self.client.post(reverse("sourcing-trip-close", args=[trip_id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], TripStatus.CLOSED)

        # 6. submit for approval now succeeds
        resp = self.client.post(reverse("product-submit-for-approval", args=[product_id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], ProductStatus.PENDING_ADMIN_APPROVAL)

        # 7. rep cannot approve (admin-only)
        resp = self.client.post(reverse("product-approve", args=[product_id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # 8. admin approves
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(reverse("product-approve", args=[product_id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], ProductStatus.APPROVED_FOR_QC)


class SourcingAdvanceExpenseTests(APITestCase):
    """FR-72: a location's advance is a "sourcing advance" cost and must
    land in the Central Expense Table (DRF doc §5 item 4)."""

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.product = Product.objects.create(sisterProfile=self.sister, name="Kids T-Shirt", createdBy=self.rep)
        self.trip = SourcingTrip.objects.create(product=self.product)
        self.location = SourcingLocationEntry.objects.create(
            sourcingTrip=self.trip, locationName="Gazipur Factory", quantity=500, advanceAmount=2000, date=timezone.now()
        )

    def test_reporting_a_location_writes_a_sourcing_advance_expense(self):
        self.assertEqual(Expense.objects.count(), 0)
        services.report_location(self.location, self.rep)
        expenses = Expense.objects.filter(sisterProfile=self.sister, product=self.product)
        self.assertEqual(expenses.count(), 1)
        expense = expenses.first()
        self.assertEqual(expense.sourceType, SourceType.SOURCING_ADVANCE)
        self.assertEqual(expense.amount, Decimal("2000"))
        self.assertEqual(expense.createdBy, self.rep)

    def test_reporting_a_zero_advance_location_writes_no_expense(self):
        zero_location = SourcingLocationEntry.objects.create(
            sourcingTrip=self.trip, locationName="No Advance Location", quantity=100, advanceAmount=0, date=timezone.now()
        )
        services.report_location(zero_location, self.rep)
        self.assertEqual(Expense.objects.count(), 0)

from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Roles, User
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile


class TenantIsolationTests(APITestCase):
    """DRF Migration Instructions, Section 5, items 1-2: a buyer-role user
    must never read another buyer's data, and must never successfully call
    a write endpoint."""

    def setUp(self):
        self.buyer_a = BuyerProfile.objects.create(name="Zara Textiles")
        self.buyer_b = BuyerProfile.objects.create(name="H&M Sourcing")

        self.sister_a = SisterProfile.objects.create(
            buyerProfile=self.buyer_a,
            poReference="PO-A-001",
            agreementType=AgreementType.TYPE_1,
            agreementRateConfig={"percentage_rate": 8},
        )
        self.sister_b = SisterProfile.objects.create(
            buyerProfile=self.buyer_b,
            poReference="PO-B-001",
            agreementType=AgreementType.TYPE_2,
            agreementRateConfig={"rate_per_unit": 1.5},
        )

        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.buyer_a_user = User.objects.create_user(
            username="buyer_a", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer_a
        )
        self.buyer_b_user = User.objects.create_user(
            username="buyer_b", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer_b
        )
        self.company_rep = User.objects.create_user(
            username="rep", password="pass12345", role=Roles.COMPANY_REP
        )

    def auth_as(self, user):
        self.client.force_authenticate(user=user)

    # ── Cross-tenant read isolation ─────────────────────────────────────

    def test_buyer_cannot_retrieve_another_buyers_sister_profile(self):
        self.auth_as(self.buyer_a_user)
        url = reverse("sister-profile-detail", args=[self.sister_b.id])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_buyer_list_only_shows_own_sister_profiles(self):
        self.auth_as(self.buyer_a_user)
        url = reverse("sister-profile-list")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        returned_ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(returned_ids, {str(self.sister_a.id)})

    def test_buyer_cannot_retrieve_another_buyers_profile(self):
        self.auth_as(self.buyer_a_user)
        url = reverse("buyer-profile-detail", args=[self.buyer_b.id])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_buyer_can_read_own_sister_profile(self):
        self.auth_as(self.buyer_a_user)
        url = reverse("sister-profile-detail", args=[self.sister_a.id])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], str(self.sister_a.id))

    def test_buyer_without_buyer_profile_sees_nothing(self):
        # Defensive: a misconfigured buyer-role user (no buyer_profile set)
        # must fail closed, not fall through to an unfiltered queryset.
        orphan = User.objects.create_user(username="orphan_buyer", password="pass12345", role=Roles.BUYER)
        self.auth_as(orphan)
        resp = self.client.get(reverse("sister-profile-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["results"], [])

    # ── Write blocking for buyer role ───────────────────────────────────

    def test_buyer_cannot_create_sister_profile(self):
        self.auth_as(self.buyer_a_user)
        resp = self.client.post(
            reverse("sister-profile-list"),
            {
                "buyerProfile": str(self.buyer_a.id),
                "agreementType": AgreementType.TYPE_1,
                "agreementRateConfig": {"percentage_rate": 5},
            },
            format="json",
        )
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED))

    def test_buyer_cannot_update_own_sister_profile(self):
        self.auth_as(self.buyer_a_user)
        resp = self.client.patch(
            reverse("sister-profile-detail", args=[self.sister_a.id]), {"poReference": "HACKED"}, format="json"
        )
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED))
        self.sister_a.refresh_from_db()
        self.assertEqual(self.sister_a.poReference, "PO-A-001")

    def test_buyer_cannot_delete_sister_profile(self):
        self.auth_as(self.buyer_a_user)
        resp = self.client.delete(reverse("sister-profile-detail", args=[self.sister_a.id]))
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED))
        self.assertTrue(SisterProfile.objects.filter(id=self.sister_a.id).exists())

    def test_buyer_cannot_create_buyer_profile(self):
        self.auth_as(self.buyer_a_user)
        resp = self.client.post(reverse("buyer-profile-list"), {"name": "Sneaky Co"}, format="json")
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED))

    def test_buyer_cannot_create_users(self):
        self.auth_as(self.buyer_a_user)
        resp = self.client.post(
            reverse("user-list"),
            {"username": "new_admin", "password": "pass12345", "role": Roles.ADMIN},
            format="json",
        )
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED))

    # ── Sanity: staff/admin retain normal access ────────────────────────

    def test_admin_can_read_and_write_any_sister_profile(self):
        self.auth_as(self.admin)
        resp = self.client.get(reverse("sister-profile-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 2)

        resp = self.client.patch(
            reverse("sister-profile-detail", args=[self.sister_b.id]), {"poReference": "PO-B-001-REV"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_company_rep_can_read_but_not_write_sister_profiles(self):
        self.auth_as(self.company_rep)
        resp = self.client.get(reverse("sister-profile-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 2)

        resp = self.client.post(
            reverse("sister-profile-list"),
            {
                "buyerProfile": str(self.buyer_a.id),
                "agreementType": AgreementType.TYPE_1,
                "agreementRateConfig": {"percentage_rate": 5},
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_request_is_rejected(self):
        resp = self.client.get(reverse("sister-profile-list"))
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    # ── Agreement rate config validation ────────────────────────────────

    def test_sister_profile_requires_matching_rate_key(self):
        self.auth_as(self.admin)
        resp = self.client.post(
            reverse("sister-profile-list"),
            {
                "buyerProfile": str(self.buyer_a.id),
                "agreementType": AgreementType.TYPE_2,
                "agreementRateConfig": {"percentage_rate": 8},  # wrong key for TYPE_2
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("agreementRateConfig", resp.data)


class JWTAuthTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="qc_person", password="pass12345", role=Roles.QC, name="Karim Hossain"
        )

    def test_token_obtain_includes_role_claim(self):
        resp = self.client.post(
            reverse("token_obtain_pair"), {"username": "qc_person", "password": "pass12345"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["role"], Roles.QC)
        self.assertIsNone(resp.data["buyer_profile_id"])
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)

    def test_me_endpoint_requires_auth(self):
        resp = self.client.get(reverse("me"))
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_endpoint_returns_profile(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get(reverse("me"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["role"], Roles.QC)
        self.assertEqual(resp.data["name"], "Karim Hossain")


class BuyerPortalDashboardTests(APITestCase):
    """FR-79: overview across all of a buyer's own Sister Profiles."""

    def setUp(self):
        from apps.expenses.models import SourceType
        from apps.expenses.services import record_expense
        from apps.invoicing import services as invoicing_services
        from apps.sourcing.models import Product

        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.employee = User.objects.create_user(username="emp", password="pass12345", role=Roles.EMPLOYEE)
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)

        self.buyer = BuyerProfile.objects.create(name="Zara Textiles", branding="ZARA")
        self.buyer_user = User.objects.create_user(
            username="buyer_portal", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer
        )
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        Product.objects.create(sisterProfile=self.sister, name="T-Shirt", createdBy=self.rep)
        Product.objects.create(sisterProfile=self.sister, name="Shorts", createdBy=self.rep)

        record_expense(sister_profile=self.sister, source_type=SourceType.SOURCING_ADVANCE, amount=500, created_by=self.admin)
        record_expense(sister_profile=self.sister, source_type=SourceType.QC_CARRYING, amount=100, created_by=self.admin)

        invoicing_services.create_invoice(
            sister_profile=self.sister, created_by=self.employee, line_items=[{"description": "Goods", "amount": "1000"}],
        )

        # Another buyer entirely -- must never leak into the first buyer's dashboard.
        other_buyer = BuyerProfile.objects.create(name="Other Buyer")
        SisterProfile.objects.create(
            buyerProfile=other_buyer, poReference="PO-OTHER",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )

    def test_dashboard_shape_and_scoping(self):
        self.client.force_authenticate(user=self.buyer_user)
        resp = self.client.get(reverse("buyer-portal-dashboard"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["buyerProfile"]["name"], "Zara Textiles")
        self.assertEqual(len(resp.data["sisterProfiles"]), 1)  # not the other buyer's

        row = resp.data["sisterProfiles"][0]
        self.assertEqual(row["poReference"], "PO-001")
        self.assertEqual(row["productCount"], 2)
        self.assertEqual(row["settlement"]["totalAdvance"], Decimal("500.00"))
        self.assertEqual(row["settlement"]["totalExpense"], Decimal("100.00"))
        self.assertEqual(row["invoices"]["total"], 1)
        self.assertEqual(row["invoices"]["pending"], 1)

    def test_non_buyer_role_gets_403(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(reverse("buyer-portal-dashboard"))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class ReferenceCodeTests(APITestCase):
    """Reference_Numbers_Identifier_System.md."""

    def setUp(self):
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)

    def test_buyer_reference_code_auto_generates_sequentially(self):
        b1 = BuyerProfile.objects.create(name="Buyer One")
        b2 = BuyerProfile.objects.create(name="Buyer Two")
        self.assertRegex(b1.referenceCode, r"^BUY-\d{4}$")
        self.assertRegex(b2.referenceCode, r"^BUY-\d{4}$")
        self.assertNotEqual(b1.referenceCode, b2.referenceCode)
        # Strictly increasing — proves it's a real sequence, not random/time-based.
        self.assertLess(int(b1.referenceCode.split("-")[1]), int(b2.referenceCode.split("-")[1]))

    def test_sister_profile_reference_code_auto_generates_independently_of_po_reference(self):
        buyer = BuyerProfile.objects.create(name="Buyer")
        sister = SisterProfile.objects.create(
            buyerProfile=buyer, poReference="002F25BV",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.assertRegex(sister.referenceCode, r"^SIS-\d{4}$")
        # These must never be confused/merged (BR: "never auto-filled" from one to the other).
        self.assertNotEqual(sister.referenceCode, sister.poReference)
        self.assertEqual(sister.poReference, "002F25BV")

    def test_manual_override_accepted_and_used_verbatim(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(reverse("buyer-profile-list"), {"name": "Custom Buyer", "referenceCode": "BUY-CUSTOM-1"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["referenceCode"], "BUY-CUSTOM-1")

    def test_duplicate_manual_reference_code_is_rejected_not_silently_modified(self):
        BuyerProfile.objects.create(name="First", referenceCode="BUY-DUPE")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(reverse("buyer-profile-list"), {"name": "Second", "referenceCode": "BUY-DUPE"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BuyerProfile.objects.filter(referenceCode="BUY-DUPE").count(), 1)

    def test_duplicate_sister_profile_reference_code_is_rejected(self):
        buyer = BuyerProfile.objects.create(name="Buyer")
        SisterProfile.objects.create(
            buyerProfile=buyer, referenceCode="SIS-DUPE",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            reverse("sister-profile-list"),
            {"buyerProfile": str(buyer.id), "referenceCode": "SIS-DUPE", "agreementType": AgreementType.TYPE_1, "agreementRateConfig": {"percentage_rate": 5}},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(SisterProfile.objects.filter(referenceCode="SIS-DUPE").count(), 1)

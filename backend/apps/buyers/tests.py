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
        )
        self.sister_b = SisterProfile.objects.create(
            buyerProfile=self.buyer_b,
            poReference="PO-B-001",
            agreementType=AgreementType.TYPE_2,
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
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_request_is_rejected(self):
        resp = self.client.get(reverse("sister-profile-list"))
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    # ── Agreement rate config validation ────────────────────────────────

    def test_sister_profile_rejects_negative_exchange_rate(self):
        self.auth_as(self.admin)
        resp = self.client.post(
            reverse("sister-profile-list"),
            {
                "buyerProfile": str(self.buyer_a.id),
                "agreementType": AgreementType.TYPE_2,
                "exchangeRate": -5,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exchangeRate", resp.data)

    def test_buyer_currency_must_match_the_buyers_pooled_wallet(self):
        """The wallet is one pooled account per buyer holding one currency,
        and its balance sums every profile's converted deductions — so a
        profile in a different buyer currency would corrupt that total."""
        from apps.wallet.services import create_wallet

        create_wallet(self.buyer_a)  # USD by default
        self.auth_as(self.admin)
        resp = self.client.post(
            reverse("sister-profile-list"),
            {
                "buyerProfile": str(self.buyer_a.id),
                "agreementType": AgreementType.TYPE_1,
                "supplierCurrency": "BDT",
                "buyerCurrency": "EUR",
                "exchangeRate": "131",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("buyerCurrency", resp.data)

    def test_cost_breakdown_reports_groups_in_both_currencies(self):
        from apps.expenses.models import SourceType
        from apps.expenses.services import record_expense

        sister = SisterProfile.objects.create(
            buyerProfile=self.buyer_a, poReference="PO-CB", agreementType=AgreementType.TYPE_1,
            supplierCurrency="BDT", buyerCurrency="USD", exchangeRate=Decimal("120"),
        )
        record_expense(sister_profile=sister, source_type=SourceType.SOURCING_ADVANCE, amount=24000, created_by=self.admin)
        record_expense(sister_profile=sister, source_type=SourceType.WAREHOUSE_LOADER, amount=12000, created_by=self.admin)

        self.auth_as(self.admin)
        resp = self.client.get(reverse("sister-profile-cost-breakdown", args=[sister.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["rateLabel"], "1 USD = 120 BDT")
        self.assertEqual(resp.data["groups"]["sourcing"]["amount"], Decimal("24000"))
        self.assertEqual(resp.data["groups"]["sourcing"]["amountBuyer"], Decimal("200.00"))
        self.assertEqual(resp.data["groups"]["warehouse"]["amount"], Decimal("12000"))
        self.assertEqual(resp.data["groups"]["warehouse"]["amountBuyer"], Decimal("100.00"))
        self.assertEqual(resp.data["total"]["amount"], Decimal("36000"))
        self.assertEqual(resp.data["total"]["amountBuyer"], Decimal("300.00"))

    def test_cost_breakdown_is_tenant_scoped(self):
        sister = SisterProfile.objects.create(
            buyerProfile=self.buyer_a, poReference="PO-CB2", agreementType=AgreementType.TYPE_1,
        )
        self.auth_as(self.buyer_b_user)
        resp = self.client.get(reverse("sister-profile-cost-breakdown", args=[sister.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_sister_profile_currency_config_round_trip(self):
        self.auth_as(self.admin)
        resp = self.client.post(
            reverse("sister-profile-list"),
            {
                "buyerProfile": str(self.buyer_a.id),
                "agreementType": AgreementType.TYPE_1,
                "supplierCurrency": "BDT",
                "buyerCurrency": "USD",
                "exchangeRate": "120.5",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["supplierCurrency"], "BDT")
        self.assertEqual(resp.data["buyerCurrency"], "USD")
        self.assertEqual(Decimal(resp.data["exchangeRate"]), Decimal("120.5"))


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
            agreementType=AgreementType.TYPE_1,
        )
        Product.objects.create(sisterProfile=self.sister, name="T-Shirt", createdBy=self.rep)
        Product.objects.create(sisterProfile=self.sister, name="Shorts", createdBy=self.rep)

        record_expense(sister_profile=self.sister, source_type=SourceType.SOURCING_ADVANCE, amount=500, created_by=self.admin)
        record_expense(sister_profile=self.sister, source_type=SourceType.QC_CARRYING, amount=100, created_by=self.admin)

        invoicing_services.create_invoice(
            sister_profile=self.sister, created_by=self.employee,
            line_items=[{"description": "Goods", "amount": "1000"}], commission_rate=8,
        )

        # Another buyer entirely -- must never leak into the first buyer's dashboard.
        other_buyer = BuyerProfile.objects.create(name="Other Buyer")
        SisterProfile.objects.create(
            buyerProfile=other_buyer, poReference="PO-OTHER",
            agreementType=AgreementType.TYPE_1,
        )

    def test_dashboard_shape_and_scoping(self):
        # PortalDashboardView.get() (apps/buyers/portal_views.py) returns
        # buyerProfile/kpis/activeSourcingCosts/recentActivity — the old
        # bare sisterProfiles-list shape this test asserted was replaced by
        # the KPI-tile dashboard (see that view's docstring) without the
        # test being updated to match.
        self.client.force_authenticate(user=self.buyer_user)
        resp = self.client.get(reverse("portal-dashboard"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["buyerProfile"]["name"], "Zara Textiles")

        kpis = resp.data["kpis"]
        # Scoping: only this buyer's one Sister Profile counts, never the
        # other buyer's — this is the check the test exists for (FR-79).
        self.assertEqual(kpis["totalOrders"], 1)
        self.assertEqual(kpis["ordersInProgress"], 1)  # default status is "active"
        self.assertEqual(kpis["ordersCompleted"], 0)
        # The invoice from setUp is still pending_approval (never issued),
        # so it doesn't count toward outstanding balance yet.
        self.assertEqual(kpis["invoicesOutstanding"], [])

        self.assertEqual(resp.data["activeSourcingCosts"], [])
        self.assertIsInstance(resp.data["recentActivity"], list)

    def test_outstanding_is_reported_in_the_buyers_currency(self):
        from apps.invoicing import services as invoicing_services
        from apps.invoicing.models import Invoice, InvoiceStatus

        self.sister.exchangeRate = Decimal("120")  # 1 USD = 120 BDT
        self.sister.save()
        Invoice.objects.all().delete()  # the unconverted invoice from setUp
        invoicing_services.create_invoice(
            sister_profile=self.sister, created_by=self.employee,
            line_items=[{"description": "Goods", "amount": "12000"}], commission_rate=8,
        )
        Invoice.objects.update(status=InvoiceStatus.ISSUED)

        self.client.force_authenticate(user=self.buyer_user)
        resp = self.client.get(reverse("portal-dashboard"))
        rows = resp.data["kpis"]["invoicesOutstanding"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["currency"], "USD")
        self.assertEqual(Decimal(str(rows[0]["amount"])), Decimal("108.00"))  # (12,000 + 8%) BDT / 120

    def test_non_buyer_role_gets_403(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(reverse("portal-dashboard"))
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
            agreementType=AgreementType.TYPE_1,
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
            agreementType=AgreementType.TYPE_1,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            reverse("sister-profile-list"),
            {"buyerProfile": str(buyer.id), "referenceCode": "SIS-DUPE", "agreementType": AgreementType.TYPE_1},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(SisterProfile.objects.filter(referenceCode="SIS-DUPE").count(), 1)

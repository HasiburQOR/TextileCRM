from decimal import Decimal

from django.core.exceptions import ValidationError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Roles, User
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile
from apps.invoicing import services
from apps.invoicing.models import CommissionType, ExchangeRate, Invoice, InvoiceStatus


class InvoiceServiceTests(APITestCase):
    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.employee = User.objects.create_user(username="emp", password="pass12345", role=Roles.EMPLOYEE)
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)

    def _line_items(self, amount="1000"):
        return [{"description": "Kids T-Shirts", "ctn": 20, "qtyPerCtn": 50, "unitPrice": "1.00", "amount": amount}]

    # ── Commission formulas (BR-43/FR-50) ───────────────────────────────

    def test_no_commission_by_default(self):
        invoice = services.create_invoice(sister_profile=self.sister, created_by=self.employee, line_items=self._line_items())
        self.assertEqual(invoice.totalValue, Decimal("1000.00"))
        self.assertEqual(invoice.commission_amount(), 0)
        self.assertEqual(invoice.outstandingBalance, Decimal("1000.00"))

    def test_percentage_commission(self):
        invoice = services.create_invoice(
            sister_profile=self.sister, created_by=self.employee, line_items=self._line_items(),
            commission_type=CommissionType.PERCENTAGE, commission_value=5,
        )
        self.assertEqual(invoice.commission_amount(), Decimal("50.00"))
        self.assertEqual(invoice.outstandingBalance, Decimal("1050.00"))

    def test_flat_commission(self):
        invoice = services.create_invoice(
            sister_profile=self.sister, created_by=self.employee, line_items=self._line_items(),
            commission_type=CommissionType.FLAT, commission_value=75,
        )
        self.assertEqual(invoice.commission_amount(), Decimal("75.00"))
        self.assertEqual(invoice.outstandingBalance, Decimal("1075.00"))

    def test_cannot_create_invoice_with_no_line_items(self):
        with self.assertRaises(ValidationError):
            services.create_invoice(sister_profile=self.sister, created_by=self.employee, line_items=[])

    # ── Exchange rate locking (DRF doc §4 + §5 item 6) ──────────────────

    def test_exchange_rate_value_is_locked_at_creation_and_survives_republish(self):
        rate = ExchangeRate.objects.create(
            sourceCurrency="USD", targetCurrency="BDT", rate=Decimal("109.500000"),
            effectiveDate="2026-08-01", publishedBy=self.admin,
        )
        invoice = services.create_invoice(
            sister_profile=self.sister, created_by=self.employee, line_items=self._line_items("1000"), exchange_rate=rate,
        )
        self.assertEqual(invoice.exchangeRateValueLocked, Decimal("109.500000"))
        self.assertEqual(invoice.convertedTotal, Decimal("109500.00"))  # 1000 * 109.5

        # Admin publishes a brand new rate for the same currency pair.
        ExchangeRate.objects.create(
            sourceCurrency="USD", targetCurrency="BDT", rate=Decimal("115.000000"),
            effectiveDate="2026-09-01", publishedBy=self.admin,
        )
        # Even editing the ORIGINAL referenced row must not move the invoice.
        rate.rate = Decimal("999.000000")
        rate.save()

        invoice.refresh_from_db()
        self.assertEqual(invoice.exchangeRateValueLocked, Decimal("109.500000"))
        self.assertEqual(invoice.convertedTotal, Decimal("109500.00"))

    # ── Status transitions (BR-39/46 / FR-47-49/53) ─────────────────────

    def test_new_invoice_is_pending_approval(self):
        invoice = services.create_invoice(sister_profile=self.sister, created_by=self.employee, line_items=self._line_items())
        self.assertEqual(invoice.status, InvoiceStatus.PENDING_APPROVAL)

    def test_cannot_approve_twice(self):
        invoice = services.create_invoice(sister_profile=self.sister, created_by=self.employee, line_items=self._line_items())
        services.approve_invoice(invoice, self.admin)
        with self.assertRaises(ValidationError):
            services.approve_invoice(invoice, self.admin)

    def test_reject_requires_reason(self):
        invoice = services.create_invoice(sister_profile=self.sister, created_by=self.employee, line_items=self._line_items())
        with self.assertRaises(ValidationError):
            services.reject_invoice(invoice, self.admin, "")

    def test_cannot_reject_an_issued_invoice(self):
        invoice = services.create_invoice(sister_profile=self.sister, created_by=self.employee, line_items=self._line_items())
        services.approve_invoice(invoice, self.admin)
        with self.assertRaises(ValidationError):
            services.reject_invoice(invoice, self.admin, "too late")

    def test_cannot_void_a_pending_invoice(self):
        invoice = services.create_invoice(sister_profile=self.sister, created_by=self.employee, line_items=self._line_items())
        with self.assertRaises(ValidationError):
            services.void_invoice(invoice, "changed my mind", self.admin)

    def test_void_requires_reason_and_zeroes_outstanding(self):
        invoice = services.create_invoice(sister_profile=self.sister, created_by=self.employee, line_items=self._line_items())
        services.approve_invoice(invoice, self.admin)
        services.void_invoice(invoice, "Duplicate invoice", self.admin)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, InvoiceStatus.VOID)
        self.assertEqual(invoice.outstandingBalance, Decimal("0"))

    def test_cannot_pay_a_pending_invoice(self):
        invoice = services.create_invoice(sister_profile=self.sister, created_by=self.employee, line_items=self._line_items())
        with self.assertRaises(ValidationError):
            services.record_payment(invoice, amount=100, currency="USD", payment_date="2026-08-10", bank_reference="", recorded_by=self.admin)

    # ── Outstanding balance recompute (BR-44 / FR-51-52) ────────────────

    def test_outstanding_balance_recomputes_on_partial_payments(self):
        invoice = services.create_invoice(sister_profile=self.sister, created_by=self.employee, line_items=self._line_items("1000"))
        services.approve_invoice(invoice, self.admin)
        services.record_payment(invoice, amount=400, currency="USD", payment_date="2026-08-10", bank_reference="TXN1", recorded_by=self.admin)
        invoice.refresh_from_db()
        self.assertEqual(invoice.outstandingBalance, Decimal("600.00"))

        services.record_payment(invoice, amount=600, currency="USD", payment_date="2026-08-11", bank_reference="TXN2", recorded_by=self.admin)
        invoice.refresh_from_db()
        self.assertEqual(invoice.outstandingBalance, Decimal("0.00"))

    def test_outstanding_balance_never_goes_negative(self):
        invoice = services.create_invoice(sister_profile=self.sister, created_by=self.employee, line_items=self._line_items("1000"))
        services.approve_invoice(invoice, self.admin)
        services.record_payment(invoice, amount=1500, currency="USD", payment_date="2026-08-10", bank_reference="", recorded_by=self.admin)
        invoice.refresh_from_db()
        self.assertEqual(invoice.outstandingBalance, Decimal("0.00"))

    def test_cannot_record_negative_payment(self):
        invoice = services.create_invoice(sister_profile=self.sister, created_by=self.employee, line_items=self._line_items())
        services.approve_invoice(invoice, self.admin)
        with self.assertRaises(ValidationError):
            services.record_payment(invoice, amount=-50, currency="USD", payment_date="2026-08-10", bank_reference="", recorded_by=self.admin)


class InvoiceAPITenantTests(APITestCase):
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
        self.employee = User.objects.create_user(username="emp", password="pass12345", role=Roles.EMPLOYEE)
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.buyer_a_user = User.objects.create_user(
            username="buyer_a", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer_a
        )
        line_items = [{"description": "Goods", "amount": "500"}]
        self.invoice_a = services.create_invoice(sister_profile=self.sister_a, created_by=self.employee, line_items=line_items)
        self.invoice_b = services.create_invoice(sister_profile=self.sister_b, created_by=self.employee, line_items=line_items)

    def test_buyer_cannot_see_another_buyers_invoice(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("invoice-detail", args=[self.invoice_b.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_employee_cannot_approve_own_invoice(self):
        self.client.force_authenticate(user=self.employee)
        resp = self.client.post(reverse("invoice-approve", args=[self.invoice_a.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_buyer_cannot_void_invoice(self):
        services.approve_invoice(self.invoice_a, self.admin)
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.post(reverse("invoice-void", args=[self.invoice_a.id]), {"reason": "x"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_employee_cannot_publish_exchange_rate(self):
        self.client.force_authenticate(user=self.employee)
        resp = self.client.post(
            reverse("exchange-rate-list"),
            {"sourceCurrency": "USD", "targetCurrency": "BDT", "rate": "109.5", "effectiveDate": "2026-08-01"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_payment_via_api_updates_outstanding_balance(self):
        """Regression test: the ViewSet's queryset uses
        .prefetch_related("payments") for GET efficiency, which caches that
        relation on the instance `get_object()` returns. Recording a payment
        through the actual `payments` action (not the service layer
        directly, which is what apps.invoicing.tests.InvoiceServiceTests
        exercises) must not read that stale cache — this test would have
        caught a real bug found during live verification where
        outstandingBalance silently failed to update via the API despite
        updating fine when the service was called directly on a fresh
        instance."""
        services.approve_invoice(self.invoice_a, self.admin)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            reverse("invoice-payments", args=[self.invoice_a.id]),
            {"amount": "200", "currency": "USD", "paymentDate": "2026-08-12", "bankReference": "TXN1"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["outstandingBalance"], "300.00")
        # The same stale-prefetch issue affects the serialized `payments`
        # list independently of `outstandingBalance` — assert both.
        self.assertEqual(len(resp.data["payments"]), 1)

        self.invoice_a.refresh_from_db()
        self.assertEqual(self.invoice_a.outstandingBalance, Decimal("300.00"))

    def test_admin_can_publish_exchange_rate(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            reverse("exchange-rate-list"),
            {"sourceCurrency": "USD", "targetCurrency": "BDT", "rate": "109.5", "effectiveDate": "2026-08-01"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["publishedBy"], self.admin.id)

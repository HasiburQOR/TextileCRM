from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Roles, User
from apps.audit.models import AuditLogEntry
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile
from apps.expenses.models import SourceType
from apps.expenses.services import record_expense
from apps.invoicing import services as invoicing_services
from apps.sourcing import services as sourcing_services
from apps.sourcing.models import Product, ProductStatus


class AuditTrailTests(APITestCase):
    """BR-57 / FR-82: cost entries, approvals/rejections, exchange rate
    publication, and invoice actions all leave an audit trail."""

    def setUp(self):
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.employee = User.objects.create_user(username="emp", password="pass12345", role=Roles.EMPLOYEE)
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1,
        )

    def test_expense_write_creates_audit_entry(self):
        record_expense(sister_profile=self.sister, source_type=SourceType.QC_CARRYING, amount=100, created_by=self.admin)
        entry = AuditLogEntry.objects.get(entityType="Expense")
        self.assertEqual(entry.action, "CREATE_EXPENSE")
        self.assertEqual(entry.actor, self.admin)

    def test_product_approval_and_rejection_create_audit_entries(self):
        product = Product.objects.create(
            sisterProfile=self.sister, name="T-Shirt", createdBy=self.rep, status=ProductStatus.PENDING_ADMIN_APPROVAL
        )
        sourcing_services.approve_product(product, self.admin)
        entry = AuditLogEntry.objects.get(entityType="Product", action="APPROVE_PRODUCT")
        self.assertEqual(entry.beforeSnapshot["status"], "pending_admin_approval")
        self.assertEqual(entry.afterSnapshot["status"], "approved_for_qc")

        product2 = Product.objects.create(
            sisterProfile=self.sister, name="Socks", createdBy=self.rep, status=ProductStatus.PENDING_ADMIN_APPROVAL
        )
        sourcing_services.reject_product(product2, self.admin, "bad quality")
        entry2 = AuditLogEntry.objects.get(entityType="Product", action="REJECT_PRODUCT")
        self.assertEqual(entry2.afterSnapshot["reason"], "bad quality")

    def test_exchange_rate_publish_creates_audit_entry(self):
        invoicing_services.publish_exchange_rate(
            source_currency="USD", target_currency="BDT", rate="109.5", effective_date="2026-08-01", published_by=self.admin,
        )
        entry = AuditLogEntry.objects.get(entityType="ExchangeRate")
        self.assertEqual(entry.action, "PUBLISH_EXCHANGE_RATE")

    def test_invoice_lifecycle_creates_audit_entries(self):
        invoice = invoicing_services.create_invoice(
            sister_profile=self.sister, created_by=self.employee,
            line_items=[{"description": "Goods", "amount": "500"}], commission_rate=10,
        )
        self.assertTrue(AuditLogEntry.objects.filter(entityType="Invoice", action="CREATE_INVOICE", entityId=str(invoice.id)).exists())

        invoicing_services.approve_invoice(invoice, self.admin)
        self.assertTrue(AuditLogEntry.objects.filter(entityType="Invoice", action="APPROVE_INVOICE").exists())

        invoicing_services.void_invoice(invoice, "duplicate", self.admin)
        void_entry = AuditLogEntry.objects.get(entityType="Invoice", action="VOID_INVOICE")
        self.assertEqual(void_entry.actor, self.admin)

    def test_payment_recording_does_not_create_an_audit_entry(self):
        """Deliberate per FR-82's explicit list (create/approve/reject/void
        only) vs FR-84 (payment recorded is a notification, not an audit
        event)."""
        invoice = invoicing_services.create_invoice(
            sister_profile=self.sister, created_by=self.employee,
            line_items=[{"description": "Goods", "amount": "500"}], commission_rate=10,
        )
        invoicing_services.approve_invoice(invoice, self.admin)
        before_count = AuditLogEntry.objects.count()
        invoicing_services.record_payment(
            invoice, amount=100, currency="USD", payment_date="2026-08-10", bank_reference="", recorded_by=self.admin,
        )
        self.assertEqual(AuditLogEntry.objects.count(), before_count)


class AuditAPIPermissionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.buyer = BuyerProfile.objects.create(name="Buyer")
        self.buyer_user = User.objects.create_user(username="buyer", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer)
        sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-1", agreementType=AgreementType.TYPE_1
        )
        record_expense(sister_profile=sister, source_type=SourceType.QC_CARRYING, amount=100, created_by=self.admin)

    def test_only_admin_can_read_audit_log(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(reverse("audit-log-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 1)

    def test_company_rep_cannot_read_audit_log(self):
        self.client.force_authenticate(user=self.rep)
        resp = self.client.get(reverse("audit-log-list"))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_buyer_cannot_read_audit_log(self):
        self.client.force_authenticate(user=self.buyer_user)
        resp = self.client.get(reverse("audit-log-list"))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

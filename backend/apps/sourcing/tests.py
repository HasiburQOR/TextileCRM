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
    FieldGroup,
    Product,
    ProductStatus,
    ProductTemplate,
    SourcingCost,
    SourcingCostItem,
    TemplateField,
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
        cost = SourcingCost.objects.create(sisterProfile=self.sister)
        for i in range(count):
            SourcingCostItem.objects.create(
                sourcingCost=cost, product=self.product,
                locationName=f"Location {i}", quantity=100,
                customCostFields=[{"name": "Advance", "amount": 500}],
                date=timezone.now(),
            )
        return cost

    # ── Sourcing Cost closing ───────────────────────────────────────────

    def test_cannot_close_trip_with_no_items(self):
        cost = SourcingCost.objects.create(sisterProfile=self.sister)
        with self.assertRaises(ValidationError):
            services.close_sourcing_cost(cost)

    def test_close_trip_succeeds_with_items(self):
        cost = self._trip_with_locations()
        services.close_sourcing_cost(cost)
        cost.refresh_from_db()
        self.assertEqual(cost.status, TripStatus.CLOSED)
        self.assertIsNotNone(cost.fullPaymentConfirmedAt)

    def test_cannot_close_an_already_closed_trip(self):
        cost = self._trip_with_locations(count=1)
        services.close_sourcing_cost(cost)
        with self.assertRaises(ValidationError):
            services.close_sourcing_cost(cost)

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
        cost = self._trip_with_locations(count=1)
        services.close_sourcing_cost(cost)
        services.submit_for_approval(self.product)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, ProductStatus.PENDING_ADMIN_APPROVAL)

    def test_cannot_submit_twice(self):
        cost = self._trip_with_locations(count=1)
        services.close_sourcing_cost(cost)
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
        self.trip_a = SourcingCost.objects.create(sisterProfile=self.sister_a)
        self.trip_b = SourcingCost.objects.create(sisterProfile=self.sister_b)

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
        resp = self.client.get(reverse("sourcing-cost-detail", args=[self.trip_b.id]))
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
                    {"colorName": "Black", "patternNo": "MR12528", "orderQty": 500},
                    {"colorName": "Navy", "patternNo": "MR12529", "orderQty": 300},
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        product_id = resp.data["id"]
        self.assertEqual(resp.data["totalOrderQty"], 800)
        self.assertTrue(resp.data["styleNumber"].startswith("STY-"))

        # 2. create a sourcing cost with items (custom cost fields)
        resp = self.client.post(
            reverse("sourcing-cost-list"),
            {
                "sisterProfile": str(self.sister.id),
                "items": [
                    {
                        "product": product_id,
                        "locationName": "Gazipur Factory",
                        "quantity": 500,
                        "customCostFields": [{"name": "Transport", "amount": 2000}],
                        "date": timezone.now().isoformat(),
                    },
                    {
                        "product": product_id,
                        "locationName": "Narayanganj Mill",
                        "quantity": 300,
                        "customCostFields": [{"name": "Transport", "amount": 1500}],
                        "date": timezone.now().isoformat(),
                    },
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        cost_id = resp.data["id"]
        item_ids = [item["id"] for item in resp.data["items"]]

        # 3. attempting to submit for approval while cost is open fails
        resp = self.client.post(reverse("product-submit-for-approval", args=[product_id]))
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. close the cost (no report step needed — wallet already deducted)
        resp = self.client.post(reverse("sourcing-cost-close", args=[cost_id]))
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
    """FR-72: a cost item's custom cost fields are sourcing advance expenses
    and must land in the Central Expense Table."""

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.product = Product.objects.create(sisterProfile=self.sister, name="Kids T-Shirt", createdBy=self.rep)
        self.cost = SourcingCost.objects.create(sisterProfile=self.sister)
        self.item = SourcingCostItem.objects.create(
            sourcingCost=self.cost, product=self.product,
            locationName="Gazipur Factory", quantity=500,
            customCostFields=[{"name": "Transport", "amount": 2000}],
            date=timezone.now(),
        )

    def test_creating_item_with_custom_cost_writes_expense(self):
        self.assertEqual(Expense.objects.count(), 0)
        services.deduct_cost_item(self.item, self.rep)
        expenses = Expense.objects.filter(sisterProfile=self.sister, product=self.product)
        self.assertEqual(expenses.count(), 1)
        expense = expenses.first()
        self.assertEqual(expense.sourceType, SourceType.SOURCING_ADVANCE)
        self.assertEqual(expense.amount, Decimal("2000"))
        self.assertEqual(expense.createdBy, self.rep)

    def test_creating_item_with_zero_cost_writes_no_expense(self):
        zero_item = SourcingCostItem.objects.create(
            sourcingCost=self.cost, product=self.product,
            locationName="No Cost Location", quantity=100,
            customCostFields=[{"name": "Nothing", "amount": 0}],
            date=timezone.now(),
        )
        services.deduct_cost_item(zero_item, self.rep)
        self.assertEqual(Expense.objects.count(), 0)

    def test_editing_item_refunds_old_and_deducts_new_amount(self):
        from apps.wallet.models import BuyerWallet, WalletTransaction, WalletTransactionType

        services.deduct_cost_item(self.item, self.rep)
        wallet = BuyerWallet.objects.get(buyerProfile=self.buyer)
        balance_after_create = wallet.balance

        old_custom_costs = list(self.item.customCostFields)
        self.item.customCostFields = [{"name": "Transport", "amount": 1500}]
        self.item.save()
        services.adjust_cost_item(self.item, old_custom_costs, self.rep)

        wallet.refresh_from_db()
        # Old 2000 refunded, new 1500 deducted -> net +500 back to the buyer.
        self.assertEqual(wallet.balance, balance_after_create + Decimal("500"))
        expenses = Expense.objects.filter(fieldName=f"sourcing_cost_item:{self.item.id}")
        self.assertEqual(expenses.count(), 1)
        self.assertEqual(expenses.first().amount, Decimal("1500"))
        # Exactly one reversing refund row was written (the deduction row
        # itself is append-only and untouched).
        refunds = WalletTransaction.objects.filter(wallet=wallet, type=WalletTransactionType.REFUND)
        self.assertEqual(refunds.count(), 1)

    def test_deleting_item_refunds_the_wallet(self):
        from apps.wallet.models import BuyerWallet, WalletTransaction, WalletTransactionType

        services.deduct_cost_item(self.item, self.rep)
        wallet = BuyerWallet.objects.get(buyerProfile=self.buyer)
        balance_after_create = wallet.balance

        services.refund_cost_item(self.item, self.rep)

        wallet.refresh_from_db()
        self.assertEqual(wallet.balance, balance_after_create + Decimal("2000"))
        self.assertEqual(Expense.objects.filter(product=self.product).count(), 0)
        self.assertTrue(
            WalletTransaction.objects.filter(wallet=wallet, type=WalletTransactionType.REFUND).exists()
        )

    def test_creating_cost_with_items_via_api_deducts_wallet(self):
        from apps.wallet.models import BuyerWallet

        self.client.force_authenticate(user=self.rep)
        resp = self.client.post(
            reverse("sourcing-cost-list"),
            {
                "sisterProfile": str(self.sister.id),
                "items": [
                    {
                        "product": str(self.product.id),
                        "locationName": "Gazipur Factory",
                        "quantity": 500,
                        "customCostFields": [{"name": "Transport", "amount": 2000}],
                        "date": timezone.now().isoformat(),
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        wallet = BuyerWallet.objects.get(buyerProfile=self.buyer)
        self.assertEqual(wallet.balance, Decimal("-2000"))
        self.assertEqual(Expense.objects.filter(product=self.product).count(), 1)

    def test_item_rejects_non_numeric_custom_cost_amount(self):
        self.client.force_authenticate(user=self.rep)
        resp = self.client.post(
            reverse("sourcing-cost-items-list", args=[self.cost.id]),
            {
                "product": str(self.product.id),
                "locationName": "Gazipur Factory",
                "quantity": 100,
                "customCostFields": [{"name": "Transport", "amount": "abc"}],
                "date": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("customCostFields", resp.data)


class CustomSizeBreakdownTests(APITestCase):
    """Custom_Size_Breakdown_Feature.md: size_breakdown is a per-color,
    free-form array — no shared/fixed size grid across colors."""

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Buyer")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-1",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)

    def test_pcs_per_carton_recomputes_from_array_regardless_of_labels(self):
        product = Product.objects.create(sisterProfile=self.sister, name="Trousers", createdBy=self.admin)
        variant = product.variants.create(
            colorName="Khaki",
            sizeBreakdown=[{"size_label": "30", "quantity": 2}, {"size_label": "32", "quantity": 4}, {"size_label": "34", "quantity": 3}],
        )
        services.compute_variant_derived(variant)
        self.assertEqual(variant.pcsPerCarton, 9)

    def test_two_colors_on_same_product_can_have_entirely_different_size_sets(self):
        """Acceptance checklist: one color S/M/L, another Free Size only,
        on the same Style No, with no shared-schema error."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            reverse("product-list"),
            {
                "sisterProfile": str(self.sister.id), "name": "Mixed Style", "brandName": "NA",
                "variants": [
                    {
                        "colorName": "Navy", "orderQty": 45,
                        "sizeBreakdown": [{"size_label": "S", "quantity": 15}, {"size_label": "M", "quantity": 15}, {"size_label": "L", "quantity": 15}],
                    },
                    {
                        "colorName": "Assorted", "orderQty": 20,
                        "sizeBreakdown": [{"size_label": "Free Size", "quantity": 20}],
                    },
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        variants = {v["colorName"]: v for v in resp.data["variants"]}
        self.assertEqual(variants["Navy"]["pcsPerCarton"], 45)
        self.assertEqual(variants["Assorted"]["pcsPerCarton"], 20)

    def test_mixed_apparel_and_numeric_sizing_both_work_through_same_model(self):
        """Shirt-style (S/M/L/XL) and pants-style (numeric waist) products
        both work with no hard-coded apparel-top assumption anywhere."""
        shirt = Product.objects.create(sisterProfile=self.sister, name="Shirt", createdBy=self.admin)
        shirt_variant = shirt.variants.create(
            colorName="White",
            sizeBreakdown=[{"size_label": "S", "quantity": 1}, {"size_label": "M", "quantity": 3}, {"size_label": "L", "quantity": 5}, {"size_label": "XL", "quantity": 4}],
        )
        services.compute_variant_derived(shirt_variant)
        self.assertEqual(shirt_variant.pcsPerCarton, 13)

        pants = Product.objects.create(sisterProfile=self.sister, name="Pants", createdBy=self.admin)
        pants_variant = pants.variants.create(
            colorName="Denim",
            sizeBreakdown=[{"size_label": "30", "quantity": 2}, {"size_label": "32", "quantity": 4}, {"size_label": "34", "quantity": 3}, {"size_label": "36", "quantity": 1}],
        )
        services.compute_variant_derived(pants_variant)
        self.assertEqual(pants_variant.pcsPerCarton, 10)

    def test_empty_size_breakdown_does_not_crash_and_yields_zero(self):
        product = Product.objects.create(sisterProfile=self.sister, name="Accessory", createdBy=self.admin)
        variant = product.variants.create(colorName="Black", sizeBreakdown=[])
        services.compute_variant_derived(variant)
        self.assertEqual(variant.pcsPerCarton, 0)

    def test_product_qr_payload_collects_size_labels_from_array(self):
        product = Product.objects.create(
            sisterProfile=self.sister, name="Shirt", createdBy=self.admin,
            goodsName="Shirt", finalPrice=Decimal("5.00"), fabricDetails="Cotton",
        )
        product.variants.create(
            colorName="White",
            sizeBreakdown=[{"size_label": "S", "quantity": 1}, {"size_label": "M", "quantity": 3}],
        )
        product = services.generate_product_qr(product, self.admin)
        self.assertEqual(product.productQrPayload["sizes"], ["M", "S"])


class ProductTemplateTests(APITestCase):
    """Product_Templates_Custom_Fields_Module.md."""

    def setUp(self):
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.buyer = BuyerProfile.objects.create(name="Buyer")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-1",
            agreementType=AgreementType.TYPE_1, agreementRateConfig={"percentage_rate": 8},
        )
        # sourcing.migrations.0008_seed_field_library already seeds these
        # exact rows (this app's data migrations run in the test DB too) —
        # reuse them rather than creating name/fieldKey duplicates.
        self.group = FieldGroup.objects.get(name="Bottom-Wear Sizing")
        self.waist = TemplateField.objects.get(fieldKey="waist_size")
        self.inseam = TemplateField.objects.get(fieldKey="inseam_length")
        self.sleeve = TemplateField.objects.get(fieldKey="sleeve_length")

    # ── Auto-select field groups ──────────────────────────────────────

    def test_selecting_one_field_in_a_group_auto_includes_the_rest_on_save(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            reverse("product-template-list"),
            {"name": "Pants", "fieldIds": [str(self.waist.id)]},  # only waist_size explicitly picked
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        field_keys = {f["fieldKey"] for f in resp.data["fields"]}
        self.assertEqual(field_keys, {"waist_size", "inseam_length"})  # inseam auto-added, same group

    def test_auto_select_cannot_be_bypassed_via_direct_api_call(self):
        """Same assertion as above, but proves it's enforced server-side in
        the save path itself (not a client-only nicety a raw API call could skip)."""
        template = ProductTemplate.objects.create(name="Pants", createdBy=self.admin)
        services.save_template_fields(template, [str(self.waist.id)])
        selected_keys = set(template.templateFields.values_list("field__fieldKey", flat=True))
        self.assertEqual(selected_keys, {"waist_size", "inseam_length"})

    # ── Core fields ──────────────────────────────────────────────────

    def test_core_fields_are_returned_for_every_template_and_cannot_be_removed_via_api(self):
        self.client.force_authenticate(user=self.admin)
        create_resp = self.client.post(reverse("product-template-list"), {"name": "Shirt", "fieldIds": []}, format="json")
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        core_keys = {f["fieldKey"] for f in create_resp.data["coreFields"]}
        self.assertIn("color", core_keys)
        self.assertIn("size_breakdown", core_keys)
        # There is no API surface that can remove them from a Product at all
        # — they're the fixed ProductVariant schema fields, not TemplateField
        # rows — verified by creating a Product with this "empty" template
        # and confirming its ProductVariant still accepts colorName/etc.
        product_resp = self.client.post(
            reverse("product-list"),
            {"sisterProfile": str(self.sister.id), "name": "Shirt", "template": str(ProductTemplate.objects.get(name="Shirt").id),
             "variants": [{"colorName": "Black", "orderQty": 10, "sizeBreakdown": []}]},
            format="json",
        )
        self.assertEqual(product_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(product_resp.data["variants"][0]["colorName"], "Black")

    # ── Field Library uniqueness ───────────────────────────────────────

    def test_duplicate_field_key_under_a_different_label_is_rejected(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            reverse("field-library-list"),
            {"fieldKey": "waist_size", "label": "Waist (different label)", "fieldType": "text"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Snapshot-on-create, not a live pointer ─────────────────────────

    def test_editing_template_field_set_does_not_alter_already_created_products(self):
        template = ProductTemplate.objects.create(name="Shirt", createdBy=self.admin)
        services.save_template_fields(template, [str(self.sleeve.id)])

        product = Product.objects.create(sisterProfile=self.sister, name="Shirt v1", template=template, createdBy=self.rep)
        product.resolvedTemplateFields = services.resolve_template_fields(template)
        product.save(update_fields=["resolvedTemplateFields"])
        self.assertEqual([f["fieldKey"] for f in product.resolvedTemplateFields], ["sleeve_length"])

        # Admin later adds Waist Size (and, via auto-group-select, Inseam) to the template.
        services.save_template_fields(template, [str(self.sleeve.id), str(self.waist.id)])
        self.assertEqual(template.templateFields.count(), 3)

        product.refresh_from_db()
        self.assertEqual([f["fieldKey"] for f in product.resolvedTemplateFields], ["sleeve_length"])  # unchanged

    def test_custom_field_option_still_available_when_template_selected(self):
        """Even with a template selected, a per-product one-off Custom
        Field is addable and does not touch the shared Template/Library."""
        template = ProductTemplate.objects.create(name="Shirt", createdBy=self.admin)
        services.save_template_fields(template, [str(self.sleeve.id)])
        product = Product.objects.create(sisterProfile=self.sister, name="Shirt", template=template, createdBy=self.rep)

        self.client.force_authenticate(user=self.rep)
        resp = self.client.post(
            reverse("product-custom-fields", args=[product.id]),
            {"label": "Zipper Type", "type": "text", "value": "YKK"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["customFields"], [{"label": "Zipper Type", "type": "text", "value": "YKK"}])
        # The shared library/template must be untouched.
        self.assertFalse(TemplateField.objects.filter(fieldKey="Zipper Type").exists())
        self.assertEqual(template.templateFields.count(), 1)

    def test_custom_field_requires_a_label(self):
        product = Product.objects.create(sisterProfile=self.sister, name="Shirt", createdBy=self.rep)
        self.client.force_authenticate(user=self.rep)
        resp = self.client.post(reverse("product-custom-fields", args=[product.id]), {"type": "text", "value": "x"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ── "Custom" (no template) intake still enforces core fields ────────

    def test_custom_no_template_intake_still_works_with_core_fields_only(self):
        self.client.force_authenticate(user=self.rep)
        resp = self.client.post(
            reverse("product-list"),
            {"sisterProfile": str(self.sister.id), "name": "One-off Item",
             "variants": [{"colorName": "Red", "orderQty": 5, "sizeBreakdown": []}]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(resp.data["template"])
        self.assertEqual(resp.data["resolvedTemplateFields"], [])

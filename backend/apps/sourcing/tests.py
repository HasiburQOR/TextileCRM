import shutil
import tempfile
from decimal import Decimal
from io import BytesIO

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
import pytest

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
from tests.factories import (
    ProductFactory,
    SisterProfileFactory,
    SourcingCostFactory,
    SourcingCostItemFactory,
    UserFactory,
)


class StateMachineTests(APITestCase):
    """DRF Migration Instructions §5 item 3: every state machine transition
    must reject invalid transitions."""

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1,
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

    # ── No approval step: products enter the workflow directly ─────────────────────────────────

    def test_new_product_starts_approved_for_qc(self):
        """Products skip Pending Admin Approval entirely: intake creates them
        directly Approved for QC, so the QC step can start at once (the
        approval gate was removed — single-workflow decision)."""
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, ProductStatus.APPROVED_FOR_QC)


class SourcingTenantIsolationTests(APITestCase):
    """Same rules as Phase 1, applied to the new sourcing endpoints."""

    def setUp(self):
        self.buyer_a = BuyerProfile.objects.create(name="Zara Textiles")
        self.buyer_b = BuyerProfile.objects.create(name="H&M Sourcing")
        self.sister_a = SisterProfile.objects.create(
            buyerProfile=self.buyer_a, poReference="PO-A",
            agreementType=AgreementType.TYPE_1,
        )
        self.sister_b = SisterProfile.objects.create(
            buyerProfile=self.buyer_b, poReference="PO-B",
            agreementType=AgreementType.TYPE_1,
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
            agreementType=AgreementType.TYPE_1,
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)

    def test_full_intake_flow(self):
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
        # No approval step: the product enters the workflow directly.
        self.assertEqual(resp.data["status"], ProductStatus.APPROVED_FOR_QC)

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

        # 3. close the cost (no report step needed — wallet already deducted)
        resp = self.client.post(reverse("sourcing-cost-close", args=[cost_id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], TripStatus.CLOSED)


class SourcingAdvanceExpenseTests(APITestCase):
    """FR-72: a cost item's custom cost fields are sourcing advance expenses
    and must land in the Central Expense Table."""

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1,
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
            agreementType=AgreementType.TYPE_1,
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

    # ── Unit price x quantity (buy price captured at intake) ────────────

    def test_total_amount_is_total_pcs_times_unit_price(self):
        """One price per color row, flat across all sizes in the row:
        45 pcs/carton x 10 cartons x 2.50 = 1,125.00."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            reverse("product-list"),
            {
                "sisterProfile": str(self.sister.id), "name": "Priced Tee", "brandName": "NA",
                "variants": [{
                    "colorName": "Navy", "orderQty": 450, "unitPrice": "2.50",
                    "sizeBreakdown": [
                        {"size_label": "S", "quantity": 15},
                        {"size_label": "M", "quantity": 15},
                        {"size_label": "L", "quantity": 15},
                    ],
                    "cartonNoFrom": 1, "cartonNoTo": 10,
                }],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        variant = resp.data["variants"][0]
        self.assertEqual(variant["pcsPerCarton"], 45)
        self.assertEqual(variant["noOfCartons"], 10)
        self.assertEqual(variant["totalPcs"], 450)
        self.assertEqual(Decimal(variant["totalAmount"]), Decimal("1125.00"))

    def test_missing_unit_price_yields_zero_amount(self):
        """Price is optional at intake — blank simply computes a zero Amount."""
        product = Product.objects.create(sisterProfile=self.sister, name="Unpriced", createdBy=self.admin)
        variant = product.variants.create(
            colorName="White",
            sizeBreakdown=[{"size_label": "M", "quantity": 10}],
            cartonNoFrom=1, cartonNoTo=3,
        )
        services.compute_variant_derived(variant)
        self.assertEqual(variant.totalPcs, 30)
        self.assertEqual(variant.totalAmount, Decimal("0"))

    def test_editing_variants_replaces_rows_and_recomputes_amount(self):
        """Edit is delete-and-recreate (ProductSerializer.update) — a new
        price on the edited row recomputes, and the old row is gone."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            reverse("product-list"),
            {
                "sisterProfile": str(self.sister.id), "name": "Edit Me", "brandName": "NA",
                "variants": [{
                    "colorName": "Red", "orderQty": 20, "unitPrice": "1.00",
                    "sizeBreakdown": [{"size_label": "Free Size", "quantity": 10}],
                    "cartonNoFrom": 1, "cartonNoTo": 2,
                }],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        resp = self.client.patch(
            reverse("product-detail", args=[resp.data["id"]]),
            {"variants": [{
                "colorName": "Red", "orderQty": 20, "unitPrice": "3.00",
                "sizeBreakdown": [{"size_label": "Free Size", "quantity": 10}],
                "cartonNoFrom": 1, "cartonNoTo": 2,
            }]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["variants"]), 1)
        variant = resp.data["variants"][0]
        self.assertEqual(variant["totalPcs"], 20)
        self.assertEqual(Decimal(variant["totalAmount"]), Decimal("60.00"))

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
            agreementType=AgreementType.TYPE_1,
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


class ProductMaterialFieldTests(APITestCase):
    """Product.material is captured at Sourcing Intake and is the upstream
    source of truth for the invoice line's Material column (see
    apps.invoicing.services.create_invoice). Verified here as a plain
    create / read / update roundtrip through the products API."""

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001",
            agreementType=AgreementType.TYPE_1,
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        # Edits (PATCH) are Admin-only per ProductViewSet.get_permissions -
        # "the edit form lets Admin correct any field".
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)

    def _create(self, **extra):
        self.client.force_authenticate(user=self.rep)
        payload = {
            "sisterProfile": str(self.sister.id),
            "name": "Heavy Cotton Crewneck",
            "variants": [{"colorName": "Ecru", "orderQty": 10, "sizeBreakdown": []}],
        }
        payload.update(extra)
        return self.client.post(reverse("product-list"), payload, format="json")

    def test_material_roundtrips_through_create_and_read(self):
        resp = self._create(material="100% Cotton")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["material"], "100% Cotton")

        resp = self.client.get(reverse("product-detail", args=[resp.data["id"]]))
        self.assertEqual(resp.data["material"], "100% Cotton")

    def test_material_is_optional_and_patchable(self):
        resp = self._create()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["material"], "")

        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch(
            reverse("product-detail", args=[resp.data["id"]]), {"material": "Cotton-Poly 60/40"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["material"], "Cotton-Poly 60/40")


@pytest.mark.integration
class ClosedCostItemWritesTests(APITestCase):
    """User rule for the merged single workflow: Close is a payment-
    confirmation marker, never an edit lock — items can be added, edited and
    deleted on a closed Sourcing Cost, and the wallet bookkeeping (deduct /
    adjust / refund) still runs on every one of those paths."""

    def setUp(self):
        from apps.wallet.services import create_wallet

        self.rep = UserFactory(role=Roles.COMPANY_REP)
        # Same currency / rate 1 so wallet deltas map 1:1 to the amounts
        # posted (conversion math is covered by the wallet module's tests).
        self.sister = SisterProfileFactory(supplierCurrency="USD", buyerCurrency="USD", exchangeRate=1)
        self.product = ProductFactory(sisterProfile=self.sister, createdBy=self.rep)
        self.cost = SourcingCostFactory(sisterProfile=self.sister)
        self.item = SourcingCostItemFactory(
            sourcingCost=self.cost, product=self.product,
            customCostFields=[{"name": "Transport", "amount": 2000}],
        )
        create_wallet(self.sister.buyerProfile)
        services.close_sourcing_cost(self.cost)
        self.client.force_authenticate(user=self.rep)

    def _wallet_balance(self):
        from apps.wallet.models import BuyerWallet

        wallet = BuyerWallet.objects.get(buyerProfile=self.sister.buyerProfile)
        wallet.refresh_from_db()
        return wallet.balance

    def test_item_can_be_added_to_a_closed_cost(self):
        resp = self.client.post(
            reverse("sourcing-cost-items-list", args=[self.cost.id]),
            {
                "product": str(self.product.id),
                "locationName": "Narayanganj Mill",
                "quantity": 300,
                "customCostFields": [{"name": "Transport", "amount": 1500}],
                "date": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.cost.refresh_from_db()
        self.assertEqual(self.cost.status, TripStatus.CLOSED)

    def test_adding_an_item_to_a_closed_cost_deducts_the_wallet(self):
        balance_before = self._wallet_balance()
        resp = self.client.post(
            reverse("sourcing-cost-items-list", args=[self.cost.id]),
            {
                "product": str(self.product.id),
                "locationName": "Narayanganj Mill",
                "quantity": 300,
                "customCostFields": [{"name": "Transport", "amount": 1500}],
                "date": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(self._wallet_balance(), balance_before - Decimal("1500"))

    def test_editing_an_item_on_a_closed_cost_adjusts_the_wallet(self):
        # The seeded item was written straight to the ORM, so replay the
        # deduction an open-cost item would have gone through first.
        services.deduct_cost_item(self.item, self.rep)
        balance_before = self._wallet_balance()

        resp = self.client.put(
            reverse("sourcing-cost-items-detail", args=[self.cost.id, self.item.id]),
            {
                "product": str(self.product.id),
                "locationName": self.item.locationName,
                "quantity": self.item.quantity,
                "customCostFields": [{"name": "Transport", "amount": 1000}],
                "date": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        # Old 2000 refunded, new 1000 deducted -> net +1000 back to the buyer.
        self.assertEqual(self._wallet_balance(), balance_before + Decimal("1000"))

    def test_deleting_an_item_on_a_closed_cost_refunds_the_wallet(self):
        services.deduct_cost_item(self.item, self.rep)
        balance_before = self._wallet_balance()

        resp = self.client.delete(reverse("sourcing-cost-items-detail", args=[self.cost.id, self.item.id]))
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self._wallet_balance(), balance_before + Decimal("2000"))


class MarkReadyForFinalQCTests(APITestCase):
    """Nothing used to move a product from In Warehouse to Ready for Final
    QC, so Final QC (and Completed) was unreachable."""

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001", agreementType=AgreementType.TYPE_1,
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.warehouse = User.objects.create_user(username="wh", password="pass12345", role=Roles.WAREHOUSE)
        self.product = Product.objects.create(
            sisterProfile=self.sister, name="Kids T-Shirt", createdBy=self.rep, status=ProductStatus.IN_WAREHOUSE,
        )

    def _record_warehouse_cost(self):
        from apps.warehouse.models import WarehouseCost

        WarehouseCost.objects.create(sisterProfile=self.sister, createdBy=self.warehouse)

    def test_requires_in_warehouse_status(self):
        self._record_warehouse_cost()
        self.product.status = ProductStatus.APPROVED_FOR_QC
        self.product.save()
        with self.assertRaises(ValidationError):
            services.mark_ready_for_final_qc(self.product, self.warehouse)

    def test_requires_a_warehouse_cost_on_the_order(self):
        with self.assertRaises(ValidationError):
            services.mark_ready_for_final_qc(self.product, self.warehouse)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, ProductStatus.IN_WAREHOUSE)

    def test_moves_to_ready_for_final_qc_and_is_audited(self):
        from apps.audit.models import AuditLogEntry

        self._record_warehouse_cost()
        services.mark_ready_for_final_qc(self.product, self.warehouse)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, ProductStatus.READY_FOR_FINAL_QC)
        self.assertTrue(
            AuditLogEntry.objects.filter(action="READY_FOR_FINAL_QC", entityId=str(self.product.id)).exists()
        )

    def test_warehouse_role_can_call_the_api_but_company_rep_cannot(self):
        self._record_warehouse_cost()
        url = reverse("product-mark-ready-for-final-qc", args=[self.product.id])

        self.client.force_authenticate(user=self.rep)
        self.assertEqual(self.client.post(url).status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.warehouse)
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data["status"], ProductStatus.READY_FOR_FINAL_QC)


class EditCannotWipeColourRowsTests(APITestCase):
    """An edit replaces all colour rows with the payload's — an empty list
    used to silently delete every row."""

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001", agreementType=AgreementType.TYPE_1,
        )
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            reverse("product-list"),
            {
                "sisterProfile": str(self.sister.id), "name": "Crewneck",
                "variants": [{"colorName": "Navy", "orderQty": 10, "sizeBreakdown": []}],
            },
            format="json",
        )
        self.product_id = resp.data["id"]

    def test_empty_variants_on_edit_is_rejected_and_rows_survive(self):
        resp = self.client.patch(reverse("product-detail", args=[self.product_id]), {"variants": []}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("variants", resp.data)
        self.assertEqual(Product.objects.get(pk=self.product_id).variants.count(), 1)

    def test_header_only_edit_still_leaves_rows_untouched(self):
        resp = self.client.patch(
            reverse("product-detail", args=[self.product_id]), {"name": "Crewneck v2"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["variants"]), 1)


_UPLOAD_TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix="sourcing-test-media-")


@override_settings(MEDIA_ROOT=_UPLOAD_TEST_MEDIA_ROOT)
class FactoryPackingListUploadTests(APITestCase):
    """The factory packing list is served from the app's own origin, so only
    real images/PDFs may be stored — not e.g. an .html page with a script."""

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_UPLOAD_TEST_MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.buyer = BuyerProfile.objects.create(name="Zara Textiles")
        self.sister = SisterProfile.objects.create(
            buyerProfile=self.buyer, poReference="PO-001", agreementType=AgreementType.TYPE_1,
        )
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.product = Product.objects.create(sisterProfile=self.sister, name="Crewneck", createdBy=self.rep)
        self.client.force_authenticate(user=self.rep)
        self.url = reverse("product-upload-factory-packing-list", args=[self.product.id])

    def _upload(self, name, content, content_type):
        return self.client.post(
            self.url, {"factoryPackingList": SimpleUploadedFile(name, content, content_type=content_type)},
            format="multipart",
        )

    def test_png_is_accepted(self):
        buf = BytesIO()
        Image.new("RGB", (4, 4)).save(buf, format="PNG")
        resp = self._upload("sheet.png", buf.getvalue(), "image/png")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertTrue(resp.data["factoryPackingList"])

    def test_pdf_is_accepted(self):
        resp = self._upload("sheet.pdf", b"%PDF-1.4\n%header is what is checked\n", "application/pdf")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

    def test_html_is_rejected(self):
        resp = self._upload("sheet.html", b"<script>alert(1)</script>", "text/html")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.product.refresh_from_db()
        self.assertFalse(self.product.factoryPackingList)

    def test_svg_is_rejected(self):
        resp = self._upload("sheet.svg", b"<svg onload=\"alert(1)\"/>", "image/svg+xml")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_script_disguised_as_pdf_or_png_is_rejected(self):
        self.assertEqual(self._upload("sheet.pdf", b"<script>x</script>", "application/pdf").status_code, 400)
        self.assertEqual(self._upload("sheet.png", b"<script>x</script>", "image/png").status_code, 400)

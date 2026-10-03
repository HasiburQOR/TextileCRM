import io
import json
import os

import qrcode
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import ProtectedError
from django.http import HttpResponse
from PIL import Image
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Roles
from apps.accounts.permissions import IsAdmin, IsQCOrAdmin, IsRole, IsSupplierStaff, IsWarehouseOrAdmin
from apps.core.tenancy import TenantScopedViewSet
from apps.sourcing import services
from apps.sourcing.models import FieldGroup, FieldType, Product, ProductTemplate, SourcingCost, SourcingCostItem, TemplateField
from apps.sourcing.serializers import (
    FieldGroupSerializer,
    ProductImageSerializer,
    ProductSelfSerializer,
    ProductSerializer,
    ProductTemplateSerializer,
    SourcingCostItemSerializer,
    SourcingCostSelfSerializer,
    SourcingCostSerializer,
    TemplateFieldSerializer,
)

WRITE_ACTIONS = ("update", "partial_update", "destroy")
FINAL_QC_ACTIONS = ("final_qc", "generate_product_qr", "generate_carton_qr")
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _raise_from(exc: DjangoValidationError):
    raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))


FACTORY_PACKING_LIST_MAX_BYTES = 10 * 1024 * 1024  # matches nginx's client_max_body_size 10m
_FACTORY_PACKING_LIST_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def _validate_factory_packing_list(file) -> None:
    """Only a photo or a PDF of the factory's sheet is accepted. Uploaded
    media is served from the app's own origin, so an arbitrary file (e.g. an
    .html or .svg with a script in it) would run with the logged-in user's
    session — check both the extension and the actual file contents, since
    either alone is trivially faked."""
    name = (file.name or "").lower()
    ext = os.path.splitext(name)[1]
    if file.size > FACTORY_PACKING_LIST_MAX_BYTES:
        raise DRFValidationError(
            {"factoryPackingList": f"File is {file.size / (1024 * 1024):.1f} MB — the limit is 10 MB."}
        )
    if ext == ".pdf":
        head = file.read(5)
        file.seek(0)
        if head != b"%PDF-":
            raise DRFValidationError({"factoryPackingList": "That file is not a valid PDF."})
        return
    if ext in _FACTORY_PACKING_LIST_IMAGE_EXTENSIONS:
        try:
            with Image.open(file) as img:
                img.verify()
        except Exception:
            raise DRFValidationError({"factoryPackingList": "That file is not a valid image."})
        finally:
            file.seek(0)
        return
    raise DRFValidationError({"factoryPackingList": "Upload a photo (JPG, PNG, GIF, WEBP) or a PDF."})


def _qr_png_response(payload: dict, filename: str) -> HttpResponse:
    img = qrcode.make(json.dumps(payload, separators=(",", ":"), sort_keys=True))
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    response = HttpResponse(buffer.getvalue(), content_type="image/png")
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response


class ProductViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """BR-05–10 / FR-01–07: sourcing intake on one entity — the admin approval
    step is gone; products enter the workflow directly at Approved for QC."""

    queryset = (
        Product.objects.select_related("sisterProfile__buyerProfile", "createdBy", "reviewedBy")
        .prefetch_related("variants", "images")
    )
    tenant_lookup = "sisterProfile__buyerProfile_id"
    allowed_roles = [Roles.COMPANY_REP]  # IsRole always additionally allows Admin
    filterset_fields = ["status", "sisterProfile"]

    def get_serializer_class(self):
        if self.request.user.role == Roles.BUYER:
            return ProductSelfSerializer
        return ProductSerializer

    def get_permissions(self):
        if self.action in ("create", "upload_image", "upload_factory_packing_list", "custom_fields"):
            return [IsRole()]
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        if self.action in FINAL_QC_ACTIONS:
            return [IsQCOrAdmin()]
        if self.action == "mark_ready_for_final_qc":
            return [IsWarehouseOrAdmin()]
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            instance.delete()
        except ProtectedError:
            raise DRFValidationError(
                "Cannot delete — this product already has QC reports "
                "referencing it. Delete those QC reports first if it was created in error."
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="mark-ready-for-final-qc")
    def mark_ready_for_final_qc(self, request, pk=None):
        product = self.get_object()
        try:
            services.mark_ready_for_final_qc(product, request.user)
        except DjangoValidationError as exc:
            _raise_from(exc)
        return Response(self.get_serializer(product).data)

    @action(detail=True, methods=["get"], url_path="packing-list-export")
    def packing_list_export(self, request, pk=None):
        """Downloadable copy of this Product's packing list — PDF (default)
        or ?filetype=xlsx. Since the Sourcing-Intake-as-Packing-List merge
        the document is generated straight from the intake record (header
        fields + variant rows); there is no separate packing-list entity.
        (Named `filetype`, not `format` — see the matching note on
        InvoiceViewSet.export.) Tenant-scoped via get_object(), same as
        every other action here."""
        from apps.packing import exports

        product = self.get_object()
        if request.query_params.get("filetype") == "xlsx":
            content = exports.render_packing_list_xlsx(product)
            response = HttpResponse(content, content_type=XLSX_CONTENT_TYPE)
            filename = exports.packing_list_filename(product, "xlsx")
        else:
            content = exports.render_packing_list_pdf(product)
            response = HttpResponse(content, content_type="application/pdf")
            filename = exports.packing_list_filename(product, "pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def upload_image(self, request, pk=None):
        """FR-01: labeled multi-image gallery — one image per call, since
        multi-file + per-file-label doesn't map cleanly onto a single JSON
        body; the client loops this for each photo in the gallery."""
        product = self.get_object()
        serializer = ProductImageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(product=product, uploadedBy=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def upload_factory_packing_list(self, request, pk=None):
        """FR-03: attach the factory-provided packing list as a photo/scan at
        intake time. A dedicated action (rather than PATCH) so the
        company_rep who created the product can attach it themselves —
        the general update/partial_update actions are admin-only."""
        product = self.get_object()
        file = request.FILES.get("factoryPackingList")
        if not file:
            raise DRFValidationError({"factoryPackingList": "This field is required."})
        _validate_factory_packing_list(file)
        product.factoryPackingList = file
        product.save(update_fields=["factoryPackingList", "updatedAt"])
        return Response(self.get_serializer(product).data)

    @action(detail=True, methods=["patch"], url_path="final-qc")
    def final_qc(self, request, pk=None):
        """Module: Final QC & QR. Distinct from the QC Costs report (Module
        8) — this saves the final-verified product data the dual QR codes
        encode, not a cost line."""
        product = self.get_object()
        data = request.data
        try:
            services.save_final_qc_data(
                product,
                goods_name=data.get("goodsName", product.goodsName),
                final_price=data.get("finalPrice", product.finalPrice),
                fabric_details=data.get("fabricDetails", product.fabricDetails),
            )
        except DjangoValidationError as exc:
            _raise_from(exc)
        return Response(self.get_serializer(product).data)

    @action(detail=True, methods=["post"], url_path="generate-product-qr")
    def generate_product_qr(self, request, pk=None):
        product = self.get_object()
        try:
            services.generate_product_qr(product, request.user)
        except DjangoValidationError as exc:
            _raise_from(exc)
        return Response(self.get_serializer(product).data)

    @action(detail=True, methods=["post"], url_path="generate-carton-qr")
    def generate_carton_qr(self, request, pk=None):
        product = self.get_object()
        try:
            services.generate_carton_qr(product, request.user)
        except DjangoValidationError as exc:
            _raise_from(exc)
        return Response(self.get_serializer(product).data)

    @action(detail=True, methods=["get"], url_path="product-qr-image")
    def product_qr_image(self, request, pk=None):
        product = self.get_object()
        if not product.productQrGenerated:
            raise DRFValidationError("Product QR has not been generated yet.")
        return _qr_png_response(product.productQrPayload, f"{product.styleNumber}-product-qr.png")

    @action(detail=True, methods=["get"], url_path="carton-qr-image")
    def carton_qr_image(self, request, pk=None):
        product = self.get_object()
        if not product.cartonQrGenerated:
            raise DRFValidationError("Carton QR has not been generated yet.")
        return _qr_png_response(product.cartonQrPayload, f"{product.styleNumber}-carton-qr.png")

    @action(detail=True, methods=["post"], url_path="custom-fields")
    def custom_fields(self, request, pk=None):
        """Product_Templates_Custom_Fields_Module.md: 'A per-product "Add
        Custom Field" option should also be available even when a template
        is selected — for the rare one-off attribute on an otherwise-normal
        shirt, without having to edit the shared Shirt template.' Appends
        one field; private to this product — never written back to the
        shared Field Library or any Template (BR: 'Custom Fields added at
        the product level are private to that product')."""
        product = self.get_object()
        data = request.data
        label = (data.get("label") or "").strip()
        field_type = data.get("type") or FieldType.TEXT
        if not label:
            raise DRFValidationError({"label": "Required."})
        if field_type not in FieldType.values:
            raise DRFValidationError({"type": f"Must be one of {FieldType.values}."})
        product.customFields = [*product.customFields, {"label": label, "type": field_type, "value": data.get("value", "")}]
        product.save(update_fields=["customFields", "updatedAt"])
        return Response(self.get_serializer(product).data, status=status.HTTP_201_CREATED)


class ProductTemplateViewSet(viewsets.ModelViewSet):
    """Product_Templates_Custom_Fields_Module.md — Template Manager.
    Not part of the Buyer Portal's read surface (an internal sourcing-config
    concept the buyer never needs to see)."""

    queryset = ProductTemplate.objects.prefetch_related("templateFields__field__fieldGroup")
    serializer_class = ProductTemplateSerializer

    def get_permissions(self):
        if self.action in ("create", *WRITE_ACTIONS):
            return [IsAdmin()]
        return [IsSupplierStaff()]


class FieldGroupViewSet(viewsets.ModelViewSet):
    """Product_Templates_Custom_Fields_Module.md 'Auto-Select Field
    Groups' — Admin can define new groups as new product categories get added."""

    queryset = FieldGroup.objects.all()
    serializer_class = FieldGroupSerializer

    def get_permissions(self):
        if self.action in ("create", *WRITE_ACTIONS):
            return [IsAdmin()]
        return [IsSupplierStaff()]


class TemplateFieldViewSet(viewsets.ModelViewSet):
    """The Field Library — GET/POST /api/v1/field-library/. A field defined
    once here can be toggled on by any ProductTemplate (see
    ProductTemplateSerializer's `fieldIds`)."""

    queryset = TemplateField.objects.select_related("fieldGroup")
    serializer_class = TemplateFieldSerializer

    def get_permissions(self):
        if self.action in ("create", *WRITE_ACTIONS):
            return [IsAdmin()]
        return [IsSupplierStaff()]


class SourcingCostViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """Sourcing Costs — multi-product per cost with custom cost fields
    that auto-deduct from the buyer's wallet."""

    queryset = SourcingCost.objects.select_related("sisterProfile__buyerProfile").prefetch_related("items__product")
    tenant_lookup = "sisterProfile__buyerProfile_id"
    allowed_roles = [Roles.COMPANY_REP]

    def get_serializer_class(self):
        if self.request.user.role == Roles.BUYER:
            return SourcingCostSelfSerializer
        return SourcingCostSerializer

    def get_permissions(self):
        # Costs carry no approval gate by design (user rule for the merged
        # workflow): the roles that can create costs can also edit, close,
        # reopen, or delete them — no admin-only write step, no closed-is-
        # frozen lock. The wallet deduction/refund bookkeeping still runs on
        # every one of those paths (services layer), untouched.
        if self.action in ("create", "close", "reopen", *WRITE_ACTIONS):
            return [IsRole()]
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        cost = self.get_object()
        # Refund all items' wallet deductions before deleting — allowed even
        # when the cost was closed (no closed-means-permanent rule anymore).
        for item in cost.items.all():
            services.refund_cost_item(item, request.user)
        cost.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        cost = self.get_object()
        try:
            services.close_sourcing_cost(cost)
        except DjangoValidationError as exc:
            _raise_from(exc)
        return Response(self.get_serializer(cost).data)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        """Reopen a closed cost so it becomes editable again (admin/company rep)."""
        cost = self.get_object()
        try:
            services.reopen_sourcing_cost(cost)
        except DjangoValidationError as exc:
            _raise_from(exc)
        return Response(self.get_serializer(cost).data)


class SourcingCostItemViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """Nested under a cost: /sourcing-costs/<cost_pk>/items/."""

    queryset = SourcingCostItem.objects.select_related("sourcingCost__sisterProfile__buyerProfile", "product")
    serializer_class = SourcingCostItemSerializer
    tenant_lookup = "sourcingCost__sisterProfile__buyerProfile_id"
    allowed_roles = [Roles.COMPANY_REP]

    def get_queryset(self):
        qs = super().get_queryset()
        cost_id = self.kwargs.get("cost_pk")
        if cost_id:
            qs = qs.filter(sourcingCost_id=cost_id)
        return qs

    def get_permissions(self):
        # Same no-approval-gate rule as SourcingCostViewSet: item writes are
        # not admin-only; wallet adjust/refund still runs on every path.
        if self.action in ("create", *WRITE_ACTIONS):
            return [IsRole()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        cost = SourcingCost.objects.get(pk=self.kwargs["cost_pk"])
        # Closed is a payment-confirmation marker, never an edit lock (user
        # rule for the merged workflow) — items may be added to a closed cost.
        item = serializer.save(sourcingCost=cost)
        # Auto-deduct wallet for each custom cost field
        services.deduct_cost_item(item, self.request.user)

    def perform_update(self, serializer):
        old_item = self.get_object()
        old_custom_costs = list(old_item.customCostFields) if old_item.customCostFields else []
        item = serializer.save()
        # Adjust wallet: refund old, deduct new
        services.adjust_cost_item(item, old_custom_costs, self.request.user)

    def destroy(self, request, *args, **kwargs):
        item = self.get_object()
        # Refund wallet before deleting
        services.refund_cost_item(item, request.user)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

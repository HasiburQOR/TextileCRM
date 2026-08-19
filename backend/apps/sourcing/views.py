import io
import json

import qrcode
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import ProtectedError
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Roles
from apps.accounts.permissions import IsAdmin, IsQCOrAdmin, IsRole, IsSupplierStaff
from apps.core.tenancy import TenantScopedViewSet
from apps.sourcing import services
from apps.sourcing.models import FieldGroup, FieldType, Product, ProductTemplate, SourcingCost, SourcingCostItem, TemplateField
from apps.sourcing.serializers import (
    FieldGroupSerializer,
    ProductImageSerializer,
    ProductSelfSerializer,
    ProductSerializer,
    ProductTemplateSerializer,
    RejectProductSerializer,
    SourcingCostItemSerializer,
    SourcingCostSelfSerializer,
    SourcingCostSerializer,
    TemplateFieldSerializer,
)

WRITE_ACTIONS = ("update", "partial_update", "destroy")
FINAL_QC_ACTIONS = ("final_qc", "generate_product_qr", "generate_carton_qr")


def _raise_from(exc: DjangoValidationError):
    raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))


def _qr_png_response(payload: dict, filename: str) -> HttpResponse:
    img = qrcode.make(json.dumps(payload, separators=(",", ":"), sort_keys=True))
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    response = HttpResponse(buffer.getvalue(), content_type="image/png")
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response


class ProductViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """BR-05–10 / FR-01–07: sourcing intake + admin approval, on one entity."""

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
        if self.action in ("create", "submit_for_approval", "upload_image", "upload_factory_packing_list", "custom_fields"):
            return [IsRole()]
        if self.action in WRITE_ACTIONS or self.action in ("approve", "reject"):
            return [IsAdmin()]
        if self.action in FINAL_QC_ACTIONS:
            return [IsQCOrAdmin()]
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            instance.delete()
        except ProtectedError:
            raise DRFValidationError(
                "Cannot delete — this product already has QC reports or packing cartons "
                "referencing it. Reject it instead if it was created in error."
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def submit_for_approval(self, request, pk=None):
        product = self.get_object()
        try:
            services.submit_for_approval(product)
        except DjangoValidationError as exc:
            _raise_from(exc)
        return Response(self.get_serializer(product).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        product = self.get_object()
        try:
            services.approve_product(product, request.user)
        except DjangoValidationError as exc:
            _raise_from(exc)
        return Response(self.get_serializer(product).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        payload = RejectProductSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        product = self.get_object()
        try:
            services.reject_product(product, request.user, payload.validated_data["reason"])
        except DjangoValidationError as exc:
            _raise_from(exc)
        return Response(self.get_serializer(product).data)

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
        if self.action in ("create", "close"):
            return [IsRole()]
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        cost = self.get_object()
        if cost.status == "closed":
            raise DRFValidationError("Cannot delete a closed Sourcing Cost.")
        # Refund all items' wallet deductions before deleting
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
        if self.action in ("create",):
            return [IsRole()]
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        cost = SourcingCost.objects.get(pk=self.kwargs["cost_pk"])
        if cost.status == "closed":
            raise DRFValidationError("Cannot add items to a closed Sourcing Cost.")
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

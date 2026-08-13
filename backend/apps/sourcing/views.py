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
from apps.accounts.permissions import IsAdmin, IsQCOrAdmin, IsRole
from apps.core.tenancy import TenantScopedViewSet
from apps.sourcing import services
from apps.sourcing.models import Product, SourcingLocationEntry, SourcingTrip
from apps.sourcing.serializers import (
    ProductImageSerializer,
    ProductSelfSerializer,
    ProductSerializer,
    RejectProductSerializer,
    SourcingLocationEntrySerializer,
    SourcingTripSelfSerializer,
    SourcingTripSerializer,
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
        if self.action in ("create", "submit_for_approval", "upload_image", "upload_factory_packing_list"):
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


class SourcingTripViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """BR-11–15 / FR-68–71."""

    queryset = SourcingTrip.objects.select_related("product__sisterProfile__buyerProfile").prefetch_related("locations")
    tenant_lookup = "product__sisterProfile__buyerProfile_id"
    allowed_roles = [Roles.COMPANY_REP]

    def get_serializer_class(self):
        if self.request.user.role == Roles.BUYER:
            return SourcingTripSelfSerializer
        return SourcingTripSerializer

    def get_permissions(self):
        if self.action in ("create", "close"):
            return [IsRole()]
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        trip = self.get_object()
        if trip.locations.filter(status="reported").exists():
            raise DRFValidationError(
                "Cannot delete — this trip has reported locations with advances already recorded as expenses."
            )
        trip.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        trip = self.get_object()
        try:
            services.close_sourcing_trip(trip)
        except DjangoValidationError as exc:
            _raise_from(exc)
        return Response(self.get_serializer(trip).data)


class SourcingLocationEntryViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """Nested under a trip: /sourcing-trips/<trip_pk>/locations/."""

    queryset = SourcingLocationEntry.objects.select_related("sourcingTrip__product__sisterProfile__buyerProfile")
    serializer_class = SourcingLocationEntrySerializer
    tenant_lookup = "sourcingTrip__product__sisterProfile__buyerProfile_id"
    allowed_roles = [Roles.COMPANY_REP]

    def get_queryset(self):
        qs = super().get_queryset()
        trip_id = self.kwargs.get("trip_pk")
        if trip_id:
            qs = qs.filter(sourcingTrip_id=trip_id)
        return qs

    def get_permissions(self):
        if self.action in ("create", "report"):
            return [IsRole()]
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        trip = SourcingTrip.objects.get(pk=self.kwargs["trip_pk"])
        if trip.status == "closed":
            raise DRFValidationError("Cannot add locations to a closed Sourcing Trip.")
        serializer.save(sourcingTrip=trip)

    def destroy(self, request, *args, **kwargs):
        location = self.get_object()
        if location.status == "reported":
            raise DRFValidationError("Cannot delete a location that has already been reported.")
        location.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def report(self, request, pk=None, trip_pk=None):
        location = self.get_object()
        try:
            services.report_location(location, request.user)
        except DjangoValidationError as exc:
            _raise_from(exc)
        return Response(self.get_serializer(location).data)

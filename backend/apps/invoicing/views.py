from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Roles
from apps.accounts.permissions import IsAdmin, IsRole, IsSupplierStaff
from apps.core.tenancy import TenantScopedViewSet
from apps.invoicing import services
from apps.invoicing.models import ExchangeRate, Invoice
from apps.invoicing.serializers import ExchangeRateSerializer, InvoiceSelfSerializer, InvoiceSerializer
from apps.sourcing.models import Product


class ExchangeRateViewSet(viewsets.ModelViewSet):
    """BR-42 / FR-55-58: Admin publishes, all supplier staff may read to
    select a rate when creating an invoice. Not part of the Buyer Portal's
    read surface — the buyer sees the locked rate on their own invoices,
    not the raw rate list."""

    queryset = ExchangeRate.objects.select_related("publishedBy")
    serializer_class = ExchangeRateSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        if self.action == "create":
            return [IsAdmin()]
        return [IsSupplierStaff()]

    def perform_create(self, serializer):
        serializer.save(publishedBy=self.request.user)


class InvoiceViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """BR-36–47 / FR-42–59."""

    queryset = Invoice.objects.select_related(
        "sisterProfile__buyerProfile", "exchangeRate", "createdBy", "approvedBy"
    ).prefetch_related("lineItems", "payments")
    tenant_lookup = "sisterProfile__buyerProfile_id"
    allowed_roles = [Roles.EMPLOYEE]
    # PUT/PATCH excluded deliberately — BR-46: an invoice is never edited in
    # place, only advanced through its status actions or (for Pending/
    # Rejected only) deleted outright below.
    http_method_names = ["get", "post", "delete", "head", "options"]
    # No filterset_fields — get_queryset() below already filters on both
    # params by hand, and it treats status=all as "no filter" (the
    # frontend's default). A DjangoFilterBackend-generated FilterSet would
    # instead validate "all" against Invoice.status's real choices and
    # reject it with a 400, overriding that "no filter" meaning entirely.

    def get_serializer_class(self):
        if self.request.user.role == Roles.BUYER:
            return InvoiceSelfSerializer
        return InvoiceSerializer

    def get_permissions(self):
        if self.action in ("create", "payments"):
            return [IsRole()]
        if self.action in ("approve", "reject", "void", "destroy"):
            return [IsAdmin()]
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        invoice = self.get_object()
        try:
            services.delete_invoice(invoice, request.user)
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get("status")
        if status_param and status_param != "all":
            qs = qs.filter(status=status_param)
        sister_profile_id = self.request.query_params.get("sisterProfile")
        if sister_profile_id:
            qs = qs.filter(sisterProfile_id=sister_profile_id)
        return qs

    def create(self, request, *args, **kwargs):
        from apps.buyers.models import SisterProfile
        from apps.packing.models import PackingCarton

        data = request.data
        sister_profile = SisterProfile.objects.filter(pk=data.get("sisterProfile")).first()
        if not sister_profile:
            raise DRFValidationError({"sisterProfile": "Required."})
        exchange_rate = ExchangeRate.objects.filter(pk=data.get("exchangeRate")).first() if data.get("exchangeRate") else None

        line_items = []
        for li in data.get("lineItems", []):
            row = dict(li)
            if row.get("product"):
                row["product"] = Product.objects.filter(pk=row["product"]).first()
            if row.get("packingCarton"):
                row["packingCarton"] = PackingCarton.objects.filter(pk=row["packingCarton"]).first()
            line_items.append(row)

        try:
            invoice = services.create_invoice(
                sister_profile=sister_profile,
                created_by=request.user,
                line_items=line_items,
                exchange_rate=exchange_rate,
                commission_type=data.get("commissionType", "none"),
                commission_value=data.get("commissionValue") or 0,
            )
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(self.get_serializer(invoice).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        invoice = self.get_object()
        try:
            services.approve_invoice(invoice, request.user)
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        invoice = self.get_object()
        try:
            services.reject_invoice(invoice, request.user, request.data.get("reason", ""))
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        invoice = self.get_object()
        try:
            services.void_invoice(invoice, request.data.get("reason", ""), request.user)
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["post"])
    def payments(self, request, pk=None):
        invoice = self.get_object()
        data = request.data
        try:
            services.record_payment(
                invoice, amount=data.get("amount"), currency=data.get("currency", "USD"),
                payment_date=data.get("paymentDate"), bank_reference=data.get("bankReference", ""),
                recorded_by=request.user,
            )
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        # get_queryset() prefetches "payments" for GET/list efficiency; that
        # cache is now stale (it predates the payment just created), so the
        # response's `payments` list would silently omit it otherwise.
        invoice.refresh_from_db()
        return Response(self.get_serializer(invoice).data, status=status.HTTP_201_CREATED)

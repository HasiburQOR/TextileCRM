from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Roles
from apps.accounts.permissions import IsAdmin, IsRole, IsSupplierStaff
from apps.core.tenancy import TenantScopedViewSet
from apps.invoicing import exports, services
from apps.invoicing.models import ExchangeRate, Invoice
from apps.invoicing.serializers import ExchangeRateSerializer, InvoiceSelfSerializer, InvoiceSerializer
from apps.sourcing.models import Product

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


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
        "sisterProfile__buyerProfile", "createdBy", "approvedBy", "buyerDetails"
    ).prefetch_related("lineItems", "payments")
    tenant_lookup = "sisterProfile__buyerProfile_id"
    allowed_roles = [Roles.EMPLOYEE]
    # PUT stays excluded — BR-46: an invoice is never wholesale rewritten.
    # PATCH exists for exactly one purpose (partial_update below): fixing
    # the commission rate on a still-Pending invoice, because a wrong rate
    # at generation time otherwise meant delete-and-recreate.
    # Everything else still only advances through the status actions, and
    # once approved the door closes for good.
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
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
        if self.action in ("create", "payments", "payment_detail", "partial_update"):
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
        from apps.warehouse.models import WarehouseCost

        data = request.data
        sister_profile = SisterProfile.objects.filter(pk=data.get("sisterProfile")).first()
        if not sister_profile:
            raise DRFValidationError({"sisterProfile": "Required."})

        line_items = []
        for li in data.get("lineItems", []):
            row = dict(li)
            if row.get("product"):
                row["product"] = Product.objects.filter(pk=row["product"]).first()
            if row.get("packingCarton"):
                row["packingCarton"] = PackingCarton.objects.filter(pk=row["packingCarton"]).first()
            if row.get("warehouseCost"):
                row["warehouseCost"] = WarehouseCost.objects.filter(pk=row["warehouseCost"]).first()
            line_items.append(row)

        try:
            invoice = services.create_invoice(
                sister_profile=sister_profile,
                created_by=request.user,
                line_items=line_items,
                commission_rate=data.get("commissionRate"),
                pull_expenses=bool(data.get("pullExpenses")),
                buyer_details=data.get("buyerDetails"),
            )
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(self.get_serializer(invoice).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        """Edit-before-approve: fix the commission rate on a still-pending
        invoice before an Admin approves it. Every other field — status,
        invoiceNo, line items, the agreement-derived commission type, the
        SisterProfile currency snapshot, totals — remains service-owned,
        and the service itself refuses anything not in Pending Approval."""
        invoice = self.get_object()
        data = request.data
        payload = {}
        for key, kwarg in (
            ("commissionRate", "commission_rate"),
            ("commissionValue", "commission_rate"),  # legacy payload key
        ):
            if key in data:
                payload[kwarg] = data[key]
                break
        try:
            invoice = services.update_invoice_commission(invoice, actor=request.user, **payload)
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["get"])
    def export(self, request, pk=None):
        """Downloadable copy of the invoice — PDF (default) or
        ?filetype=xlsx. (Named `filetype`, not `format` — DRF reserves the
        `format` query param for content-negotiation/renderer selection, and
        an unrecognized value there breaks routing before this view ever
        runs.) Same tenant scoping as every other action here: a buyer can
        only ever reach this for their own invoice (get_object() ->
        get_queryset(), see TenantScopedViewSet)."""
        invoice = self.get_object()
        # FR-60-63: bilingual export. `lang` defaults to English; the PDF
        # renderer itself degrades `ka` to `en` when no Georgian-capable
        # font is available, so an unsupported value here can simply be
        # normalized the same way rather than 400-ing the download.
        lang = request.query_params.get("lang", "en")
        lang = "ka" if lang == "ka" else "en"
        if request.query_params.get("filetype") == "xlsx":
            content = exports.render_invoice_xlsx(invoice, lang=lang)
            response = HttpResponse(content, content_type=XLSX_CONTENT_TYPE)
            filename = exports.invoice_filename(invoice, "xlsx")
        else:
            content = exports.render_invoice_pdf(invoice, lang=lang)
            response = HttpResponse(content, content_type="application/pdf")
            filename = exports.invoice_filename(invoice, "pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

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

    @action(detail=True, methods=["patch", "delete"], url_path=r"payments/(?P<payment_id>[^/.]+)", url_name="payment-detail")
    def payment_detail(self, request, pk=None, payment_id=None):
        """Correct or remove a payment recorded in error — record_payment()
        above only ever appends; until now a wrong amount or date was
        permanent. Same tenant scoping as every other action here (a buyer
        can only reach this for their own invoice), and the service layer
        itself refuses anything on a non-Issued invoice (BR-46: a Void
        invoice's payment history is part of the closed record)."""
        invoice = self.get_object()
        payment = invoice.payments.filter(pk=payment_id).first()
        if not payment:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            if request.method == "DELETE":
                services.delete_payment(payment, actor=request.user)
            else:
                data = request.data
                payload = {}
                for key, kwarg in (
                    ("amount", "amount"), ("currency", "currency"),
                    ("paymentDate", "payment_date"), ("bankReference", "bank_reference"),
                ):
                    if key in data:
                        payload[kwarg] = data[key]
                services.update_payment(payment, actor=request.user, **payload)
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))

        # Same staleness concern as the create action above — the prefetched
        # "payments" cache on this instance predates the edit/delete.
        invoice.refresh_from_db()
        return Response(self.get_serializer(invoice).data)

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import ADMIN
from buyers.models import SisterProfile
from invoicing.models import ExchangeRate, Invoice
from invoicing.serializers import ExchangeRateSerializer, InvoiceSerializer
from invoicing.services import approve_invoice, create_invoice, record_payment, reject_invoice, void_invoice


class ExchangeRateViewSet(viewsets.ModelViewSet):
    queryset = ExchangeRate.objects.select_related("publishedBy").order_by("-effectiveDate")
    serializer_class = ExchangeRateSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(publishedBy=self.request.user)


class InvoiceViewSet(viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = Invoice.objects.select_related("createdBy", "approvedBy", "exchangeRate").prefetch_related("lineItems", "payments")
        status_param = self.request.query_params.get("status")
        if status_param and status_param != "ALL":
            qs = qs.filter(status=status_param)
        return qs.order_by("-createdAt")

    def create(self, request, *args, **kwargs):
        data = request.data
        rate = ExchangeRate.objects.filter(pk=data.get("exchangeRateId")).first() if data.get("exchangeRateId") else None
        sister_profile = SisterProfile.objects.filter(pk=data.get("sisterProfileId")).first() if data.get("sisterProfileId") else None
        invoice = create_invoice(
            buyer_name=data.get("buyerName", ""),
            exchange_rate=rate,
            commission_type=data.get("commissionType", "NONE"),
            commission_value=data.get("commissionValue") or 0,
            line_items=data.get("lineItems") or [],
            created_by=request.user,
            sister_profile=sister_profile,
        )
        return Response(self.get_serializer(invoice).data, status=201)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        if request.user.role != ADMIN:
            return Response({"detail": "Admin role required."}, status=403)
        invoice = self.get_object()
        approve_invoice(invoice, request.user)
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        if request.user.role != ADMIN:
            return Response({"detail": "Admin role required."}, status=403)
        reason = request.data.get("reason", "")
        if not reason:
            raise ValidationError({"reason": "A rejection reason is required."})
        invoice = self.get_object()
        reject_invoice(invoice, request.user, reason)
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        if request.user.role != ADMIN:
            return Response({"detail": "Admin role required."}, status=403)
        reason = request.data.get("reason", "")
        invoice = self.get_object()
        void_invoice(invoice, reason)
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["post"])
    def payments(self, request, pk=None):
        invoice = self.get_object()
        record_payment(
            invoice,
            amount=request.data.get("amount") or 0,
            currency=request.data.get("currency", "USD"),
            payment_date=request.data.get("paymentDate"),
            bank_reference=request.data.get("bankReference", ""),
            recorded_by=request.user,
        )
        return Response(self.get_serializer(invoice).data, status=201)

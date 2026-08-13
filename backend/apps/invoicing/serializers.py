from rest_framework import serializers

from apps.invoicing.models import ExchangeRate, Invoice, InvoiceLineItem, InvoicePayment


class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = ["id", "sourceCurrency", "targetCurrency", "rate", "effectiveDate", "publishedBy", "createdAt"]
        read_only_fields = ["id", "publishedBy", "createdAt"]


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLineItem
        fields = [
            "id", "invoice", "product", "packingCarton", "description", "brand", "ctn", "qtyPerCtn",
            "totalQty", "unitPrice", "amount", "netWeight", "grossWeight", "cbm", "material",
            "styleItemCode", "remarks",
        ]
        read_only_fields = ["id", "invoice"]


class InvoicePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoicePayment
        fields = ["id", "invoice", "amount", "currency", "paymentDate", "bankReference", "recordedBy", "createdAt"]
        read_only_fields = ["id", "invoice", "recordedBy", "createdAt"]


class InvoiceSerializer(serializers.ModelSerializer):
    """Admin/staff-facing — full detail."""

    lineItems = InvoiceLineItemSerializer(many=True, read_only=True)
    payments = InvoicePaymentSerializer(many=True, read_only=True)
    sisterProfilePoReference = serializers.CharField(source="sisterProfile.poReference", read_only=True)
    buyerName = serializers.CharField(source="sisterProfile.buyerProfile.name", read_only=True)
    commissionAmount = serializers.DecimalField(source="commission_amount", max_digits=14, decimal_places=2, read_only=True)
    grandTotal = serializers.DecimalField(source="grand_total", max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "sisterProfile", "sisterProfilePoReference", "buyerName", "invoiceNo", "status",
            "rejectionReason", "voidReason", "exchangeRate", "exchangeRateValueLocked", "targetCurrency",
            "commissionType", "commissionValue", "commissionAmount", "totalValue", "grandTotal",
            "convertedTotal", "outstandingBalance", "createdBy", "approvedBy", "approvedAt",
            "lineItems", "payments", "createdAt", "updatedAt",
        ]
        read_only_fields = [
            "id", "invoiceNo", "status", "rejectionReason", "voidReason", "exchangeRateValueLocked",
            "targetCurrency", "totalValue", "convertedTotal", "outstandingBalance", "createdBy",
            "approvedBy", "approvedAt", "createdAt", "updatedAt",
        ]


class InvoiceSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — BR-55/FR-80: invoices visible to the buyer, read-only."""

    lineItems = InvoiceLineItemSerializer(many=True, read_only=True)
    payments = InvoicePaymentSerializer(many=True, read_only=True)
    grandTotal = serializers.DecimalField(source="grand_total", max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "invoiceNo", "status", "totalValue", "grandTotal", "convertedTotal",
            "targetCurrency", "outstandingBalance", "lineItems", "payments", "createdAt",
        ]
        read_only_fields = fields

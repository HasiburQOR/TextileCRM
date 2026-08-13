from rest_framework import serializers

from invoicing.models import ExchangeRate, Invoice, InvoiceLineItem, InvoicePayment


class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = ["id", "sourceCurrency", "targetCurrency", "rate", "effectiveDate", "publishedBy", "createdAt"]
        read_only_fields = ["id", "createdAt"]


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLineItem
        fields = [
            "id", "request", "description", "brand", "ctn", "qtyPerCtn", "totalQty",
            "unitPrice", "amount", "netWeight", "grossWeight", "cbm", "material",
            "styleItemCode", "remarks",
        ]
        read_only_fields = ["id"]


class InvoicePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoicePayment
        fields = ["id", "invoice", "amount", "currency", "paymentDate", "bankReference", "recordedBy", "createdAt"]
        read_only_fields = ["id", "invoice", "recordedBy", "createdAt"]


class InvoiceSerializer(serializers.ModelSerializer):
    lineItems = InvoiceLineItemSerializer(many=True, required=False)
    payments = InvoicePaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "invoiceNo", "buyerName", "status", "rejectionReason", "exchangeRate",
            "exchangeRateValue", "targetCurrency", "commissionType", "commissionValue",
            "totalValue", "convertedTotal", "outstandingBalance", "createdBy", "approvedBy",
            "approvedAt", "sisterProfile", "lineItems", "payments", "createdAt", "updatedAt",
        ]
        read_only_fields = [
            "id", "invoiceNo", "status", "rejectionReason", "exchangeRateValue", "targetCurrency",
            "totalValue", "convertedTotal", "outstandingBalance", "createdBy", "approvedBy",
            "approvedAt", "createdAt", "updatedAt",
        ]

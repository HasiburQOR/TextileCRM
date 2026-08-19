from rest_framework import serializers

from apps.invoicing.models import ExchangeRate, Invoice, InvoiceBuyerDetails, InvoiceLineItem, InvoicePayment


class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = ["id", "sourceCurrency", "targetCurrency", "rate", "effectiveDate", "publishedBy", "createdAt"]
        read_only_fields = ["id", "publishedBy", "createdAt"]


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLineItem
        fields = [
            "id", "invoice", "product", "packingCarton", "warehouseCost", "description", "brand", "ctn", "qtyPerCtn",
            "totalQty", "unitPrice", "amount", "netWeight", "grossWeight", "cbm", "material",
            "styleItemCode", "patternNo", "packingListRef", "remarks",
            "colorSizeNote", "markRef", "hsCode",
            "netWeightPerCtn", "grossWeightPerCtn", "cbmPerCtn",
            "ctnLengthCm", "ctnWidthCm", "ctnHeightCm",
        ]
        read_only_fields = ["id", "invoice"]


class InvoicePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoicePayment
        fields = ["id", "invoice", "amount", "currency", "paymentDate", "bankReference", "recordedBy", "createdAt"]
        read_only_fields = ["id", "invoice", "recordedBy", "createdAt"]


class InvoiceBuyerDetailsSerializer(serializers.ModelSerializer):
    """Per-invoice buyer/consignee details — free-text fields entered at
    creation time, positioned top-left on the printed document."""

    class Meta:
        model = InvoiceBuyerDetails
        fields = [
            "id", "companyName", "idNumber", "address", "cityCountry",
            "contactPerson", "phone", "customFields",
        ]
        read_only_fields = ["id"]


class InvoiceSerializer(serializers.ModelSerializer):
    """Admin/staff-facing — full detail."""

    lineItems = InvoiceLineItemSerializer(many=True, read_only=True)
    payments = InvoicePaymentSerializer(many=True, read_only=True)
    buyerDetails = InvoiceBuyerDetailsSerializer(read_only=True)
    sisterProfilePoReference = serializers.CharField(source="sisterProfile.poReference", read_only=True)
    buyerName = serializers.CharField(source="sisterProfile.buyerProfile.name", read_only=True)
    agreementType = serializers.CharField(source="sisterProfile.agreementType", read_only=True)
    commissionAmount = serializers.DecimalField(source="commission_amount", max_digits=14, decimal_places=2, read_only=True)
    amountOwed = serializers.DecimalField(source="amount_owed", max_digits=14, decimal_places=2, read_only=True)
    amountOwedBuyer = serializers.DecimalField(source="_amount_owed_buyer", max_digits=14, decimal_places=2, read_only=True)
    grandTotal = serializers.DecimalField(source="grand_total", max_digits=14, decimal_places=2, read_only=True)
    rateLabel = serializers.CharField(source="rate_label", read_only=True)
    documentTotals = serializers.DictField(source="document_totals", read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "sisterProfile", "sisterProfilePoReference", "buyerName", "agreementType",
            "buyerDetails", "invoiceNo", "status",
            "rejectionReason", "voidReason", "exchangeRateValueLocked", "targetCurrency",
            "sourceCurrency", "rateLabel", "agreementTypeAtCreation",
            "commissionType", "commissionValue", "commissionAmount",
            "commissionTotalSupplier", "commissionTotalBuyer",
            "costTotalSupplier", "costTotalBuyer",
            "totalValue", "grandTotal", "amountOwed", "amountOwedBuyer",
            "convertedTotal", "outstandingBalance", "createdBy", "approvedBy", "approvedAt",
            "lineItems", "payments", "documentTotals", "createdAt", "updatedAt",
        ]
        read_only_fields = [
            "id", "invoiceNo", "status", "rejectionReason", "voidReason", "exchangeRateValueLocked",
            "targetCurrency", "sourceCurrency", "agreementTypeAtCreation", "commissionType",
            "totalValue", "convertedTotal", "costTotalSupplier", "costTotalBuyer",
            "commissionTotalSupplier", "commissionTotalBuyer",
            "outstandingBalance", "createdBy", "approvedBy", "approvedAt", "createdAt", "updatedAt",
        ]


class InvoiceSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — BR-55/FR-80: invoices visible to the buyer, read-only."""

    lineItems = InvoiceLineItemSerializer(many=True, read_only=True)
    payments = InvoicePaymentSerializer(many=True, read_only=True)
    buyerDetails = InvoiceBuyerDetailsSerializer(read_only=True)
    grandTotal = serializers.DecimalField(source="grand_total", max_digits=14, decimal_places=2, read_only=True)
    amountOwed = serializers.DecimalField(source="amount_owed", max_digits=14, decimal_places=2, read_only=True)
    amountOwedBuyer = serializers.DecimalField(source="_amount_owed_buyer", max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "invoiceNo", "status", "totalValue", "grandTotal", "amountOwed", "amountOwedBuyer",
            "convertedTotal", "commissionTotalSupplier", "commissionTotalBuyer",
            "costTotalSupplier", "costTotalBuyer",
            "targetCurrency", "sourceCurrency", "outstandingBalance",
            "lineItems", "payments", "buyerDetails", "createdAt",
        ]
        read_only_fields = fields

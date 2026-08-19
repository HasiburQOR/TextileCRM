from rest_framework import serializers

from apps.qc.models import QCReport


class QCReportSerializer(serializers.ModelSerializer):
    """`hasWarehouseCost` used to flag whether this report already had a
    WarehouseCost against it, back when Warehouse Costs were created by
    picking a QC report (one-to-one). Warehouse Costs are now recorded
    directly against a Sister Profile / Packing List instead — see
    apps.warehouse — so that relation, and this field, no longer exist."""

    productName = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = QCReport
        fields = [
            "id", "product", "productName", "reportId", "lunchCostFlag", "lunchCost", "goodsCarryingCost",
            "travelMode", "extraCost", "totalCost", "createdBy", "createdAt", "updatedAt",
        ]
        read_only_fields = ["id", "reportId", "totalCost", "createdBy", "createdAt", "updatedAt"]


class QCReportSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — totals only, no internal cost breakdown."""

    productName = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = QCReport
        fields = ["id", "productName", "reportId", "totalCost", "createdAt"]
        read_only_fields = fields

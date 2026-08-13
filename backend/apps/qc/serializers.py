from rest_framework import serializers

from apps.qc.models import QCReport


class QCReportSerializer(serializers.ModelSerializer):
    productName = serializers.CharField(source="product.name", read_only=True)
    hasWarehouseCost = serializers.SerializerMethodField()

    class Meta:
        model = QCReport
        fields = [
            "id", "product", "productName", "reportId", "lunchCostFlag", "lunchCost", "goodsCarryingCost",
            "travelMode", "extraCost", "totalCost", "createdBy", "hasWarehouseCost", "createdAt", "updatedAt",
        ]
        read_only_fields = ["id", "reportId", "totalCost", "createdBy", "createdAt", "updatedAt"]

    def get_hasWarehouseCost(self, obj):
        return hasattr(obj, "warehouseCost")


class QCReportSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — totals only, no internal cost breakdown."""

    productName = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = QCReport
        fields = ["id", "productName", "reportId", "totalCost", "createdAt"]
        read_only_fields = fields

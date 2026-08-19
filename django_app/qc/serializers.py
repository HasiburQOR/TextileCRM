from rest_framework import serializers

from qc.models import QCReport


class QCReportSerializer(serializers.ModelSerializer):
    productName = serializers.CharField(source="request.productName", read_only=True)
    createdByName = serializers.CharField(source="createdBy.display_name", read_only=True)
    hasWarehouseCost = serializers.SerializerMethodField()

    class Meta:
        model = QCReport
        fields = [
            "id", "reportId", "request", "productName", "lunchCostFlag", "lunchCost",
            "goodsCarryingCost", "travelMode", "extraCost", "totalCost", "createdBy",
            "createdByName", "hasWarehouseCost", "createdAt", "updatedAt",
        ]
        read_only_fields = ["id", "reportId", "totalCost", "createdAt", "updatedAt"]

    def get_hasWarehouseCost(self, obj):
        return hasattr(obj, "warehouseCost")

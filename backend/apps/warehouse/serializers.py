from rest_framework import serializers

from apps.warehouse.models import WarehouseCost


class WarehouseCostSerializer(serializers.ModelSerializer):
    reportId = serializers.CharField(source="qcReport.reportId", read_only=True)
    productName = serializers.CharField(source="qcReport.product.name", read_only=True)

    class Meta:
        model = WarehouseCost
        fields = [
            "id", "qcReport", "reportId", "productName", "loaderCost", "extraWorkerCost",
            "labelsCost", "htakeCost", "stickersCost", "cartonsCost", "polyBagsCost", "gamtapeCost",
            "customCosts", "extraCost", "extraCostRemarks", "totalCost", "createdBy", "createdAt",
        ]
        read_only_fields = ["id", "totalCost", "createdBy", "createdAt"]


class WarehouseCostSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — totals only."""

    productName = serializers.CharField(source="qcReport.product.name", read_only=True)

    class Meta:
        model = WarehouseCost
        fields = ["id", "productName", "totalCost", "createdAt"]
        read_only_fields = fields

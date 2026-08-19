from rest_framework import serializers

from apps.warehouse.models import WarehouseCost


class WarehouseCostSerializer(serializers.ModelSerializer):
    sisterProfilePoReference = serializers.CharField(source="sisterProfile.poReference", read_only=True)
    packingListReferenceCode = serializers.CharField(source="packingList.referenceCode", read_only=True, default="")

    class Meta:
        model = WarehouseCost
        fields = [
            "id", "sisterProfile", "sisterProfilePoReference", "packingList", "packingListReferenceCode",
            "loaderCost", "extraWorkerCost",
            "labelsCost", "htakeCost", "stickersCost", "cartonsCost", "polyBagsCost", "gamtapeCost",
            "customCosts", "extraCost", "extraCostRemarks", "totalCost", "createdBy", "createdAt",
        ]
        read_only_fields = ["id", "totalCost", "createdBy", "createdAt"]


class WarehouseCostSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — totals only."""

    sisterProfilePoReference = serializers.CharField(source="sisterProfile.poReference", read_only=True)
    packingListReferenceCode = serializers.CharField(source="packingList.referenceCode", read_only=True, default="")

    class Meta:
        model = WarehouseCost
        fields = ["id", "sisterProfilePoReference", "packingListReferenceCode", "totalCost", "createdAt"]
        read_only_fields = fields

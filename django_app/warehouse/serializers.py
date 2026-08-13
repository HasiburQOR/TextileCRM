from rest_framework import serializers

from warehouse.models import WarehouseCost


class WarehouseCostSerializer(serializers.ModelSerializer):
    customCosts = serializers.SerializerMethodField()

    class Meta:
        model = WarehouseCost
        fields = [
            "id", "qcReport", "loaderCost", "extraWorkerCost", "labelsCost", "htakeCost",
            "stickersCost", "cartonsCost", "polyBagsCost", "gamtapeCost", "totalCost",
            "customCosts", "createdBy", "createdAt", "updatedAt",
        ]
        read_only_fields = ["id", "totalCost", "createdAt", "updatedAt"]

    def get_customCosts(self, obj):
        return obj.custom_cost_list()

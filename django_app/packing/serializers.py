from rest_framework import serializers

from packing.models import PackingCarton, PackingList


class PackingCartonSerializer(serializers.ModelSerializer):
    class Meta:
        model = PackingCarton
        fields = [
            "id", "cartonNoFrom", "cartonNoTo", "noOfCartons", "color", "assortId", "itemNumber",
            "sizeBreakdown", "qtyPerCarton", "shipQty", "orderQty", "shortQty", "shortPct",
            "ctnLength", "ctnWidth", "ctnHeight", "netWeight", "grossWeight", "ctnCbm",
        ]
        read_only_fields = ["id", "noOfCartons", "shipQty", "shortQty", "shortPct", "ctnCbm"]


class PackingListSerializer(serializers.ModelSerializer):
    cartons = PackingCartonSerializer(many=True, required=False)
    productName = serializers.CharField(source="request.productName", read_only=True)

    class Meta:
        model = PackingList
        fields = [
            "id", "request", "productName", "orderQty", "shipmentQty", "shortQty", "shortPct",
            "totalCbm", "totalNetWeight", "totalGrossWeight", "frontMark", "sideMark",
            "cartons", "createdAt", "updatedAt",
        ]
        read_only_fields = ["id", "shortQty", "shortPct", "totalCbm", "totalNetWeight", "totalGrossWeight", "createdAt", "updatedAt"]

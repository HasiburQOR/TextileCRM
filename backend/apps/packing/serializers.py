from rest_framework import serializers

from apps.packing.models import PackingCarton, PackingList, PackingRule


class PackingRuleSerializer(serializers.ModelSerializer):
    unitsPerCarton = serializers.IntegerField(source="units_per_carton", read_only=True)

    class Meta:
        model = PackingRule
        fields = [
            "id", "buyerProfile", "name", "sizeRatio", "unitsPerCarton",
            "cartonLength", "cartonWidth", "cartonHeight",
            "cartonNetWeight", "cartonGrossWeight", "createdAt", "updatedAt",
        ]
        read_only_fields = ["id", "createdAt", "updatedAt"]


class PackingCartonSerializer(serializers.ModelSerializer):
    styleNumber = serializers.CharField(source="product.styleNumber", read_only=True)
    productName = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = PackingCarton
        fields = [
            "id", "packingList", "product", "styleNo", "styleNumber", "productName",
            "cartonNoFrom", "cartonNoTo", "noOfCartons", "colorBreakdown", "patternNo", "assortId",
            "sizeBreakdown", "totalPcsPerCarton", "innerBundle",
            "orderQty", "shipQty", "shortExcessQty", "shortExcessPct",
            "grossWeight", "netWeight", "totalGrossWeight", "totalNetWeight",
            "ctnLength", "ctnWidth", "ctnHeight", "ctnCbm", "totalCbm",
        ]
        read_only_fields = [
            "id", "noOfCartons", "totalPcsPerCarton", "shipQty", "shortExcessQty", "shortExcessPct",
            "totalGrossWeight", "totalNetWeight", "ctnCbm", "totalCbm",
        ]


class PackingListSerializer(serializers.ModelSerializer):
    """Admin/staff-facing — full detail, every field, nested cartons."""

    cartons = PackingCartonSerializer(many=True, required=False)
    sisterProfilePoReference = serializers.CharField(source="sisterProfile.poReference", read_only=True)

    class Meta:
        model = PackingList
        fields = [
            "id", "sisterProfile", "sisterProfilePoReference", "packingRule", "poNo", "brandName", "date",
            "frontMark", "sideMark", "totalOrderQty", "totalShipQty", "shortExcessQty", "shortExcessPct",
            "totalCartonQty", "totalGrossWeight", "totalNetWeight", "totalCbm", "cartons",
            "createdBy", "createdAt", "updatedAt",
        ]
        read_only_fields = [
            "id", "totalOrderQty", "totalShipQty", "shortExcessQty", "shortExcessPct", "totalCartonQty",
            "totalGrossWeight", "totalNetWeight", "totalCbm", "createdBy", "createdAt", "updatedAt",
        ]

    def update(self, instance, validated_data):
        """Edit form lets Admin correct any field, including carton rows —
        cartons (when present in the payload) are fully replaced rather than
        diffed/matched by id, same pattern as PackingListViewSet.create();
        totals are recomputed the same way create_packing_list() does."""
        from apps.packing import services

        cartons_data = validated_data.pop("cartons", None)
        instance = super().update(instance, validated_data)
        if cartons_data is not None:
            instance.cartons.all().delete()
            for carton_data in cartons_data:
                carton = PackingCarton(packingList=instance, **carton_data)
                services.compute_carton_derived(carton)
                services._validate_carton_ranges(carton)
                carton.save()
            services.recompute_packing_list_totals(instance)
            instance.refresh_from_db()
        return instance


class PackingListSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — BR-55/FR-80: read-only packing list visibility."""

    cartons = PackingCartonSerializer(many=True, read_only=True)

    class Meta:
        model = PackingList
        fields = [
            "id", "poNo", "brandName", "date", "totalOrderQty", "totalShipQty",
            "shortExcessQty", "shortExcessPct", "totalCartonQty", "totalGrossWeight",
            "totalNetWeight", "totalCbm", "cartons", "createdAt",
        ]
        read_only_fields = fields


class GenerateCartonsSerializer(serializers.Serializer):
    """Input for the "auto-generate from rule" preview action (FR-19)."""

    product = serializers.UUIDField()
    packingRule = serializers.UUIDField()
    startCartonNo = serializers.IntegerField(min_value=1, default=1)
    colors = serializers.ListField(child=serializers.DictField(), allow_empty=False)

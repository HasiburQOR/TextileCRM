from rest_framework import serializers

from apps.sourcing.models import (
    Product,
    ProductImage,
    ProductVariant,
    SourcingLocationEntry,
    SourcingTrip,
)


class ProductVariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductVariant
        fields = [
            "id", "colorBreakdown", "patternNo", "orderQty", "sizeBreakdown", "pcsPerCarton", "innerBundle",
            "cartonNoFrom", "cartonNoTo", "noOfCartons", "totalPcs",
            "grossWeight", "netWeight", "totalGrossWeight", "totalNetWeight",
            "ctnLength", "ctnWidth", "ctnHeight", "cbm", "totalCbm",
        ]
        read_only_fields = ["id", "pcsPerCarton", "noOfCartons", "totalPcs", "totalGrossWeight", "totalNetWeight", "cbm", "totalCbm"]


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = [
            "id", "product", "image", "label", "customLabelName",
            "gpsLat", "gpsLng", "capturedAt", "uploadedBy", "createdAt",
        ]
        # product is set by the view from the URL (ProductViewSet.upload_image),
        # never from the request body — read_only here so a client that
        # doesn't send it (the frontend never does) isn't rejected with a
        # spurious "This field is required."
        read_only_fields = ["id", "product", "uploadedBy", "createdAt"]

    def validate(self, attrs):
        if attrs.get("label") == "custom" and not attrs.get("customLabelName"):
            raise serializers.ValidationError({"customLabelName": "Required when label is 'custom'."})
        return attrs


class ProductSerializer(serializers.ModelSerializer):
    """Admin/staff-facing — full detail, every field."""

    variants = ProductVariantSerializer(many=True, required=False)
    images = ProductImageSerializer(many=True, read_only=True)
    totalOrderQty = serializers.IntegerField(source="total_order_qty", read_only=True)
    createdByName = serializers.CharField(source="createdBy.display_name", read_only=True)
    reviewedByName = serializers.CharField(source="reviewedBy.display_name", read_only=True, default=None)
    sisterProfilePoReference = serializers.CharField(source="sisterProfile.poReference", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "sisterProfile", "sisterProfilePoReference", "styleNumber", "name", "brandName", "poNo",
            "status", "rejectionReason", "goodsName", "finalPrice", "fabricDetails", "factoryPackingList",
            "productQrGenerated", "productQrPayload", "cartonQrGenerated", "cartonQrPayload",
            "createdBy", "createdByName", "reviewedBy",
            "reviewedByName", "reviewedAt", "variants", "images", "totalOrderQty", "createdAt", "updatedAt",
        ]
        # styleNumber is writable — auto-suggested client-side, editable before
        # submit; falls back to the model's generate_style_number() default if
        # omitted. Still unique (UniqueValidator, from the model's unique=True).
        # goodsName/finalPrice/fabricDetails are read-only here — they're
        # written only via the dedicated final-qc action, matching the
        # Final QC & QR module's own endpoint (Final_QC_QR_Module.md).
        read_only_fields = [
            "id", "status", "rejectionReason", "goodsName", "finalPrice", "fabricDetails",
            "productQrGenerated", "productQrPayload", "cartonQrGenerated", "cartonQrPayload",
            "createdBy", "reviewedBy", "reviewedAt", "createdAt", "updatedAt",
        ]

    def create(self, validated_data):
        from apps.sourcing.services import compute_variant_derived

        variants_data = validated_data.pop("variants", [])
        validated_data["createdBy"] = self.context["request"].user
        product = Product.objects.create(**validated_data)
        for variant_data in variants_data:
            variant = ProductVariant(product=product, **variant_data)
            compute_variant_derived(variant)
            variant.save()
        return product

    def update(self, instance, validated_data):
        """Edit form lets Admin correct any field, including per-color rows
        entered at intake — variants (when present in the payload) are fully
        replaced rather than diffed/matched by id, same pattern as create();
        no other model references ProductVariant rows directly, so this is
        safe."""
        from apps.sourcing.services import compute_variant_derived

        variants_data = validated_data.pop("variants", None)
        instance = super().update(instance, validated_data)
        if variants_data is not None:
            instance.variants.all().delete()
            for variant_data in variants_data:
                variant = ProductVariant(product=instance, **variant_data)
                compute_variant_derived(variant)
                variant.save()
        return instance


class ProductSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — read-only, no internal review/QR-flag/reject-reason
    plumbing exposed."""

    variants = ProductVariantSerializer(many=True, read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    totalOrderQty = serializers.IntegerField(source="total_order_qty", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "styleNumber", "name", "brandName", "poNo", "status",
            "goodsName", "fabricDetails", "variants", "images", "totalOrderQty", "createdAt",
        ]
        read_only_fields = fields


class RejectProductSerializer(serializers.Serializer):
    reason = serializers.CharField(allow_blank=False)


class SourcingLocationEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = SourcingLocationEntry
        fields = ["id", "sourcingTrip", "locationName", "quantity", "advanceAmount", "status", "date", "reportedAt", "createdAt", "updatedAt"]
        read_only_fields = ["id", "sourcingTrip", "status", "reportedAt", "createdAt", "updatedAt"]

    def validate(self, attrs):
        trip = self.context.get("trip") or getattr(self.instance, "sourcingTrip", None)
        if trip and trip.status == "closed":
            raise serializers.ValidationError("Cannot modify locations on a closed Sourcing Trip.")
        if self.instance and self.instance.status == "reported":
            raise serializers.ValidationError(
                "Cannot modify a location that has already been reported — its advance is already recorded as an expense."
            )
        return attrs


class SourcingTripSerializer(serializers.ModelSerializer):
    """Admin/staff-facing."""

    locations = SourcingLocationEntrySerializer(many=True, required=False)
    productName = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = SourcingTrip
        fields = ["id", "product", "productName", "status", "fullPaymentConfirmedAt", "locations", "createdAt", "updatedAt"]
        read_only_fields = ["id", "status", "fullPaymentConfirmedAt", "createdAt", "updatedAt"]

    def create(self, validated_data):
        locations_data = validated_data.pop("locations", [])
        trip = SourcingTrip.objects.create(**validated_data)
        for location in locations_data:
            SourcingLocationEntry.objects.create(sourcingTrip=trip, **location)
        return trip


class SourcingTripSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — BR-15 / FR-71: live read-only trip progress."""

    locations = SourcingLocationEntrySerializer(many=True, read_only=True)
    productName = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = SourcingTrip
        fields = ["id", "productName", "status", "fullPaymentConfirmedAt", "locations", "createdAt"]
        read_only_fields = fields

from rest_framework import serializers

from sourcing.models import SourcingRequest, SourcingVariant


class SourcingVariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = SourcingVariant
        fields = ["id", "styleNo", "buyer", "poNo", "color", "itemNumber", "size", "qtyOrdered"]
        read_only_fields = ["id"]


class SourcingRequestSerializer(serializers.ModelSerializer):
    variants = SourcingVariantSerializer(many=True, required=False)
    createdByName = serializers.CharField(source="createdBy.display_name", read_only=True)
    reviewedByName = serializers.CharField(source="reviewedBy.display_name", read_only=True, default=None)

    class Meta:
        model = SourcingRequest
        fields = [
            "id", "productName", "photoUrl", "packingListNotes", "status", "rejectionReason",
            "createdBy", "createdByName", "reviewedBy", "reviewedByName", "reviewedAt",
            "sisterProfile", "brandName", "styleNumber", "goodsName", "fabricDetails", "price",
            "imageUrls", "variants", "createdAt", "updatedAt",
        ]
        read_only_fields = ["id", "status", "rejectionReason", "reviewedBy", "reviewedAt", "styleNumber", "createdAt", "updatedAt"]

    def create(self, validated_data):
        variants_data = validated_data.pop("variants", [])
        validated_data["createdBy"] = self.context["request"].user
        req = SourcingRequest.objects.create(**validated_data)
        for v in variants_data:
            SourcingVariant.objects.create(request=req, **v)
        return req

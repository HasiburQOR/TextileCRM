from rest_framework import serializers

from apps.packing.models import PackingRule


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


class GenerateVariantRowsSerializer(serializers.Serializer):
    """Input for the "auto-generate intake rows from a rule" preview
    (FR-19, restated for the merged model). Output rows are ProductVariant-
    shaped dicts the client posts back as the Product's variants."""

    product = serializers.UUIDField()
    packingRule = serializers.UUIDField()
    startCartonNo = serializers.IntegerField(min_value=1, default=1)
    colors = serializers.ListField(child=serializers.DictField(), allow_empty=False)

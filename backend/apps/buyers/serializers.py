from rest_framework import serializers

from apps.buyers.models import AGREEMENT_TYPE_RATE_KEYS, BuyerProfile, SisterProfile


class BuyerProfileSerializer(serializers.ModelSerializer):
    """Admin/staff-facing — full detail."""

    sisterProfileCount = serializers.IntegerField(source="sisterProfiles.count", read_only=True)

    class Meta:
        model = BuyerProfile
        fields = ["id", "name", "contactInfo", "branding", "sisterProfileCount", "createdAt", "updatedAt"]
        read_only_fields = ["id", "createdAt", "updatedAt"]


class BuyerProfileSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — deliberately lighter than BuyerProfileSerializer per
    the DRF doc's instruction not to reuse admin serializers with
    client-side-hidden fields for the Buyer Portal."""

    class Meta:
        model = BuyerProfile
        fields = ["id", "name", "branding"]
        read_only_fields = fields


class SisterProfileSerializer(serializers.ModelSerializer):
    """Admin/staff-facing — full detail, including agreement config."""

    buyerProfileName = serializers.CharField(source="buyerProfile.name", read_only=True)
    rateLocked = serializers.BooleanField(source="is_rate_locked", read_only=True)

    class Meta:
        model = SisterProfile
        fields = [
            "id", "buyerProfile", "buyerProfileName", "poReference", "agreementType",
            "agreementRateConfig", "status", "rateLocked", "createdAt", "updatedAt",
        ]
        read_only_fields = ["id", "createdAt", "updatedAt"]

    def validate(self, attrs):
        agreement_type = attrs.get("agreementType", getattr(self.instance, "agreementType", None))
        rate_config = attrs.get("agreementRateConfig", getattr(self.instance, "agreementRateConfig", None))
        required_key = AGREEMENT_TYPE_RATE_KEYS.get(agreement_type)
        if required_key and (not isinstance(rate_config, dict) or required_key not in rate_config):
            raise serializers.ValidationError(
                {"agreementRateConfig": f"Agreement Type {agreement_type} requires a '{required_key}' rate."}
            )
        if self.instance and self.instance.is_rate_locked():
            if attrs.get("agreementType", self.instance.agreementType) != self.instance.agreementType:
                raise serializers.ValidationError({"agreementType": "Locked — cost entries already exist."})
            if attrs.get("agreementRateConfig", self.instance.agreementRateConfig) != self.instance.agreementRateConfig:
                raise serializers.ValidationError({"agreementRateConfig": "Locked — cost entries already exist."})
        return attrs


class SisterProfileSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — read-only, no agreementRateConfig internals exposed
    beyond what the buyer needs to see their own deal type."""

    buyerProfileName = serializers.CharField(source="buyerProfile.name", read_only=True)

    class Meta:
        model = SisterProfile
        fields = ["id", "buyerProfileName", "poReference", "agreementType", "status", "createdAt"]
        read_only_fields = fields

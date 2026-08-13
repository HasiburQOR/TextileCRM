from django.contrib.auth.hashers import make_password
from rest_framework import serializers

from buyers.models import BuyerProfile, SisterProfile


class BuyerProfileSerializer(serializers.ModelSerializer):
    sisterProfileCount = serializers.IntegerField(source="sisterProfiles.count", read_only=True)
    portalPassword = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = BuyerProfile
        fields = [
            "id", "name", "contactInfo", "branding", "portalUsername",
            "sisterProfileCount", "portalPassword", "createdAt", "updatedAt",
        ]
        read_only_fields = ["id", "createdAt", "updatedAt"]

    def create(self, validated_data):
        password = validated_data.pop("portalPassword", None)
        validated_data["portalPasswordHash"] = make_password(password or "changeme")
        return super().create(validated_data)


class SisterProfileSerializer(serializers.ModelSerializer):
    buyerProfileName = serializers.CharField(source="buyerProfile.name", read_only=True)

    class Meta:
        model = SisterProfile
        fields = [
            "id", "buyerProfile", "buyerProfileName", "name", "poReference", "agreementType",
            "negotiatedRate", "terms", "status", "createdAt", "updatedAt",
        ]
        read_only_fields = ["id", "createdAt", "updatedAt"]

    def update(self, instance, validated_data):
        changing = (
            "agreementType" in validated_data and validated_data["agreementType"] != instance.agreementType
        ) or ("negotiatedRate" in validated_data and validated_data["negotiatedRate"] != instance.negotiatedRate)
        if changing and instance.has_expenses():
            raise serializers.ValidationError("Cannot change agreement type or rate when expenses exist.")
        return super().update(instance, validated_data)

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.accounts.models import Roles, User


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Embeds role + buyer_profile_id as token claims so the Admin app, Buyer
    Portal app, and future Flutter app can all route/gate UI without an
    extra round-trip — the API itself remains the source of truth via
    TenantScopedViewSet regardless of what the client trusts from the token.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["buyer_profile_id"] = str(user.buyer_profile_id) if user.buyer_profile_id else None
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["role"] = self.user.role
        data["buyer_profile_id"] = str(self.user.buyer_profile_id) if self.user.buyer_profile_id else None
        return data


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "name", "role", "buyer_profile", "is_active", "createdAt"]
        read_only_fields = ["id", "createdAt"]


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, required=False)

    class Meta:
        model = User
        fields = ["id", "username", "email", "name", "role", "buyer_profile", "is_active", "password"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        if self.instance is None and "password" not in attrs:
            raise serializers.ValidationError({"password": "Required when creating a user."})
        role = attrs.get("role", getattr(self.instance, "role", None))
        buyer_profile = attrs.get("buyer_profile", getattr(self.instance, "buyer_profile_id", None))
        if role == Roles.BUYER and not buyer_profile:
            raise serializers.ValidationError({"buyer_profile": "Required when role is 'buyer'."})
        if role != Roles.BUYER and buyer_profile:
            raise serializers.ValidationError({"buyer_profile": "Only allowed when role is 'buyer'."})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=["password"])
        return user

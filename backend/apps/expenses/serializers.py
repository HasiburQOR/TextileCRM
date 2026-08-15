from rest_framework import serializers

from apps.expenses.models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    sisterProfilePoReference = serializers.CharField(source="sisterProfile.poReference", read_only=True)
    buyerProfile = serializers.CharField(source="sisterProfile.buyerProfile_id", read_only=True)
    buyerProfileName = serializers.CharField(source="sisterProfile.buyerProfile.name", read_only=True)
    productName = serializers.CharField(source="product.name", read_only=True, default=None)
    createdByName = serializers.CharField(source="createdBy.display_name", read_only=True, default="")

    class Meta:
        model = Expense
        fields = [
            "id", "sisterProfile", "sisterProfilePoReference", "buyerProfile", "buyerProfileName",
            "product", "productName", "sourceType", "amount", "currency", "remarks", "fieldName",
            "createdBy", "createdByName", "createdAt",
        ]
        read_only_fields = ["id", "createdBy", "createdAt"]


class ExpenseSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — BR-55/FR-80: expense summary per Sister Profile."""

    class Meta:
        model = Expense
        fields = ["id", "sourceType", "amount", "currency", "remarks", "createdAt"]
        read_only_fields = fields

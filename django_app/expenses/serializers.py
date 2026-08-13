from rest_framework import serializers

from expenses.models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    sisterProfileName = serializers.CharField(source="sisterProfile.name", read_only=True)

    class Meta:
        model = Expense
        fields = [
            "id", "sisterProfile", "sisterProfileName", "productId", "sourceType", "amount",
            "currency", "remarks", "fieldName", "createdBy", "createdAt",
        ]
        read_only_fields = ["id", "createdBy", "createdAt"]

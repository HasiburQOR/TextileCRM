from rest_framework import serializers

from apps.ledger.models import SettlementLedger


class SettlementLedgerSerializer(serializers.ModelSerializer):
    sisterProfilePoReference = serializers.CharField(source="sisterProfile.poReference", read_only=True)
    buyerName = serializers.CharField(source="sisterProfile.buyerProfile.name", read_only=True)
    agreementType = serializers.CharField(source="sisterProfile.agreementType", read_only=True)

    class Meta:
        model = SettlementLedger
        fields = [
            "sisterProfile", "sisterProfilePoReference", "buyerName", "agreementType",
            "totalAdvance", "totalExpense", "amountOwed", "netPosition", "negativeBalance", "updatedAt",
        ]
        read_only_fields = fields

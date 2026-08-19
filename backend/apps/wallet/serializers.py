from rest_framework import serializers

from apps.expenses.models import SourceType
from apps.wallet.models import BuyerWallet, WalletTransaction

# Human-readable label for every sourceType value a WalletTransaction can
# carry — Expense.SourceType's labels plus the two wallet-only values.
SOURCE_TYPE_LABELS = dict(SourceType.choices)
SOURCE_TYPE_LABELS.update({"manual_top_up": "Top-up", "manual_adjustment": "Manual Adjustment"})


def _rate_label(txn: WalletTransaction) -> str:
    """The rate this row was converted at, in the direction it was agreed —
    "1 USD = 120 BDT". Empty when no conversion applied, so the UI can omit
    the column rather than print a meaningless 1.0."""
    if not txn.exchangeRateUsed or not txn.sourceCurrency:
        return ""
    return f"1 {txn.currency} = {txn.exchangeRateUsed.normalize():f} {txn.sourceCurrency}"


def _describe(txn: WalletTransaction) -> str:
    """UI Requirements: 'Each deduction row should be understandable to a
    buyer without jargon — e.g. "Warehouse packaging — PO 002F25BV —
    $45.00" rather than raw source_type enum values.' Reused for the Admin
    view's Source column too, same description either side."""
    label = SOURCE_TYPE_LABELS.get(txn.sourceType) or txn.get_type_display()
    if txn.sisterProfile_id:
        po = txn.sisterProfile.poReference or str(txn.sisterProfile_id)
        return f"{label} — PO {po}"
    return label


class WalletSerializer(serializers.ModelSerializer):
    """Admin/staff-facing."""

    buyerProfileName = serializers.CharField(source="buyerProfile.name", read_only=True)

    class Meta:
        model = BuyerWallet
        fields = [
            "buyerProfile", "buyerProfileName", "currency", "balance",
            "negativeBalance", "lowBalance", "lowBalanceThreshold", "createdAt", "updatedAt",
        ]
        read_only_fields = ["buyerProfile", "buyerProfileName", "balance", "negativeBalance", "lowBalance", "createdAt", "updatedAt"]


class WalletSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — read-only, no lowBalanceThreshold internals."""

    class Meta:
        model = BuyerWallet
        fields = ["currency", "balance", "negativeBalance", "updatedAt"]
        read_only_fields = fields


class WalletTransactionSerializer(serializers.ModelSerializer):
    """Admin/staff-facing — full detail, including sourceExpense traceability."""

    sisterProfilePoReference = serializers.CharField(source="sisterProfile.poReference", read_only=True, default=None)
    createdByName = serializers.CharField(source="createdBy.display_name", read_only=True, default=None)
    description = serializers.SerializerMethodField()
    rateLabel = serializers.SerializerMethodField()

    class Meta:
        model = WalletTransaction
        fields = [
            "id", "wallet", "type", "amount", "currency",
            "sourceAmount", "sourceCurrency", "exchangeRateUsed", "rateLabel",
            "sourceType", "description",
            "sourceExpense", "sisterProfile", "sisterProfilePoReference", "methodReference", "reason",
            "createdBy", "createdByName", "createdAt",
        ]
        read_only_fields = fields

    def get_description(self, obj) -> str:
        return _describe(obj)

    def get_rateLabel(self, obj) -> str:
        return _rate_label(obj)


class WalletTransactionSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — human-readable source description, no internal ids.
    Carries both currencies: the buyer sees what the cost was on the ground
    (sourceAmount) as well as what came off their own balance (amount)."""

    description = serializers.SerializerMethodField()
    rateLabel = serializers.SerializerMethodField()
    sisterProfilePoReference = serializers.CharField(source="sisterProfile.poReference", read_only=True, default=None)

    class Meta:
        model = WalletTransaction
        fields = [
            "id", "type", "amount", "currency", "sourceAmount", "sourceCurrency", "exchangeRateUsed",
            "rateLabel", "description", "sisterProfilePoReference", "createdAt",
        ]
        read_only_fields = fields

    def get_description(self, obj) -> str:
        return _describe(obj)

    def get_rateLabel(self, obj) -> str:
        return _rate_label(obj)

    def get_description(self, obj) -> str:
        return _describe(obj)

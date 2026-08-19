from rest_framework import serializers

from apps.buyers.models import BuyerProfile, SisterProfile


class BuyerProfileSerializer(serializers.ModelSerializer):
    """Admin/staff-facing — full detail."""

    sisterProfileCount = serializers.IntegerField(source="sisterProfiles.count", read_only=True)

    class Meta:
        model = BuyerProfile
        fields = ["id", "referenceCode", "name", "contactInfo", "branding", "sisterProfileCount", "createdAt", "updatedAt"]
        read_only_fields = ["id", "createdAt", "updatedAt"]


class BuyerProfileSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — deliberately lighter than BuyerProfileSerializer per
    the DRF doc's instruction not to reuse admin serializers with
    client-side-hidden fields for the Buyer Portal."""

    class Meta:
        model = BuyerProfile
        fields = ["id", "referenceCode", "name", "branding"]
        read_only_fields = fields


class SisterProfileSerializer(serializers.ModelSerializer):
    """Admin/staff-facing — full detail, including the currency config."""

    buyerProfileName = serializers.CharField(source="buyerProfile.name", read_only=True)
    rateLocked = serializers.BooleanField(source="is_rate_locked", read_only=True)

    class Meta:
        model = SisterProfile
        fields = [
            "id", "referenceCode", "buyerProfile", "buyerProfileName", "poReference", "agreementType",
            "supplierCurrency", "buyerCurrency", "exchangeRate", "status", "rateLocked", "createdAt", "updatedAt",
        ]
        read_only_fields = ["id", "createdAt", "updatedAt"]

    def _effective(self, attrs, field):
        """The value this write will end up storing. On create, a field the
        client omitted falls back to the model default (not to an empty
        string) — otherwise a POST that simply doesn't mention
        supplierCurrency is rejected for being blank when the model would
        have happily defaulted it to BDT, and the real error further down
        (a negative rate) never gets reported."""
        if field in attrs:
            return attrs[field]
        if self.instance is not None:
            return getattr(self.instance, field)
        return SisterProfile._meta.get_field(field).get_default()

    def validate(self, attrs):
        errors = {}
        for field, label in (("supplierCurrency", "supplier"), ("buyerCurrency", "buyer")):
            if not (self._effective(attrs, field) or "").strip():
                errors[field] = f"A {label} currency is required."
        rate = self._effective(attrs, "exchangeRate")
        if rate is not None and rate < 0:
            errors["exchangeRate"] = "Exchange rate cannot be negative."

        # The Buyer Wallet is pooled across ALL of a buyer's Sister Profiles
        # and holds ONE currency, while `balance` is a materialized sum of
        # its transaction amounts. Every cost on this profile is converted
        # into buyerCurrency and summed into that balance — so a profile
        # naming a different buyer currency than its own buyer's wallet
        # would add, say, EUR into a USD total and make the balance
        # meaningless. Supplier currency may vary per profile freely; the
        # buyer side may not.
        buyer_profile = attrs.get("buyerProfile") or getattr(self.instance, "buyerProfile", None)
        buyer_currency = self._effective(attrs, "buyerCurrency")
        wallet = getattr(buyer_profile, "wallet", None) if buyer_profile else None
        if wallet and buyer_currency and buyer_currency != wallet.currency:
            errors["buyerCurrency"] = (
                f"{buyer_profile.name}'s wallet is held in {wallet.currency}. Every Sister Profile under a buyer "
                f"must use that same buyer currency, because the wallet balance is pooled across all of them."
            )

        if errors:
            raise serializers.ValidationError(errors)
        if self.instance and self.instance.is_rate_locked():
            if attrs.get("supplierCurrency", self.instance.supplierCurrency) != self.instance.supplierCurrency:
                raise serializers.ValidationError({"supplierCurrency": "Locked — cost entries already exist."})
            if attrs.get("buyerCurrency", self.instance.buyerCurrency) != self.instance.buyerCurrency:
                raise serializers.ValidationError({"buyerCurrency": "Locked — cost entries already exist."})
            if attrs.get("exchangeRate", self.instance.exchangeRate) != self.instance.exchangeRate:
                raise serializers.ValidationError({"exchangeRate": "Locked — cost entries already exist."})
        return attrs


class SisterProfileSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — read-only; the deal type plus the currency pair the
    buyer's invoices will be quoted in, nothing internal."""

    buyerProfileName = serializers.CharField(source="buyerProfile.name", read_only=True)

    class Meta:
        model = SisterProfile
        fields = [
            "id", "referenceCode", "buyerProfileName", "poReference", "agreementType",
            "supplierCurrency", "buyerCurrency", "exchangeRate", "status", "createdAt",
        ]
        read_only_fields = fields

from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel
from apps.core.utils import generate_reference_code


def generate_buyer_reference_code() -> str:
    return generate_reference_code("BUY")


def generate_sister_profile_reference_code() -> str:
    return generate_reference_code("SIS")


class BuyerProfile(UUIDModel, TimeStampedModel):
    """Top-level tenant (BRD 4.1). Portal login credentials live on
    accounts.User (role='buyer', buyer_profile FK) — not here — so the whole
    system has exactly one auth/JWT mechanism (see accounts app docstrings
    and the DRF Migration Instructions, Section 2)."""

    name = models.CharField(max_length=255)
    contactInfo = models.TextField(blank=True, default="")
    branding = models.CharField(max_length=255, blank=True, default="")

    # Reference_Numbers_Identifier_System.md: "BUY-0001" — auto-generated,
    # manually overridable at creation (see BuyerProfileViewSet.perform_create
    # for the collision-handling story). Distinct from every other
    # buyer/order-adjacent identifier — see the Identifier Glossary in that doc.
    referenceCode = models.CharField(max_length=32, unique=True, default=generate_buyer_reference_code)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class AgreementType(models.TextChoices):
    # Label matches the actual formula in apps.ledger.services.recompute_settlement:
    # amountOwed = totalExpense * (percentage_rate / 100) — a percentage of
    # sourcing expense, not of purchase/goods value (see BRD §4.3).
    TYPE_1 = "1", "Type 1 — % of sourcing expense"
    TYPE_2 = "2", "Type 2 — fixed rate per unit"
    TYPE_3 = "3", "Type 3 — reimburse + commission"


# Required key(s) in `agreementRateConfig` per Agreement Type (BRD 4.3).
AGREEMENT_TYPE_RATE_KEYS = {
    AgreementType.TYPE_1: "percentage_rate",
    AgreementType.TYPE_2: "rate_per_unit",
    AgreementType.TYPE_3: "commission_percentage",
}


class SisterProfileStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class SisterProfile(UUIDModel, TimeStampedModel):
    """One Purchase Order / shipment nested under a BuyerProfile (BRD 4.2).
    Every downstream record in later phases (products, sourcing trips,
    costs, invoices) is scoped to a SisterProfile's buyerProfile_id."""

    buyerProfile = models.ForeignKey(BuyerProfile, related_name="sisterProfiles", on_delete=models.CASCADE)
    # Reference_Numbers_Identifier_System.md: "SIS-0001" — auto-generated,
    # manually overridable. Deliberately separate from `poReference` below:
    # this is an internal tracking id, poReference is the buyer's own
    # real-world PO number — never merge or auto-fill one from the other.
    referenceCode = models.CharField(max_length=32, unique=True, default=generate_sister_profile_reference_code)
    poReference = models.CharField(max_length=255, blank=True, default="")
    agreementType = models.CharField(max_length=1, choices=AgreementType.choices)
    # e.g. {"percentage_rate": 8} / {"rate_per_unit": 1.5} / {"commission_percentage": 5}
    agreementRateConfig = models.JSONField(default=dict)
    status = models.CharField(max_length=16, choices=SisterProfileStatus.choices, default=SisterProfileStatus.ACTIVE)

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return f"{self.poReference or self.id} ({self.buyerProfile.name})"

    def is_rate_locked(self) -> bool:
        """FR-66: agreement type/rate become immutable once cost entries
        exist."""
        return self.expenses.exists()

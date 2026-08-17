from decimal import ROUND_HALF_UP, Decimal

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
    """Label-only: the agreement type itself carries no rate any more. The
    commission rate is entered per invoice at creation time, mapped from the
    type (1 → percentage of sourcing expense, 2 → fixed rate per unit,
    3 → reimburse expenses + commission percentage) — see
    apps.invoicing.services.create_invoice."""

    TYPE_1 = "1", "Type 1 — % of sourcing expense"
    TYPE_2 = "2", "Type 2 — fixed rate per unit"
    TYPE_3 = "3", "Type 3 — reimburse + commission"


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
    # Label-only (see AgreementType above) — the rate lives on each invoice.
    agreementType = models.CharField(max_length=1, choices=AgreementType.choices)

    # ── Currency configuration ────────────────────────────────────────────
    # Moved here from the per-invoice exchange-rate flow: one currency pair
    # and one rate per order, set when the deal is struck. Every invoice
    # generated for this profile snapshots these three values at creation
    # (FR-57's lock-at-generation discipline), so later edits never rewrite
    # a financial document that was already issued.
    # The currency the supplier side prices things in (expenses, line items).
    supplierCurrency = models.CharField(max_length=8, default="BDT")
    # The currency the buyer pays / reads totals in.
    buyerCurrency = models.CharField(max_length=8, default="USD")
    # Quoted as "1 buyer = <rate> supplier" (e.g. 1 USD = 120 BDT) — the way
    # a rate is written by hand on a commercial invoice. Converting supplier
    # → buyer therefore DIVIDES by it (see convert_to_buyer_currency).
    exchangeRate = models.DecimalField(max_digits=14, decimal_places=6, default=0)

    status = models.CharField(max_length=16, choices=SisterProfileStatus.choices, default=SisterProfileStatus.ACTIVE)

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return f"{self.poReference or self.id} ({self.buyerProfile.name})"

    def is_rate_locked(self) -> bool:
        """FR-66: the currency configuration (currencies + rate) becomes
        immutable once cost entries exist."""
        return self.expenses.exists()

    def convert_to_buyer_currency(self, amount):
        """`amount` (in supplierCurrency) expressed in buyerCurrency, i.e.
        divided by the rate ("1 buyer = X supplier"). Returns None when no
        rate is set, so callers can omit the converted figure entirely
        rather than print a misleading 0.00."""
        rate = Decimal(self.exchangeRate or 0)
        if not rate:
            return None
        converted = Decimal(amount or 0) / rate
        return converted.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

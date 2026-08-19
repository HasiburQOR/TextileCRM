import uuid

from django.conf import settings
from django.db import models


class UUIDModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(models.Model):
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class CompanyProfile(models.Model):
    """Our own company's identity and bank details — the exporter side of
    every Commercial Invoice / Packing List we issue.

    A singleton: exactly one row, always pk=1 (see `load()`). A company has
    one letterhead and one set of bank details, and an invoice renderer that
    had to guess which of several rows to print would be a bug waiting to
    happen. Deliberately left blank on install — a real invoice carrying
    placeholder bank details is far worse than one that visibly needs
    filling in, so `is_complete()` gates the export instead of defaults.
    """

    SINGLETON_PK = 1

    # Deliberately no `default=` on the pk: when a pk field has a default and
    # the instance is new, Django skips its UPDATE-then-INSERT probe and goes
    # straight to INSERT — which makes the second `objects.create()` collide
    # with the singleton row instead of updating it. save() sets the pk below.
    id = models.PositiveSmallIntegerField(primary_key=True, editable=False)

    # ── Letterhead ──────────────────────────────────────────────────
    name = models.CharField(max_length=255, blank=True, default="")
    tagline = models.CharField(max_length=255, blank=True, default="")  # e.g. "(Export, Import, Supply & Manufacturer)"
    logo = models.ImageField(upload_to="company/", null=True, blank=True)
    # Printed bottom-right of every invoice, above the signatory's name —
    # the same "upload once, reuse on every document" pattern as `logo`.
    sealSignature = models.ImageField(upload_to="company/", null=True, blank=True)
    addressLine = models.TextField(blank=True, default="")
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=64, blank=True, default="")
    # The person named on the Commercial Invoice header ("Contact Person /
    # TEL:" block) — often a merchandiser, not whoever's phone is on file.
    contactPerson = models.CharField(max_length=128, blank=True, default="")
    registrationNo = models.CharField(max_length=64, blank=True, default="")  # BIN/trade licence, printed under the name

    # ── Bank details (printed in the invoice footer) ────────────────
    bankName = models.CharField(max_length=255, blank=True, default="")
    bankAccountTitle = models.CharField(max_length=255, blank=True, default="")
    bankAccountNo = models.CharField(max_length=64, blank=True, default="")
    bankSwiftCode = models.CharField(max_length=32, blank=True, default="")
    bankAddress = models.TextField(blank=True, default="")

    updatedAt = models.DateTimeField(auto_now=True)
    updatedBy = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="companyProfileEdits", null=True, blank=True, on_delete=models.SET_NULL
    )

    class Meta:
        verbose_name = "Company profile"
        verbose_name_plural = "Company profile"

    def __str__(self):
        return self.name or "Company profile (not yet filled in)"

    def save(self, *args, force_insert=False, **kwargs):
        """Force the singleton pk so a stray `CompanyProfile.objects.create()`
        anywhere updates the one row instead of quietly starting a second
        identity that half the exports would then disagree about.

        `force_insert` is deliberately swallowed: `objects.create()` always
        passes it, which would skip Django's UPDATE-then-INSERT probe and
        turn the second create() into a duplicate-pk IntegrityError instead
        of an update.
        """
        self.id = self.SINGLETON_PK
        super().save(*args, force_insert=False, **kwargs)

    def delete(self, *args, **kwargs):
        raise NotImplementedError("The company profile is a singleton — clear its fields instead of deleting it.")

    @classmethod
    def load(cls) -> "CompanyProfile":
        """Always returns a row, creating the blank singleton on first call,
        so callers never branch on None."""
        obj, _ = cls.objects.get_or_create(pk=cls.SINGLETON_PK)
        return obj

    def missing_fields(self) -> list[str]:
        """Which identity/bank fields a customer-facing document needs but
        doesn't have yet. `tagline`, `logo` and `registrationNo` are
        genuinely optional and excluded."""
        required = {
            "name": "Company name", "addressLine": "Address", "phone": "Phone",
            "bankName": "Bank name", "bankAccountTitle": "Account title",
            "bankAccountNo": "Account number", "bankSwiftCode": "SWIFT code",
        }
        return [label for field, label in required.items() if not getattr(self, field)]

    def is_complete(self) -> bool:
        return not self.missing_fields()


class SequenceCounter(models.Model):
    """Backs atomic, gap-free sequential codes like QC-2026-001. A plain
    `count() + 1` (the original Next.js prototype's approach) is not
    race-safe under concurrent requests; this + select_for_update() is."""

    key = models.CharField(max_length=64, primary_key=True)
    value = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.key}={self.value}"

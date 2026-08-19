from django.db import models

from core.models import TimeStampedModel, UUIDModel


class BuyerProfile(UUIDModel, TimeStampedModel):
    name = models.CharField(max_length=255)
    contactInfo = models.TextField(blank=True, default="")
    branding = models.CharField(max_length=255, blank=True, default="")
    portalUsername = models.CharField(max_length=150, unique=True)
    portalPasswordHash = models.CharField(max_length=255)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class AgreementType(models.TextChoices):
    TYPE_1 = "TYPE_1", "Type 1 (% Commission)"
    TYPE_2 = "TYPE_2", "Type 2 (Per Unit)"
    TYPE_3 = "TYPE_3", "Type 3 (Reimburse + Commission)"


class SisterProfileStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"


class SisterProfile(UUIDModel, TimeStampedModel):
    buyerProfile = models.ForeignKey(BuyerProfile, related_name="sisterProfiles", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    poReference = models.CharField(max_length=255, blank=True, default="")
    agreementType = models.CharField(max_length=16, choices=AgreementType.choices, default=AgreementType.TYPE_1)
    negotiatedRate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    terms = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=SisterProfileStatus.choices, default=SisterProfileStatus.ACTIVE)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.buyerProfile.name})"

    def has_expenses(self) -> bool:
        return self.expense_set.exists()

from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.core.models import UUIDModel


class Roles(models.TextChoices):
    ADMIN = "admin", "Admin"
    COMPANY_REP = "company_rep", "Company Representative"
    QC = "qc", "QC Person"
    WAREHOUSE = "warehouse", "Warehouse Manager"
    EMPLOYEE = "employee", "Employee"
    MANAGEMENT = "management", "Management"
    BUYER = "buyer", "Buyer"


SUPPLIER_ROLES = [
    Roles.ADMIN,
    Roles.COMPANY_REP,
    Roles.QC,
    Roles.WAREHOUSE,
    Roles.EMPLOYEE,
    Roles.MANAGEMENT,
]


class User(UUIDModel, AbstractUser):
    role = models.CharField(max_length=16, choices=Roles.choices, default=Roles.EMPLOYEE)
    name = models.CharField(max_length=255, blank=True, default="")

    # Only meaningful when role == Roles.BUYER — ties a portal login to
    # exactly one BuyerProfile. Every buyer-scoped viewset filters on this.
    buyer_profile = models.ForeignKey(
        "buyers.BuyerProfile",
        related_name="portal_users",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )

    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    def display_name(self) -> str:
        return self.name or self.get_full_name() or self.username

    def __str__(self):
        return f"{self.display_name()} ({self.role})"

from django.contrib.auth.models import AbstractUser
from django.db import models

from core.models import UUIDModel


class Roles(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    COMPANY_REP = "COMPANY_REP", "Company Rep"
    QC_PERSON = "QC_PERSON", "QC Person"
    WAREHOUSE_MANAGER = "WAREHOUSE_MANAGER", "Warehouse Manager"


class User(UUIDModel, AbstractUser):
    role = models.CharField(max_length=32, choices=Roles.choices, default=Roles.COMPANY_REP)
    name = models.CharField(max_length=255, blank=True, default="")
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    def display_name(self) -> str:
        return self.name or self.get_full_name() or self.username

    def __str__(self):
        return f"{self.display_name()} ({self.role})"

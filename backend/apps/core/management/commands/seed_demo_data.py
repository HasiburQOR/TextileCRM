from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.accounts.models import Roles


class Command(BaseCommand):
    help = "Create demo users if they don't already exist."

    def handle(self, *args, **options):
        User = get_user_model()

        if User.objects.filter(username="admin").exists():
            self.stdout.write(self.style.WARNING("Demo users already present — skipping seed."))
            return

        users_data = [
            ("admin",  "admin123", Roles.ADMIN,        True,  "Admin User",      "admin@company.com"),
            ("hasib",  "pass123",  Roles.COMPANY_REP,  False, "Hasib Rahman",    "hasib@company.com"),
            ("karim",  "pass123",  Roles.QC,            False, "Karim Hossain",   "karim@company.com"),
            ("rahim",  "pass123",  Roles.WAREHOUSE,     False, "Rahim Uddin",     "rahim@company.com"),
        ]

        for username, password, role, is_staff, name, email in users_data:
            user = User.objects.create_user(
                username=username, email=email, password=password, role=role, name=name
            )
            if is_staff:
                user.is_staff = True
                user.is_superuser = True
                user.save(update_fields=["is_staff", "is_superuser"])

        self.stdout.write(self.style.SUCCESS(f"Created {len(users_data)} demo users."))

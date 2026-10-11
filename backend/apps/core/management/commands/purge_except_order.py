"""
Delete all order data EXCEPT one Sister Profile (order), e.g. to clear test
data out of a database that has gone live.

    python manage.py purge_except_order --keep SIS-0011            # dry run
    python manage.py purge_except_order --keep SIS-0011 --execute  # for real

Kept:   the named order and everything under it, the Buyer Profile that owns
        it (with its wallet and full transaction history), every user
        account, company profile, exchange rates, product templates/fields,
        the audit log, and the reference-number counters (so numbering never
        restarts and never re-issues a number that was already used).
Removed: every other order (products, QC, packing lists, warehouse costs,
        expenses, sourcing costs, invoices + payments, documents,
        notifications) and every other Buyer Profile (with its wallet,
        packing rules and portal logins).

Runs in one transaction. Without --execute it rolls back after reporting what
it would have deleted. TAKE A DATABASE BACKUP FIRST — this cannot be undone.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models.deletion import ProtectedError

from apps.buyers.models import BuyerProfile, SisterProfile
from apps.documents.models import DocumentVaultItem
from apps.expenses.models import Expense
from apps.invoicing.models import Invoice
from apps.notifications.models import Notification
from apps.packing.models import PackingList, PackingRule
from apps.qc.models import QCReport
from apps.sourcing.models import Product, SourcingCost
from apps.warehouse.models import WarehouseCost


class _DryRun(Exception):
    pass


class Command(BaseCommand):
    help = "Delete all orders and buyers except the one named by --keep (dry run unless --execute)."

    def add_arguments(self, parser):
        parser.add_argument("--keep", required=True, help="Reference code of the order to keep, e.g. SIS-0011")
        parser.add_argument("--execute", action="store_true", help="Actually delete (default is a dry run).")

    def handle(self, *args, **options):
        code = options["keep"].strip()
        keep = SisterProfile.objects.select_related("buyerProfile").filter(referenceCode=code).first()
        if not keep:
            raise CommandError(f"No order with reference code {code!r} — nothing deleted.")
        keep_buyer = keep.buyerProfile

        self.stdout.write(f"Keeping order {keep.referenceCode} (PO {keep.poReference or '-'}) of buyer "
                          f"{keep_buyer.referenceCode} {keep_buyer.name!r}.")
        # The buyer's other orders go too — say so, since that's the surprising part.
        siblings = SisterProfile.objects.filter(buyerProfile=keep_buyer).exclude(pk=keep.pk)
        if siblings.exists():
            self.stdout.write(self.style.WARNING(
                f"This buyer has {siblings.count()} other order(s); they will be deleted too: "
                + ", ".join(siblings.values_list("referenceCode", flat=True))
            ))

        try:
            with transaction.atomic():
                self._purge(keep, keep_buyer)
                if not options["execute"]:
                    raise _DryRun
        except _DryRun:
            self.stdout.write(self.style.WARNING("\nDRY RUN — nothing was deleted. Re-run with --execute to apply."))
            return
        except ProtectedError as exc:
            raise CommandError(f"Blocked by a protected record, nothing deleted: {exc}") from exc

        self.stdout.write(self.style.SUCCESS("\nDone. Everything except the kept order has been deleted."))

    def _purge(self, keep, keep_buyer):
        doomed_orders = SisterProfile.objects.exclude(pk=keep.pk)
        doomed_buyers = BuyerProfile.objects.exclude(pk=keep_buyer.pk)

        # Order matters: several of these links are PROTECT, so children go
        # before the parents they point at.
        steps = [
            ("Invoices (+ line items, payments, buyer details)", Invoice.objects.filter(sisterProfile__in=doomed_orders)),
            ("Expenses", Expense.objects.filter(sisterProfile__in=doomed_orders)),
            ("Warehouse costs", WarehouseCost.objects.filter(sisterProfile__in=doomed_orders)),
            ("Packing lists (+ cartons)", PackingList.objects.filter(sisterProfile__in=doomed_orders)),
            ("QC reports", QCReport.objects.filter(product__sisterProfile__in=doomed_orders)),
            ("Sourcing costs (+ items)", SourcingCost.objects.filter(sisterProfile__in=doomed_orders)),
            ("Documents", DocumentVaultItem.objects.filter(sisterProfile__in=doomed_orders)),
            ("Notifications about those orders", Notification.objects.filter(sisterProfile__in=doomed_orders)),
            ("Products (+ images, variants)", Product.objects.filter(sisterProfile__in=doomed_orders)),
            ("Orders", doomed_orders),
            ("Packing rules of removed buyers", PackingRule.objects.filter(buyerProfile__in=doomed_buyers)),
            ("Portal logins of removed buyers", get_user_model().objects.filter(buyer_profile__in=doomed_buyers)),
            ("Buyers (+ wallets and transactions)", doomed_buyers),
        ]
        for label, qs in steps:
            n = qs.count()
            qs.delete()
            self.stdout.write(f"  {label}: {n}")

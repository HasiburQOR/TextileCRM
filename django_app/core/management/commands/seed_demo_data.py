from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import Roles, User
from audit.utils import log_action
from buyers.models import AgreementType, BuyerProfile, SisterProfile
from documents.models import DocumentType, DocumentVault
from expenses.models import Expense, SourceType
from invoicing.models import CommissionType, ExchangeRate
from invoicing.services import approve_invoice, create_invoice, record_payment, reject_invoice, void_invoice
from notifications.models import Notification, NotificationType
from packing.services import create_packing_list
from qc.models import TravelMode
from qc.services import create_qc_report
from sourcing.models import RequestStatus, SourcingRequest, SourcingVariant
from trips.models import LocationStatus, SourcingTrip, TripLocation, TripStatus
from warehouse.services import create_warehouse_cost


class Command(BaseCommand):
    help = "Populate the database with demo users and a full sample dataset."

    @transaction.atomic
    def handle(self, *args, **options):
        if User.objects.filter(username="admin").exists():
            self.stdout.write(self.style.WARNING("Demo data already present — skipping seed."))
            return

        users = self._create_users()
        buyers = self._create_buyers()
        sisters = self._create_sister_profiles(buyers)
        requests = self._create_sourcing_requests(users, sisters)
        self._create_qc_and_warehouse(users, requests)
        self._create_packing_lists(requests)
        self._create_trips(users, requests)
        rates = self._create_exchange_rates(users["admin"])
        self._create_invoices(users, rates)
        self._create_manual_expenses(users, sisters)
        self._create_notifications(users, sisters)
        self._create_documents(users, sisters)

        self.stdout.write(self.style.SUCCESS("Demo data seeded successfully."))

    # ── Users ────────────────────────────────────────────────────────────

    def _create_users(self):
        specs = [
            ("admin", "admin123", Roles.ADMIN, "Admin User", "admin@company.com"),
            ("hasib", "pass123", Roles.COMPANY_REP, "Hasib Rahman", "hasib@company.com"),
            ("karim", "pass123", Roles.QC_PERSON, "Karim Hossain", "karim@company.com"),
            ("rahim", "pass123", Roles.WAREHOUSE_MANAGER, "Rahim Uddin", "rahim@company.com"),
        ]
        users = {}
        for username, password, role, name, email in specs:
            user = User.objects.create_user(username=username, email=email, password=password, role=role, name=name)
            if role == Roles.ADMIN:
                user.is_staff = True
                user.is_superuser = True
                user.save(update_fields=["is_staff", "is_superuser"])
            users[username if username != "admin" else "admin"] = user
        self.stdout.write("Created 4 staff users.")
        return users

    # ── Buyers & sister profiles ────────────────────────────────────────

    def _create_buyers(self):
        zara = BuyerProfile.objects.create(
            name="ZARA Trading Co.",
            contactInfo="procurement@zara-trading.com",
            branding="ZARA",
            portalUsername="zara_portal",
            portalPasswordHash=make_password("buyer123"),
        )
        hm = BuyerProfile.objects.create(
            name="H&M Sourcing Asia",
            contactInfo="sourcing@hm-asia.com",
            branding="H&M",
            portalUsername="hm_portal",
            portalPasswordHash=make_password("buyer123"),
        )
        self.stdout.write("Created 2 buyer profiles.")
        return {"zara": zara, "hm": hm}

    def _create_sister_profiles(self, buyers):
        zara_kids = SisterProfile.objects.create(
            buyerProfile=buyers["zara"], name="Zara Kids Line", poReference="PO-ZK-001",
            agreementType=AgreementType.TYPE_1, negotiatedRate=8, terms="8% commission on total sourcing expense.",
        )
        zara_home = SisterProfile.objects.create(
            buyerProfile=buyers["zara"], name="Zara Home Textiles", poReference="PO-ZH-002",
            agreementType=AgreementType.TYPE_2, negotiatedRate=1.5, terms="Fixed rate per unit sourced.",
        )
        hm_basics = SisterProfile.objects.create(
            buyerProfile=buyers["hm"], name="H&M Basics", poReference="PO-HM-003",
            agreementType=AgreementType.TYPE_3, negotiatedRate=5, terms="Full reimbursement plus 5% commission.",
        )
        self.stdout.write("Created 3 sister profiles.")
        return {"zara_kids": zara_kids, "zara_home": zara_home, "hm_basics": hm_basics}

    # ── Sourcing requests ────────────────────────────────────────────────

    def _create_sourcing_requests(self, users, sisters):
        rep = users["hasib"]
        specs = [
            ("Kids Cotton T-Shirt", RequestStatus.PENDING_ADMIN_APPROVAL, sisters["zara_kids"], "ZARA", None),
            ("Kids Denim Shorts", RequestStatus.PENDING_ADMIN_APPROVAL, None, "NA", None),
            ("Winter Jacket", RequestStatus.REJECTED, None, "NA", "Fabric quality below spec."),
            ("Cotton Bedsheet Set", RequestStatus.APPROVED_FOR_QC, sisters["zara_home"], "ZARA", None),
            ("Throw Pillow Cover", RequestStatus.APPROVED_FOR_QC, None, "NA", None),
            ("Basic Crew Socks", RequestStatus.APPROVED_FOR_QC, sisters["hm_basics"], "H&M", None),
            ("Polo Shirt", RequestStatus.APPROVED_FOR_QC, sisters["zara_kids"], "ZARA", None),
            ("Canvas Tote Bag", RequestStatus.APPROVED_FOR_QC, None, "NA", None),
            ("Denim Jacket", RequestStatus.APPROVED_FOR_QC, sisters["hm_basics"], "H&M", None),
            ("Fleece Hoodie", RequestStatus.APPROVED_FOR_QC, sisters["zara_kids"], "ZARA", None),
        ]
        requests = {}
        for product_name, status, sister, brand, rejection_reason in specs:
            req = SourcingRequest.objects.create(
                productName=product_name,
                packingListNotes=f"Standard export packing for {product_name}.",
                status=status,
                rejectionReason=rejection_reason or "",
                createdBy=rep,
                reviewedBy=users["admin"] if status != RequestStatus.PENDING_ADMIN_APPROVAL else None,
                reviewedAt=timezone.now() if status != RequestStatus.PENDING_ADMIN_APPROVAL else None,
                sisterProfile=sister,
                brandName=brand,
            )
            for i, (color, size, qty) in enumerate([("Black", "M", 500), ("Navy", "L", 300)]):
                SourcingVariant.objects.create(
                    request=req, styleNo=f"STY-{req.styleNumber[-5:]}-{i+1}", buyer=brand, poNo=f"PO-{1000+i}",
                    color=color, itemNumber=f"ITM-{i+1}", size=size, qtyOrdered=qty,
                )
            requests[product_name] = req
            log_action(rep, "CREATE_REQUEST", "SourcingRequest", req.id, after={"productName": product_name, "status": status})
        self.stdout.write("Created 10 sourcing requests with variants.")
        return requests

    # ── QC + warehouse ───────────────────────────────────────────────────

    def _create_qc_and_warehouse(self, users, requests):
        qc_user = users["karim"]
        wh_user = users["rahim"]

        qc_specs = [
            ("Basic Crew Socks", True, 15, 40, TravelMode.TRAVELLING_WITH_GOODS, 0),
            ("Polo Shirt", False, 0, 60, TravelMode.TRAVELLING_INDIVIDUALLY, 25),
            ("Canvas Tote Bag", True, 20, 55, TravelMode.TRAVELLING_WITH_GOODS, 0),
            ("Denim Jacket", True, 18, 70, TravelMode.TRAVELLING_INDIVIDUALLY, 30),
            ("Fleece Hoodie", False, 0, 65, TravelMode.TRAVELLING_WITH_GOODS, 0),
        ]
        qc_reports = {}
        for product_name, lunch_flag, lunch_cost, carrying_cost, travel_mode, extra_cost in qc_specs:
            report = create_qc_report(
                sourcing_request=requests[product_name], created_by=qc_user, lunch_cost_flag=lunch_flag,
                lunch_cost=lunch_cost, goods_carrying_cost=carrying_cost, travel_mode=travel_mode, extra_cost=extra_cost,
            )
            qc_reports[product_name] = report
            log_action(qc_user, "CREATE_QC_REPORT", "QCReport", report.id, after={"reportId": report.reportId, "totalCost": float(report.totalCost)})

        wh_specs = [
            ("Polo Shirt", dict(loaderCost=40, extraWorkerCost=15, labelsCost=8, cartonsCost=25)),
            ("Canvas Tote Bag", dict(loaderCost=35, extraWorkerCost=10, polyBagsCost=12)),
            ("Denim Jacket", dict(loaderCost=50, extraWorkerCost=20, htakeCost=10, stickersCost=6, gamtapeCost=4)),
            ("Fleece Hoodie", dict(loaderCost=45, extraWorkerCost=18, cartonsCost=22, polyBagsCost=9)),
        ]
        for product_name, cost_fields in wh_specs:
            wc = create_warehouse_cost(
                qc_report=qc_reports[product_name], created_by=wh_user,
                custom_costs=[{"fieldName": "Fumigation", "amount": 12, "currency": "BDT"}] if product_name == "Denim Jacket" else [],
                **cost_fields,
            )
            log_action(wh_user, "CREATE_WAREHOUSE_COST", "WarehouseCost", wc.id, after={"totalCost": float(wc.totalCost)})
        self.stdout.write("Created 5 QC reports and 4 warehouse cost records.")

    # ── Packing lists ────────────────────────────────────────────────────

    def _create_packing_lists(self, requests):
        for product_name in ["Denim Jacket", "Fleece Hoodie"]:
            req = requests[product_name]
            variants = list(req.variants.all())
            total_qty = sum(v.qtyOrdered for v in variants)
            cartons = [
                {
                    "cartonNoFrom": i + 1, "cartonNoTo": i + 1, "color": v.color, "assortId": v.styleNo,
                    "itemNumber": v.itemNumber, "sizeBreakdown": v.size, "qtyPerCarton": v.qtyOrdered,
                    "orderQty": v.qtyOrdered, "ctnLength": 60, "ctnWidth": 40, "ctnHeight": 35,
                    "netWeight": 18, "grossWeight": 20,
                }
                for i, v in enumerate(variants)
            ]
            create_packing_list(
                sourcing_request=req, order_qty=total_qty, shipment_qty=total_qty - 20,
                front_mark=req.brandName, side_mark="MADE IN BANGLADESH", cartons=cartons,
            )
        self.stdout.write("Created 2 packing lists.")

    # ── Sourcing trips ───────────────────────────────────────────────────

    def _create_trips(self, users, requests):
        trip1 = SourcingTrip.objects.create(request=requests["Cotton Bedsheet Set"], status=TripStatus.OPEN)
        TripLocation.objects.create(sourcingTrip=trip1, locationName="Gazipur Factory", quantity=1000, advanceAmount=5000, date=timezone.now() - timedelta(days=5), status=LocationStatus.REPORTED)
        TripLocation.objects.create(sourcingTrip=trip1, locationName="Narayanganj Mill", quantity=600, advanceAmount=3000, date=timezone.now() - timedelta(days=2), status=LocationStatus.PENDING)

        trip2 = SourcingTrip.objects.create(request=requests["Denim Jacket"], status=TripStatus.OPEN)
        TripLocation.objects.create(sourcingTrip=trip2, locationName="Chattogram EPZ", quantity=800, advanceAmount=8000, date=timezone.now() - timedelta(days=10), status=LocationStatus.REPORTED)
        TripLocation.objects.create(sourcingTrip=trip2, locationName="Savar Factory", quantity=500, advanceAmount=4500, date=timezone.now() - timedelta(days=8), status=LocationStatus.REPORTED)
        trip2.totalAdvance = 12500
        trip2.status = TripStatus.CLOSED
        trip2.closedAt = timezone.now() - timedelta(days=1)
        trip2.closedBy = users["admin"]
        trip2.save()
        self.stdout.write("Created 2 sourcing trips (one closed).")

    # ── Exchange rates ───────────────────────────────────────────────────

    def _create_exchange_rates(self, admin_user):
        specs = [("USD", "BDT", "109.500000"), ("USD", "EUR", "0.920000"), ("USD", "GBP", "0.790000"), ("EUR", "BDT", "119.800000")]
        rates = {}
        for source, target, rate in specs:
            rates[f"{source}_{target}"] = ExchangeRate.objects.create(
                sourceCurrency=source, targetCurrency=target, rate=rate, effectiveDate=timezone.now(), publishedBy=admin_user,
            )
        self.stdout.write("Created 4 exchange rates.")
        return rates

    # ── Invoices ──────────────────────────────────────────────────────────

    def _create_invoices(self, users, rates):
        admin_user = users["admin"]
        rep = users["hasib"]

        def line_items(desc_amount_pairs):
            return [
                {
                    "description": desc, "brand": "Assorted", "ctn": 20, "qtyPerCtn": 50, "totalQty": 1000,
                    "unitPrice": round(amount / 1000, 2), "amount": amount, "netWeight": 180, "grossWeight": 200, "cbm": 4.5,
                }
                for desc, amount in desc_amount_pairs
            ]

        inv1 = create_invoice(buyer_name="Target Corp", exchange_rate=None, commission_type=CommissionType.NONE, commission_value=0, line_items=line_items([("Kids T-Shirts", 8500)]), created_by=rep)
        log_action(rep, "CREATE_INVOICE", "Invoice", inv1.id, after={"invoiceNo": inv1.invoiceNo})

        inv2 = create_invoice(buyer_name="Walmart", exchange_rate=rates["USD_BDT"], commission_type=CommissionType.PERCENTAGE, commission_value=5, line_items=line_items([("Denim Jackets", 15200)]), created_by=rep)
        approve_invoice(inv2, admin_user)
        record_payment(inv2, amount=6000, currency="USD", payment_date=timezone.now() - timedelta(days=3), bank_reference="TXN-WM-001", recorded_by=admin_user)
        log_action(rep, "CREATE_INVOICE", "Invoice", inv2.id, after={"invoiceNo": inv2.invoiceNo})
        log_action(admin_user, "APPROVE_INVOICE", "Invoice", inv2.id, after={"status": inv2.status})

        inv3 = create_invoice(buyer_name="H&M Global", exchange_rate=None, commission_type=CommissionType.FLAT, commission_value=200, line_items=line_items([("Basic Crew Socks", 4200)]), created_by=rep)
        reject_invoice(inv3, admin_user, "Pricing discrepancy versus PO.")
        log_action(admin_user, "REJECT_INVOICE", "Invoice", inv3.id, after={"status": inv3.status})

        inv4 = create_invoice(buyer_name="Zara Kids", exchange_rate=None, commission_type=CommissionType.NONE, commission_value=0, line_items=line_items([("Kids Denim Shorts", 3100)]), created_by=rep)
        approve_invoice(inv4, admin_user)
        void_invoice(inv4, "Duplicate invoice — superseded by corrected version.")
        log_action(admin_user, "VOID_INVOICE", "Invoice", inv4.id, after={"status": inv4.status})

        inv5 = create_invoice(buyer_name="Lululemon", exchange_rate=rates["USD_EUR"], commission_type=CommissionType.FLAT, commission_value=150, line_items=line_items([("Fleece Hoodies", 21000)]), created_by=rep)
        approve_invoice(inv5, admin_user)
        record_payment(inv5, amount=12000, currency="USD", payment_date=timezone.now() - timedelta(days=6), bank_reference="TXN-LU-001", recorded_by=admin_user)
        record_payment(inv5, amount=9150, currency="USD", payment_date=timezone.now() - timedelta(days=1), bank_reference="TXN-LU-002", recorded_by=admin_user)
        log_action(rep, "CREATE_INVOICE", "Invoice", inv5.id, after={"invoiceNo": inv5.invoiceNo})

        self.stdout.write("Created 5 invoices across all statuses.")

    # ── Manual expenses ──────────────────────────────────────────────────

    def _create_manual_expenses(self, users, sisters):
        rep = users["hasib"]
        for sister in sisters.values():
            expense = Expense.objects.create(
                sisterProfile=sister, sourceType=SourceType.SOURCING_ADVANCE, amount=2000, currency="BDT",
                remarks=f"Initial sourcing advance for {sister.name}.", createdBy=rep,
            )
            log_action(rep, "CREATE_EXPENSE", "Expense", expense.id, after={"amount": float(expense.amount), "sourceType": expense.sourceType})
        self.stdout.write("Created manual sourcing-advance expenses.")

    # ── Notifications ────────────────────────────────────────────────────

    def _create_notifications(self, users, sisters):
        Notification.objects.create(user=users["admin"], title="New Request Submitted", message="Hasib Rahman submitted 'Kids Cotton T-Shirt' for approval.", type=NotificationType.NEW_REQUEST)
        Notification.objects.create(user=users["admin"], title="QC Complete", message="QC report QC-2026-005 completed for Fleece Hoodie.", type=NotificationType.QC_COMPLETE)
        Notification.objects.create(user=users["admin"], sisterProfile=sisters["hm_basics"], title="Settlement Alert", message="H&M Basics settlement position needs review.", type=NotificationType.SETTLEMENT_ALERT, isRead=True)
        Notification.objects.create(user=users["hasib"], title="Invoice Issued", message="Invoice for Walmart has been issued.", type=NotificationType.INVOICE_ISSUED)
        self.stdout.write("Created sample notifications.")

    # ── Documents ─────────────────────────────────────────────────────────

    def _create_documents(self, users, sisters):
        doc = DocumentVault(
            sisterProfile=sisters["zara_kids"], documentType=DocumentType.AGREEMENT, uploadedBy=users["admin"], fileName="zara_kids_agreement.txt",
        )
        doc.file.save("zara_kids_agreement.txt", ContentFile(b"Sourcing agreement between ZARA Trading Co. and the Zara Kids Line sister profile."), save=False)
        doc.fileSize = doc.file.size
        doc.save()
        self.stdout.write("Created sample document vault entry.")

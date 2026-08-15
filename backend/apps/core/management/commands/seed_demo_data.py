"""Demo/staging seed data.

Two independently-guarded phases, so re-running is always safe and a
partially-seeded database can be topped up rather than duplicated:

  1. Staff + buyer-portal login users  — skipped if `admin` already exists.
  2. Business data (buyers, sister profiles, products, packing lists,
     invoices, expenses)               — skipped if any BuyerProfile exists.

Called unconditionally from `entrypoint.sh`, so a fresh deploy comes up
already populated instead of showing empty tables everywhere.

Every write goes through the normal service layer (`record_expense`,
`create_packing_list`, `create_invoice`, wallet services) rather than raw
`objects.create()`, so seeded rows are indistinguishable from ones the UI
would have produced — settlement ledgers, wallet balances, audit-log
entries and derived totals all land exactly as they would in real use.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Roles

# ── Staff logins ────────────────────────────────────────────────────
# (username, password, role, is_superuser, display name, email)
STAFF_USERS = [
    ("admin", "admin123", Roles.ADMIN, True, "Admin User", "admin@company.com"),
    ("hasib", "pass123", Roles.COMPANY_REP, False, "Hasib Rahman", "hasib@company.com"),
    ("karim", "pass123", Roles.QC, False, "Karim Hossain", "karim@company.com"),
    ("rahim", "pass123", Roles.WAREHOUSE, False, "Rahim Uddin", "rahim@company.com"),
    ("nadia", "pass123", Roles.EMPLOYEE, False, "Nadia Islam", "nadia@company.com"),
    ("tanvir", "pass123", Roles.MANAGEMENT, False, "Tanvir Ahmed", "tanvir@company.com"),
]

# ── Buyer profiles ──────────────────────────────────────────────────
# (name, branding, contact, country, portal username | None, wallet top-up USD)
# The first four get a portal login so the buyer-facing side is
# demonstrable; the rest exist to fill out the admin-side lists.
BUYERS = [
    ("Nordvik Retail Group", "NORDVIK", "procurement@nordvik.se\n+46 8 555 0142", "Sweden", "nordvik", 45000),
    ("Casa Limonta", "LIMONTA", "buying@casalimonta.it\n+39 02 8811 0330", "Italy", "limonta", 32000),
    ("Bramble & Co.", "BRAMBLE", "sourcing@brambleco.co.uk\n+44 20 7946 1188", "UK", "bramble", 28000),
    ("Aurora Apparel", "AURORA", "orders@auroraapparel.com\n+1 212 555 0177", "USA", "aurora", 51000),
    ("Meridian Textiles", "MERIDIAN", "hello@meridiantex.com.au\n+61 2 8006 4411", "Australia", None, 18000),
    ("Kestrel Clothing", "KESTREL", "supply@kestrelclothing.ca\n+1 416 555 0193", "Canada", None, 22000),
    ("Solveig Basics", "SOLVEIG", "info@solveigbasics.no\n+47 22 44 0180", "Norway", None, 15000),
    ("Atlas Garments", "ATLAS", "purchasing@atlasgarments.de\n+49 30 5557 2200", "Germany", None, 37000),
    ("Verda Studio", "VERDA", "team@verdastudio.nl\n+31 20 555 0126", "Netherlands", None, 12000),
    ("Harbourline Supply", "HARBOURLINE", "buy@harbourline.ie\n+353 1 555 0164", "Ireland", None, 26000),
]

BUYER_PASSWORD = "buyer123"

# ── Sister profiles (one PO each) ───────────────────────────────────
# buyer index -> (poReference, agreementType, rateConfig)
SISTER_PROFILES = [
    (0, "NRG-PO-2026-014", "1", {"percentage_rate": 8}),
    (0, "NRG-PO-2026-021", "3", {"commission_percentage": 5}),
    (1, "CL-4471", "2", {"rate_per_unit": 1.5}),
    (2, "BRM-2026-A9", "1", {"percentage_rate": 7.5}),
    (3, "AUR-88213", "1", {"percentage_rate": 9}),
    (3, "AUR-88240", "2", {"rate_per_unit": 2.0}),
    (4, "MTX-0117", "1", {"percentage_rate": 6}),
    (5, "KC-2026-33", "3", {"commission_percentage": 4.5}),
    (7, "ATG-PO-7712", "1", {"percentage_rate": 8.5}),
    (9, "HBL-556", "2", {"rate_per_unit": 1.25}),
]

# ── Products ────────────────────────────────────────────────────────
# (sister-profile index, styleNo, name, brand, poNo, status, template?, colors)
# colors: (colorName, patternNo, orderQty, sizeRatio, ctnFrom, ctnTo, gw, nw, L, W, H, templateValues)
_KNIT_SIZES = [("S", 1), ("M", 3), ("L", 5), ("XL", 4), ("XXL", 2)]
_DENIM_SIZES = [("30", 2), ("32", 4), ("34", 4), ("36", 3), ("38", 2)]

PRODUCTS = [
    (
        0, "PRO-0001", "Heavy Cotton Crewneck", "NORDVIK", "NRG-PO-2026-014",
        "approved_for_qc", True,
        [
            ("Ecru Herringbone", "MR12528", 900, _KNIT_SIZES, 1, 60, "6.90", "6.10", 24, 18, 14,
             {"fabric_gsm": "320", "neck_style": "Crewneck", "sleeve_length": "62.5"}),
            ("Charcoal Melange", "MR12529", 750, _KNIT_SIZES, 61, 110, "6.70", "5.95", 24, 18, 14,
             {"fabric_gsm": "320", "neck_style": "Crewneck", "sleeve_length": "62.5"}),
            ("Deep Navy", "MR12530", 600, _KNIT_SIZES, 111, 150, "6.75", "6.00", 24, 18, 14,
             {"fabric_gsm": "320", "neck_style": "Crewneck", "sleeve_length": "63.0"}),
        ],
    ),
    (
        1, "PRO-0002", "Merino Half-Zip", "NORDVIK", "NRG-PO-2026-021",
        "in_warehouse", True,
        [
            ("Forest Green", "MZ4410", 480, _KNIT_SIZES, 1, 32, "5.40", "4.80", 22, 17, 13,
             {"fabric_gsm": "260", "neck_style": "Half-Zip", "sleeve_length": "64.0"}),
            ("Oatmeal", "MZ4411", 420, _KNIT_SIZES, 33, 60, "5.35", "4.75", 22, 17, 13,
             {"fabric_gsm": "260", "neck_style": "Half-Zip", "sleeve_length": "64.0"}),
        ],
    ),
    (
        2, "PRO-0003", "Straight-Leg Denim", "LIMONTA", "CL-4471",
        "sourcing_trip_open", False,
        [
            ("Raw Indigo", "DN2201", 1200, _DENIM_SIZES, 1, 80, "9.20", "8.40", 26, 20, 16, {}),
            ("Stonewash Blue", "DN2202", 960, _DENIM_SIZES, 81, 144, "9.10", "8.30", 26, 20, 16, {}),
        ],
    ),
    (
        3, "PRO-0004", "Oxford Button-Down", "BRAMBLE", "BRM-2026-A9",
        "pending_admin_approval", True,
        [
            ("White", "OX880", 640, _KNIT_SIZES, 1, 40, "4.80", "4.20", 21, 16, 12,
             {"fabric_gsm": "140", "neck_style": "Button-Down", "sleeve_length": "65.0"}),
            ("Sky Blue", "OX881", 560, _KNIT_SIZES, 41, 75, "4.75", "4.15", 21, 16, 12,
             {"fabric_gsm": "140", "neck_style": "Button-Down", "sleeve_length": "65.0"}),
        ],
    ),
    (
        4, "PRO-0005", "Fleece Jogger", "AURORA", "AUR-88213",
        "approved_for_qc", True,
        [
            ("Heather Grey", "FJ7100", 880, _KNIT_SIZES, 1, 55, "7.30", "6.60", 25, 19, 15,
             {"fabric_gsm": "300", "neck_style": "N/A", "sleeve_length": "0"}),
            ("Black", "FJ7101", 720, _KNIT_SIZES, 56, 100, "7.25", "6.55", 25, 19, 15,
             {"fabric_gsm": "300", "neck_style": "N/A", "sleeve_length": "0"}),
        ],
    ),
    (
        6, "PRO-0006", "Linen Camp Shirt", "MERIDIAN", "MTX-0117",
        "completed", False,
        [
            ("Sand", "LC3300", 400, _KNIT_SIZES, 1, 26, "3.90", "3.40", 20, 15, 11, {}),
        ],
    ),
    (
        8, "PRO-0007", "Quilted Overshirt", "ATLAS", "ATG-PO-7712",
        "ready_for_final_qc", False,
        [
            ("Olive", "QO5501", 520, _KNIT_SIZES, 1, 34, "8.10", "7.30", 27, 21, 17, {}),
            ("Burgundy", "QO5502", 380, _KNIT_SIZES, 35, 60, "8.05", "7.25", 27, 21, 17, {}),
        ],
    ),
]

# ── Expenses ────────────────────────────────────────────────────────
# (sister-profile index, product index | None, sourceType, amount, remarks, fieldName)
#
# Deliberately USD, matching the wallet currency: `record_deduction`
# subtracts the raw amount from the wallet regardless of currency, so
# mixing BDT expenses into a USD wallet would drive every demo buyer
# hundreds of thousands negative and make the dashboard's negative-balance
# alert meaningless. Sized so most buyers stay comfortably funded and
# exactly one (Kestrel, below) is over-drawn — enough to demo the alert.
EXPENSES = [
    (0, 0, "sourcing_advance", 1850, "Advance to Ashulia knit unit", ""),
    (0, 0, "qc_lunch", 32, "Inline QC team — 2 days", ""),
    (0, 0, "qc_carrying", 18, "Sample carrying, Ashulia → office", ""),
    (0, None, "extra_cost", 45, "Courier — buyer approval samples", ""),
    (1, 1, "sourcing_advance", 1420, "Advance to Gazipur merino unit", ""),
    (1, 1, "warehouse_loader", 62, "Unload + stack, 60 cartons", ""),
    (1, 1, "warehouse_packaging_item", 89, "Polybags + carton tape", "polybag"),
    (2, 2, "sourcing_advance", 3100, "Advance to Chittagong denim unit", ""),
    (2, 2, "qc_travel_extra", 74, "QC travel Dhaka → Chittagong", ""),
    (3, 3, "sourcing_advance", 960, "Advance to Narayanganj shirt unit", ""),
    (3, 3, "custom_field", 56, "Button sourcing — horn buttons", "trims"),
    (4, 4, "sourcing_advance", 1680, "Advance to Savar fleece unit", ""),
    (4, 4, "warehouse_extra_worker", 41, "Peak-week extra hands", ""),
    (6, 5, "sourcing_advance", 740, "Advance to Mirpur linen unit", ""),
    (8, 6, "sourcing_advance", 1280, "Advance to Tongi outerwear unit", ""),
    (8, 6, "qc_lunch", 29, "Final QC team lunch", ""),
    # Kestrel Clothing (22,000 funded) — intentionally over-committed, so the
    # Dashboard's "Buyers with Negative Wallet Balance" widget has a real row.
    (7, None, "sourcing_advance", 23800, "Advance — bulk winter program", ""),
    (7, None, "extra_cost", 900, "Air freight surcharge", ""),
]


class Command(BaseCommand):
    help = "Seed demo users and demo business data (idempotent — safe to re-run)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--users-only",
            action="store_true",
            help="Create the demo logins but skip buyers/products/packing lists/invoices.",
        )

    def handle(self, *args, **options):
        users_created = self._seed_users()
        if options["users_only"]:
            self.stdout.write(self.style.WARNING("--users-only: skipping business data."))
        else:
            self._seed_business_data()
        self._print_credentials(users_created)

    # ── Phase 1: logins ─────────────────────────────────────────────
    def _seed_users(self) -> bool:
        User = get_user_model()
        if User.objects.filter(username="admin").exists():
            self.stdout.write(self.style.WARNING("Demo users already present — skipping user seed."))
            return False

        for username, password, role, is_superuser, name, email in STAFF_USERS:
            user = User.objects.create_user(
                username=username, email=email, password=password, role=role, name=name
            )
            if is_superuser:
                user.is_staff = True
                user.is_superuser = True
                user.save(update_fields=["is_staff", "is_superuser"])

        self.stdout.write(self.style.SUCCESS(f"Created {len(STAFF_USERS)} staff users."))
        return True

    # ── Phase 2: business data ──────────────────────────────────────
    @transaction.atomic
    def _seed_business_data(self):
        from apps.buyers.models import BuyerProfile, SisterProfile
        from apps.expenses.services import record_expense
        from apps.invoicing.models import CommissionType, ExchangeRate
        from apps.invoicing.services import create_invoice
        from apps.packing.services import create_packing_list
        from apps.sourcing.models import (
            Product,
            ProductTemplate,
            ProductTemplateField,
            ProductVariant,
            TemplateField,
        )
        from apps.sourcing.services import compute_variant_derived
        from apps.wallet.services import create_wallet, record_top_up

        User = get_user_model()

        if BuyerProfile.objects.exists():
            self.stdout.write(self.style.WARNING("Business data already present — skipping."))
            return

        admin = User.objects.filter(username="admin").first()
        if not admin:
            self.stdout.write(self.style.ERROR("No admin user — cannot seed business data."))
            return
        rep = User.objects.filter(username="hasib").first() or admin

        today = date.today()

        # Exchange rates (Admin-published — FR-55/56, never a live feed).
        for source, target, rate, days_ago in (
            ("USD", "BDT", "121.50", 0),
            ("EUR", "BDT", "131.20", 0),
            ("USD", "BDT", "120.85", 14),
        ):
            ExchangeRate.objects.create(
                sourceCurrency=source, targetCurrency=target, rate=Decimal(rate),
                effectiveDate=today - timedelta(days=days_ago), publishedBy=admin,
            )

        # Product template built from the Field Library seeded by
        # sourcing migration 0008 — skipped entirely if that seed is absent.
        template = None
        template_columns = []
        library = {f.fieldKey: f for f in TemplateField.objects.filter(
            fieldKey__in=["fabric_gsm", "neck_style", "sleeve_length"]
        )}
        if len(library) == 3:
            template = ProductTemplate.objects.create(
                name="Knitwear — Basic",
                description="Fabric weight, neckline and sleeve length — the three specs every knit order needs.",
                createdBy=admin,
            )
            for order, key in enumerate(["fabric_gsm", "neck_style", "sleeve_length"]):
                field = library[key]
                ProductTemplateField.objects.create(template=template, field=field, displayOrder=order)
                # Mirrors the shape the frontend grid writes back, so the
                # seeded products' template columns render identically to
                # ones created through the UI.
                template_columns.append({
                    "id": str(field.id),
                    "fieldKey": field.fieldKey,
                    "label": field.label,
                    "fieldType": field.fieldType,
                    "selectOptions": field.selectOptions,
                    "isRequired": field.isRequired,
                    "fieldGroup": str(field.fieldGroup_id) if field.fieldGroup_id else None,
                    "displayOrder": order,
                })

        # Buyers (+ wallet, + optional portal login).
        buyers = []
        for name, branding, contact, country, portal_username, top_up in BUYERS:
            buyer = BuyerProfile.objects.create(
                name=name, branding=branding, contactInfo=f"{contact}\n{country}"
            )
            buyers.append(buyer)

            wallet = create_wallet(buyer)
            record_top_up(
                wallet=wallet, amount=Decimal(top_up), currency="USD",
                method_reference=f"Opening balance — bank transfer {buyer.referenceCode}",
                created_by=admin,
            )
            if portal_username:
                User.objects.create_user(
                    username=portal_username,
                    email=contact.splitlines()[0],
                    password=BUYER_PASSWORD,
                    role=Roles.BUYER,
                    name=name,
                    buyer_profile=buyer,
                )

        # Sister profiles (one PO each).
        sisters = [
            SisterProfile.objects.create(
                buyerProfile=buyers[buyer_index],
                poReference=po_reference,
                agreementType=agreement_type,
                agreementRateConfig=rate_config,
            )
            for buyer_index, po_reference, agreement_type, rate_config in SISTER_PROFILES
        ]

        # Products + per-color variant rows.
        products = []
        for sister_index, style_no, name, brand, po_no, status, use_template, colors in PRODUCTS:
            product = Product.objects.create(
                sisterProfile=sisters[sister_index],
                styleNumber=style_no,
                name=name,
                brandName=brand,
                poNo=po_no,
                status=status,
                template=template if (use_template and template) else None,
                resolvedTemplateFields=template_columns if (use_template and template) else [],
                createdBy=rep,
            )
            products.append(product)

            for (color, pattern, qty, sizes, ctn_from, ctn_to,
                 gross, net, length, width, height, values) in colors:
                variant = ProductVariant(
                    product=product,
                    colorName=color,
                    patternNo=pattern,
                    orderQty=qty,
                    sizeBreakdown=[{"size_label": s, "quantity": q} for s, q in sizes],
                    customFieldValues=[
                        {
                            "fieldKey": column["fieldKey"],
                            "label": column["label"],
                            "type": column["fieldType"],
                            "value": values.get(column["fieldKey"], ""),
                        }
                        for column in template_columns
                    ] if (use_template and template) else [],
                    innerBundle=1,
                    cartonNoFrom=ctn_from,
                    cartonNoTo=ctn_to,
                    grossWeight=Decimal(gross),
                    netWeight=Decimal(net),
                    ctnLength=Decimal(length),
                    ctnWidth=Decimal(width),
                    ctnHeight=Decimal(height),
                )
                compute_variant_derived(variant)
                variant.save()

        # Packing lists — built from each product's own variant rows, so the
        # carton grid mirrors what Sourcing Intake already captured.
        packing_lists = []
        for product in products[:5]:
            cartons = [
                {
                    "product": product,
                    "poNo": product.poNo,
                    "cartonNoFrom": v.cartonNoFrom,
                    "cartonNoTo": v.cartonNoTo,
                    "colorName": v.colorName,
                    "patternNo": v.patternNo,
                    "sizeBreakdown": v.sizeBreakdown,
                    "customFieldValues": v.customFieldValues,
                    "innerBundle": v.innerBundle,
                    "orderQty": v.orderQty,
                    "grossWeight": v.grossWeight,
                    "netWeight": v.netWeight,
                    "ctnLength": v.ctnLength,
                    "ctnWidth": v.ctnWidth,
                    "ctnHeight": v.ctnHeight,
                }
                for v in product.variants.all()
            ]
            packing_lists.append(
                create_packing_list(
                    sister_profile=product.sisterProfile,
                    created_by=rep,
                    cartons=cartons,
                    poNo=product.poNo,
                    brandName=product.brandName,
                    date=today - timedelta(days=5),
                    frontMark=f"{product.brandName}\n{product.poNo}\nMADE IN BANGLADESH",
                    sideMark=f"STYLE: {product.styleNumber}\nC/NO: 1-UP",
                )
            )

        # Invoices — one issued-track, one still pending approval.
        usd_bdt = ExchangeRate.objects.filter(
            sourceCurrency="USD", targetCurrency="BDT", effectiveDate=today
        ).first()
        for packing_list, unit_price, commission in (
            (packing_lists[0], Decimal("12.50"), Decimal("5")),
            (packing_lists[2], Decimal("18.75"), Decimal("0")),
        ):
            line_items = [
                {
                    "product": carton.product,
                    "packingCarton": carton,
                    "description": f"{carton.product.name} — {carton.colorName}",
                    "brand": carton.product.brandName,
                    "ctn": carton.noOfCartons,
                    "qtyPerCtn": carton.totalPcsPerCarton,
                    "totalQty": carton.shipQty,
                    "unitPrice": unit_price,
                    "amount": (unit_price * carton.shipQty).quantize(Decimal("0.01")),
                    "netWeight": carton.totalNetWeight,
                    "grossWeight": carton.totalGrossWeight,
                    "cbm": carton.totalCbm,
                    "material": "100% Cotton",
                    "styleItemCode": carton.styleNo,
                    "packingListRef": packing_list.referenceCode,
                    "remarks": "",
                }
                for carton in packing_list.cartons.all()
            ]
            create_invoice(
                sister_profile=packing_list.sisterProfile,
                created_by=rep,
                line_items=line_items,
                exchange_rate=usd_bdt,
                commission_type=CommissionType.PERCENTAGE if commission else CommissionType.NONE,
                commission_value=commission,
            )

        # Expenses last — each one recomputes its settlement ledger and
        # deducts the buyer wallet, so balances end up realistically drawn down.
        for sister_index, product_index, source_type, amount, remarks, field_name in EXPENSES:
            record_expense(
                sister_profile=sisters[sister_index],
                product=products[product_index] if product_index is not None else None,
                source_type=source_type,
                amount=Decimal(amount),
                currency="USD",
                remarks=remarks,
                field_name=field_name,
                created_by=rep,
            )

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(buyers)} buyers, {len(sisters)} sister profiles, {len(products)} products, "
            f"{len(packing_lists)} packing lists, 2 invoices, {len(EXPENSES)} expenses."
        ))

    # ── Credentials summary ─────────────────────────────────────────
    def _print_credentials(self, users_created: bool):
        if not users_created:
            return
        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("Demo logins"))
        self.stdout.write("  Staff (admin panel):")
        for username, password, role, *_ in STAFF_USERS:
            self.stdout.write(f"    {username:<10} / {password:<10} — {role}")
        self.stdout.write("  Buyers (buyer portal):")
        for name, _branding, _contact, _country, portal_username, _top_up in BUYERS:
            if portal_username:
                self.stdout.write(f"    {portal_username:<10} / {BUYER_PASSWORD:<10} — {name}")
        self.stdout.write("")

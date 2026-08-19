# Textile Sourcing, Traceability & Buyer CRM Platform — API

API-first Django REST Framework backend per `DRF_Migration_Instructions.md`. One JWT-authenticated API serves the Admin React app, the Buyer Portal React app, and (later) a Flutter mobile app — no server-rendered templates, no session auth.

**Status: all 6 phases of the DRF migration plan complete.** The only spec item still open is dual QR traceability (`apps/traceability` — the half of Phase 4 that wasn't pulled forward with `apps/packing`).

**Nothing here has a UI yet.** This is backend/API only — no React frontend exists. To look at real data as it's built: Django admin at `/admin/`, or the Swagger docs at `/api/v1/docs/`.

## What's built (Phase 1 — Foundation)

- Custom `User` model (`apps/accounts`) with 7 roles: `admin`, `company_rep`, `qc`, `warehouse`, `employee`, `management`, `buyer`. A `buyer`-role user carries a `buyer_profile` FK; every other role doesn't.
- JWT auth (`djangorestframework-simplejwt`) — no session/cookie auth on the API. Token claims include `role` and `buyer_profile_id`.
- `BuyerProfile` + `SisterProfile` (`apps/buyers`), with the 3 agreement types (BRD §4.3) and a JSON `agreementRateConfig` validated per type.
- **Tenant-scoping mixin** (`apps/core/tenancy.py`) — the safety-critical piece per the migration doc. Every buyer-reachable viewset declares a `tenant_lookup` ORM path; a `buyer`-role user's queryset is filtered to their own `buyer_profile_id`, fails closed (`.none()`) if misconfigured, and a cross-tenant detail request 404s automatically. A global `BuyerReadOnly` permission blocks every write endpoint for the buyer role regardless of per-view permissions.
- `drf-spectacular` OpenAPI schema at `/api/v1/schema/`, browsable at `/api/v1/docs/` — this is the contract the React frontends (and later Flutter) build against.
- Test suite (`apps/buyers/tests.py`, 17 tests) covering the two mandatory checks from the migration doc §5: a buyer can't read another buyer's data, and a buyer can't call any write endpoint — plus JWT claim checks and admin/staff sanity checks.

## What's built (Phase 2 — Sourcing Pipeline)

- **`Product`** (`apps/sourcing`) — every field traced to a BR-/FR- id, docstring-annotated in the model itself: `sisterProfile` (required — FR-67), auto-generated unique `styleNumber` (BR-06), `name`, `brandName` (defaults `'NA'`), `poNo` (FR-08), lifecycle `status`, `rejectionReason` (BR-09), the Final QC fields `goodsName`/`finalPrice`/`fabricDetails` (BR-32/FR-34 — populated by Phase 3's QC module, but the fields exist now), `factoryPackingList` file upload (FR-03's photo/scan alternative to manual entry), `productQrGenerated`/`cartonQrGenerated` flags (BR-33–35 completion gate), and full approval audit (`createdBy`, `reviewedBy`, `reviewedAt`).
- **`ProductImage`** — labeled multi-image gallery (FR-01: Front Label / Back Label / Product Overall / Fabric Close-up / Custom), optional GPS + captured-at metadata (FR-02). Uploaded one at a time via `POST /products/{id}/upload_image/` (multipart) — a single JSON body doesn't map cleanly onto multiple labeled files.
- **`ProductVariant`** — the color × size matrix (BR-07/FR-09): one row per (color, size), each with its own `qtyOrdered`. Includes **`patternNo`**, a field not named anywhere in the BRD/SRS text but present on every row of the real factory packing list you shared (Style MRF25 → patterns MR12528/MR12529 for different colorways) — added because the spec text alone would have missed it.
- **`SourcingTrip`** / **`SourcingLocationEntry`** (BR-11–15/FR-68–71) — multi-location sourcing per product, nested under the trip.
- **Approval state machine** (`apps/sourcing/services.py`) — every transition is a function, never an ad-hoc status write: `report_location`, `close_sourcing_trip` (rejects if any location still Pending, or no locations at all), `submit_for_approval` (the FR-70 hard gate — rejects unless the trip exists and is Closed), `approve_product`/`reject_product` (Admin-only, reject requires a reason).
- 23 new tests (`apps/sourcing/tests.py`): every invalid state transition rejected, tenant isolation extended to products/trips, plus one full end-to-end happy-path test (create product+variants → create trip+locations → blocked submit → report all locations → close trip → submit succeeds → rep blocked from approving → admin approves).

`IN_WAREHOUSE`/`READY_FOR_FINAL_QC`/`COMPLETED` status transitions exist as enum values but have no service function yet — those are triggered by Phase 3's QC/Warehouse modules.

## What's built (`apps/packing`, pulled forward from Phase 4)

You flagged that the real factory packing list has fields the intake pipeline above didn't capture, and asked for the complete sheet rather than waiting for a later phase — so this got built now instead of in Phase 4.

- **`PackingRule`** — reusable per Buyer Profile: the size-ratio (`sizeRatio` JSON, e.g. `{"S":1,"M":3,"L":5,"XL":4,"XXL":2}`), default carton L×W×H (inches) and net/gross weight (BR-19/FR-18).
- **`PackingList`** — a shipment-level document that can span **multiple Products/styles** (FR-17 — exactly what your sample sheet shows: styles MRF25–MRF28 all under one PO, one continuous carton-number sequence). Header fields: PO No, Brand, Date, Front Mark/Side Mark (BR-22/FR-23). Aggregates (`totalCartonQty`, `totalGrossWeight`, `totalNetWeight`, `totalCbm`, `shortExcessQty`/`Pct`) are recomputed from cartons, never hand-entered.
- **`PackingCarton`** — one row per (Product, color) carton range, with **every column from the sheet**: Carton No From/To, CTNS, Color, **Pattern No**, Assort ID, per-carton `sizeBreakdown`, Total PC/Carton, Inner Bundle, Order Qty, Ship Qty, **signed** Short/Excess Qty+Pct (negative = shipped *more* than ordered — the sheet calls this out explicitly, unlike the BRD text which only mentions "Short"), G.W/N.W per carton + row totals, carton dimensions in inches, and CBM (both per-carton and row-total).
- **Calculation service** (`apps/packing/services.py`) — CBM converts inches³→m³ (1 m³ = 61023.7441 in³); `generate_cartons_from_rule()` implements the carton-count auto-calc (BR-19/FR-19: `ceil(order_qty / units_per_carton)`, last carton left partial — the SRS's own open question #2 on rounding, resolved this way since round-up-with-partial is the standard convention) and continues carton numbers sequentially across colors/products within one list (FR-20).
- **Verified against the real document, not synthetic data**: `apps/packing/tests.py` transcribes all 16 rows of the packing list you shared (158 cartons, 4 styles, 16 colors) and asserts the computed per-row and grand totals match the sheet exactly — 158 cartons, 2,370 pcs, 1,059.40 kg gross, 790.00 kg net, 6.99 CBM. This caught a real rounding-order bug during development (rounding each carton's CBM before summing landed a cent short of the sheet's total; fixed by rounding only the final sum).

## What's built (Phase 3 — Cost Tracking)

- **`record_expense()`** (`apps/expenses/services.py`) — built first, per the migration doc's explicit ordering instruction, before either cost-producing model existed. Every other app imports this; nothing outside `apps/expenses` ever calls `Expense.objects.create()` directly. Skips recording when amount is falsy (an unchecked warehouse checkbox shouldn't leave a zero-value audit row).
- **`Expense`** (`apps/expenses`) — the Central Expense Table (BR-48/FR-72), tagged by Sister Profile, Product, `sourceType`, amount, currency, remarks, and an optional `fieldName` for per-item traceability (e.g. which packaging checkbox or which custom field).
- **`QCReport`** (`apps/qc`) — BR-23–26/FR-25–29: Lunch Cost Yes/No toggle (amount zeroed server-side when No, regardless of what's submitted), Goods Carrying Cost, Travel Mode (`travelling_with_goods` / `travelling_individually`, Extra Cost only counted in the total when travelling individually). Sequential `reportId` (`QC-2026-001`) via an atomic `SequenceCounter` + `select_for_update()` — the original Next.js prototype's `count() + 1` approach isn't race-safe under concurrent requests, this is. Creating a report writes up to 3 Expense rows and advances `Product.status` to `IN_WAREHOUSE` (FR-29).
- **`WarehouseCost`** (`apps/warehouse`) — BR-27–31/FR-30–33: Loader + Extra Worker cost, the 6 checkbox packaging items (Labels/Hangtags/Stickers/Cartons/Poly Bags/Gum Tape), any number of named Custom Cost Fields (JSON list), and a separate one-off Extra Cost — matching the BRD's explicit distinction between "a Custom Cost Field" and "a simple Extra Cost" (BR-29 vs BR-30), which are easy to conflate but write different `sourceType`s. Advances `Product.status` to `READY_FOR_FINAL_QC` (FR-33).
- **Sourcing Trip advances now flow into the Expense table too** — `apps/sourcing/services.report_location()` was updated to call `record_expense()` (source type `sourcing_advance`) the moment a location is reported, closing the last gap in FR-72's cost-source list.
- 21 new tests across `apps/expenses`, `apps/qc`, `apps/warehouse` (69 total): every status-gate rejection (can't QC a product that isn't Approved for QC, can't warehouse-cost a product that isn't In Warehouse, can't double-create either), the cost formulas, and — the actual point of Phase 3 — that every cost-writing path produces the right Expense row(s) and nothing else. Verified live too: one QC report + one warehouse cost against a real running server produced exactly the 9 expected Expense rows.

## What's built (Phase 5 — Invoicing & Settlement)

- **`Invoice`** (`apps/invoicing`) — BR-36–47/FR-42–59: sequential `invoiceNo` (same atomic counter pattern as QC report IDs), 4 statuses (`pending_approval`/`issued`/`rejected`/`void`), Commission (percentage or flat, itemized separately in totals), and — the actual point of this phase — **`exchangeRateValueLocked`**: the rate is copied onto the invoice as a plain number at creation time, not a live FK lookup. Verified explicitly: publishing a new rate, and even editing the *original* referenced `ExchangeRate` row afterward, does not move `exchangeRateValueLocked` or `convertedTotal` on an already-created invoice.
- **`InvoiceLineItem`** — FR-43: each line carries an optional FK to both the source `Product` and the source `PackingCarton` row, for the traceability BR-37 requires.
- **`InvoicePayment`** — BR-44/FR-51-52: partial payments, `outstandingBalance` fully recomputed from all payments on every write (never an incremental subtract), floored at 0.
- **State machine** (`apps/invoicing/services.py`) — `approve_invoice`/`reject_invoice` (Admin-only, PendingApproval→Issued/Rejected), `void_invoice` (BR-46: never hard-delete, Issued→Void only, reason required, zeroes outstanding balance), `record_payment` (Issued invoices only). `ExchangeRateViewSet` is Admin-write / staff-read only — Employees select from published rates, never enter one (FR-56).
- **`SettlementLedger`** (`apps/ledger`, a separate app from `apps/expenses` per the migration doc) — recomputed automatically on every `record_expense()` call (FR-75), never a scheduled batch job. Implements the exact three formulas from BRD §4.3: Type 1 `totalExpense × rate%`, Type 2 `rate × totalUnitsSourced`, Type 3 `totalExpense + totalExpense × rate%`. `negativeBalance` flips true the moment a Sister Profile's owed amount exceeds its advance (BR-50) — actual notification delivery is Phase 6 (`apps/notifications` doesn't exist yet).
- **A real bug live verification caught, twice**: the ViewSet's queryset uses `.prefetch_related("payments")` for GET/list efficiency. Recording a payment through the API (not the service layer directly, which is what the unit tests exercised) left that cache stale — `outstandingBalance` silently failed to update, and separately the serialized `payments` list omitted the just-created payment. Unit tests calling the service directly on a fresh instance didn't catch this (no stale cache to hit); only testing through the actual running server did. Fixed in both `services._recalculate_outstanding` (query `InvoicePayment` directly instead of `invoice.payments.all()`) and the view (`invoice.refresh_from_db()` before serializing the response) — and locked in with a regression test that goes through the real `payments` action, not the service function.
- 30 new tests across `apps/invoicing` and `apps/ledger` (99 total): the exchange-rate-immutability test, every status-transition rejection, commission formulas, and — per the migration doc's explicit requirement — the Settlement Ledger hand-calculated against all three Agreement Types (including a Type 2 scenario that produces a negative balance).

## What's built (Phase 6 — Buyer Portal & Supporting Systems)

Mostly a retrofit — wiring audit logging and notification triggers into every service function built in Phases 2–5, plus three new small apps.

- **`AuditLogEntry`** (`apps/audit`) — BR-57/FR-82's exact list: every `record_expense()` write, Product approve/reject, exchange rate publish, and all four invoice actions (create/approve/reject/void) now call `log_action()` with a before/after snapshot. Deliberately **not** wired into `record_payment` — FR-82's audit list names invoice actions but not payments, while FR-84 lists "payment recorded" only as a *notification* trigger; kept that distinction rather than over-logging. Admin-only read (`IsAdmin`, not `IsSupplierStaff` — FR-83 says not even other staff roles see it).
- **`Notification`** (`apps/notifications`) — the five BR-58/FR-84 triggers plus the BR-50 negative-balance alert, no more: Sourcing Trip closed → the rep who created the product; Product approved/rejected → same rep; Invoice issued / Payment recorded → the buyer; Negative-balance alert → Admin *and* the buyer. Scoped by `user=request.user` directly rather than through `TenantScopedViewSet` — a notification belongs to one person regardless of role, not to a buyer_profile.
- **`DocumentVaultItem`** (`apps/documents`) — BR-59/FR-85: PO / Contract / Invoice / Packing List / QC Photo / Other, scoped to Sister Profile. Any supplier-staff role may upload (documents arrive from QC, warehouse, admin, and reps alike — not gated to one role the way Product/QC/Warehouse creation is); only Admin can delete; buyer reads own only.
- **Buyer Portal dashboard** (`GET /api/v1/buyer-portal/dashboard/`) — FR-79's "overview across all of the buyer's own Sister Profiles": one call returns, per Sister Profile, product count, latest trip status, the full Settlement Ledger snapshot, and an invoice summary (counts + total outstanding) — instead of making a buyer-facing frontend stitch together five separate list calls per profile.
- **The negative-balance alert fires once per transition, not once per recompute** — `recompute_settlement()` checks whether the ledger was already negative before this write; a Sister Profile that's already underwater doesn't re-notify on every subsequent Expense row, only the write that crosses the line.
- 23 new tests across `apps/audit`, `apps/notifications`, `apps/documents`, and the buyer dashboard (122 total): every audit action type fires (and payments deliberately don't), every notification reaches the right recipient(s) and no one else, the negative-balance alert's fire-once-per-transition behavior, document vault role/tenant rules, and the dashboard's aggregation numbers checked against hand-created expense/invoice data. Live-verified end to end: expense → audit entry appears (admin-only, rep gets 403) → document upload (curl multipart, not just Django's test client) → buyer sees it, can't upload → buyer dashboard shows correct settlement math and excludes another buyer's data entirely.

## Run it

```bash
python -m venv .venv && .venv/Scripts/activate
pip install -r requirements/dev.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Defaults to SQLite. Set `DB_ENGINE=postgres` (+ `POSTGRES_*` env vars) for Postgres, matching the target deployment (Docker via Dokploy, per SRS §2.1).

## Run the tests

```bash
python manage.py test        # all 122 tests
python manage.py test apps.audit apps.notifications apps.documents
```

## Deliberate reconciliation with the spec docs

The BRD/SRS data model lists `portal_username` / `portal_password_hash` directly on `BuyerProfile` (carried over from the v1.1 single-tenant design). The DRF migration doc — the actual build instructions — specifies a unified `User` model with `role='buyer'` + `buyer_profile_id` instead, so there's exactly one JWT auth mechanism for staff and buyers alike. This backend follows the migration doc: `BuyerProfile` holds identity/branding only; a buyer's login is a `User` row with `role='buyer'`, created by an Admin via `POST /api/v1/users/` (satisfies BR-53 — no self-registration endpoint exists anywhere in this API).

## Next: `apps/traceability` — the only spec item left

Dual QR generation (BR-33–35/FR-35–38): a Product-level QR (size, color, quantity, fabric, price) and a Carton-level QR (carton contents, total quantity, QC Report ID), using the `qrcode` Python package per SRS §4.3. `Product.productQrGenerated`/`cartonQrGenerated` already exist and gate the `COMPLETED` status — this app just needs to generate the images and flip those flags. After that, this backend covers everything in the BRD/SRS/App Workflow docs; remaining work is the React frontend (Admin app + Buyer Portal) this API was built to serve, per the architecture decision made at the start of this project.

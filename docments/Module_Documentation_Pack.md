# Module Documentation Pack
### Textile Sourcing, Traceability & Buyer CRM Platform
Companion to BRD v2.0, SRS v2.0, and DRF Migration Instructions. One section per sidebar module, each written so it can be handed to an AI coding assistant on its own to build that module's UI + API.

Every module follows the same structure: **Purpose → Fields/Data → UI Requirements → API Endpoints → Business Rules → Acceptance Checklist.** BR-xx and FR-xx references point back to BRD v2.0 / SRS v2.0 for full context.

---

## 1. Dashboard

**Purpose:** Landing screen for internal (Admin/Employee/Management) users — a live snapshot across all buyers and Sister Profiles, not scoped to one.

**Data shown (all read-only, aggregated):**
| Widget | Source |
|---|---|
| Active Sister Profiles count, by status | SisterProfile |
| Sourcing Trips currently Open | SourcingTrip |
| Products Pending Admin Approval | Product |
| Total Expense this month, across all buyers | Expense |
| Negative-balance alerts (list) | SettlementLedger |
| Invoices Pending Approval | Invoice |
| Recent Audit Log activity (last 10 entries) | AuditLogEntry |

**UI Requirements:**
- Card/tile layout, each tile clickable through to the relevant module's filtered list (e.g. clicking "5 Pending Approval" opens Admin Approval pre-filtered).
- Negative-balance alerts rendered with visual urgency (red/amber), pinned near top.
- Role-aware: Management sees all data read-only; Admin sees the same plus action shortcuts (e.g. "Approve" buttons inline where feasible).

**API Endpoints:**
- `GET /api/v1/dashboard/summary/` — aggregated counts and totals, filterable by date range.

**Business Rules:**
- Dashboard queries must respect the requesting user's role scope (Company Rep/QC/Warehouse see only their assigned Sister Profiles' data, not global).

**Acceptance Checklist:**
- [ ] All tiles load with real aggregated data, not placeholders.
- [ ] Negative-balance alerts link directly to the affected Sister Profile's Settlement Ledger.
- [ ] Role-scoped users never see another team's assigned-profile data on this screen.

---

## 2. Buyers

**Purpose:** Manage Buyer Profiles — the top-level tenant. Maps to BRD Section 4.1, BR-01, FR-64.

**Fields:**
| Field | Type | Notes |
|---|---|---|
| Buyer Reference Code | Text | Auto-generated as `BUY-0001`, `BUY-0002`, ... (continuous sequence, zero-padded to 4 digits, extends automatically past 9999). Admin may manually override at creation with any unique value instead — uniqueness is enforced, format is not required on manual entries. |
| Buyer Name | Text | Required |
| Contact Info | Text/JSON | Email, phone, address |
| Branding (logo, display name) | File + Text | Used on buyer-facing exports |
| Portal Username | Text | Set manually by Admin |
| Portal Password | Password | Set manually by Admin, stored hashed, never displayed again after creation |
| Created At / Created By | Auto | — |
| Status | Enum (Active/Inactive) | Inactive buyers' portal login is disabled |

**UI Requirements:**
- List view: table of all Buyer Profiles with name, # active Sister Profiles, status.
- Create/Edit form: fields above; password field only editable at creation or via explicit "Reset Password" action (separate from edit-profile flow, to avoid accidental overwrites).
- Detail view: buyer info + list of their Sister Profiles + quick links to each.

**Account Creation Flow (the actual "Create Buyer" wizard):**
Creating a Buyer Profile and creating its login happen together in one guided flow — the login is permanently bound to that one profile, not a separate disconnected step:
1. Admin clicks "New Buyer" → enters Buyer Name, Contact Info, Branding.
2. On the same screen, Admin sets Portal Username and Portal Password for this buyer.
3. On save, the system creates both the BuyerProfile record and a `User` record with `role = 'buyer'` and `buyer_profile_id` set to the new profile's ID, in one transaction — this FK is what makes tenant scoping work (see Module 16 and DRF Migration Instructions Section 2).
4. Confirmation screen shows the username (not the password again) with a reminder to share credentials out-of-band — the system does not auto-email/SMS the password in Phase 1.
5. One Buyer Profile = exactly one buyer-role login in Phase 1. Multiple logins per buyer is a future enhancement, not built now.

**API Endpoints:**
- `GET/POST /api/v1/buyers/` — POST creates both BuyerProfile and its linked buyer User in one transaction
- `GET/PATCH/DELETE /api/v1/buyers/{id}/`
- `POST /api/v1/buyers/{id}/reset-password/`

**Business Rules:**
- Only Admin role can create/edit Buyer Profiles or reset portal passwords (BR-01).
- The BuyerProfile + buyer User creation must be one atomic transaction — never leave a BuyerProfile without its login, or a dangling login without a profile.
- Deleting a Buyer Profile should be disallowed if any Sister Profile has cost/invoice history — offer Deactivate instead (soft-delete pattern, consistent with Invoice Void rule BR-46). Deactivating must also disable the linked login at the auth layer, not just hide it in the UI.
- Buyer Reference Code generation must be collision-free under concurrent creation — use a DB sequence (`nextval`) rather than a naive "read max, add 1" pattern, same rule as Style No generation in Sourcing Intake. If Admin supplies a manual value, validate uniqueness against existing codes before save; on collision, reject with a clear error rather than silently appending a suffix.

**Acceptance Checklist:**
- [ ] Admin can create a buyer and portal login in one flow, one transaction.
- [ ] Password is never returned in any API response after initial creation.
- [ ] Non-Admin roles cannot access create/edit/reset endpoints (403).
- [ ] Deactivating a Buyer Profile immediately blocks that buyer's login at the next request.
- [ ] Buyer Reference Code auto-generates correctly as `BUY-0001`, `BUY-0002`, ... under sequential creation, and remains unique under concurrent/simultaneous creation (test with parallel requests).
- [ ] Manually entering a duplicate reference code is rejected with a clear error, not silently modified.

---

## 3. Sister Profiles

**Purpose:** One Purchase Order/shipment per buyer, carrying its own Agreement Type. Maps to BRD Section 4.2–4.3, BR-02–BR-04, FR-65–FR-67.

**Fields:**
| Field | Type | Notes |
|---|---|---|
| Sister Profile Reference Code | Text | Auto-generated as `SIS-0001`, `SIS-0002`, ... (continuous sequence, zero-padded to 4 digits, extends automatically past 9999). Admin may manually override at creation with any unique value instead — uniqueness is enforced, format is not required on manual entries. This is your internal tracking code, distinct from PO Reference below. |
| Buyer Profile | FK | Required, set at creation |
| PO Reference | Text | The buyer's own real-world PO number, always manually entered — this comes from the buyer's system, not generated by yours, so it is never auto-filled |
| Agreement Type | Enum (1/2/3) | Immutable once cost entries exist (FR-66) |
| Agreement Rate Config | JSON | e.g. `{ "type": 1, "percentage": 8 }` — shape depends on Agreement Type |
| Status | Enum | Mirrors overall pipeline status (see Section 6 of App Workflow doc) |
| Created At / Created By | Auto | — |

**UI Requirements:**
- List view: filterable by Buyer, Agreement Type, Status.
- Create form: Buyer picker → Agreement Type selector → dynamic rate-config fields depending on Type chosen (Type 1 shows a % field, Type 2 shows a per-piece rate field, Type 3 shows commission structure fields).
- Detail view: tabs or sections for Products, Sourcing Trips, Expenses, Settlement Ledger, Invoices, Documents — this is the central hub screen most Admin/Employee work happens from.
- Once cost entries exist, Agreement Type field becomes read-only in the edit form with an explanatory tooltip (not just disabled with no explanation).

**API Endpoints:**
- `GET/POST /api/v1/sister-profiles/`
- `GET/PATCH /api/v1/sister-profiles/{id}/`
- `GET /api/v1/sister-profiles/{id}/summary/` — rolled-up view powering the detail screen tabs

**Business Rules:**
- Reject any PATCH attempting to change `agreement_type` or `agreement_rate_config` if `Expense` rows already reference this Sister Profile (FR-66) — return a clear error, not a silent no-op.
- All child records (Product, SourcingTrip, Expense, Invoice) must set `sister_profile_id` at creation and never allow it to be reassigned later.
- Sister Profile Reference Code generation follows the same rule as Buyer Reference Code: DB sequence for auto-generation (collision-free under concurrent creation), uniqueness-only validation on manual override, clear rejection error on duplicate.
- Do not confuse Sister Profile Reference Code with PO Reference in any UI label, export, or API field name — they serve different purposes (internal tracking vs. buyer's own document number) and must remain visually distinct wherever both appear (e.g. list view columns, detail headers).

**Acceptance Checklist:**
- [ ] Agreement Type + rate lock correctly after first Expense write; attempting to change it returns a clear 400 error.
- [ ] Detail view correctly aggregates and links to all child modules.
- [ ] Sister Profile Reference Code auto-generates correctly as `SIS-0001`, `SIS-0002`, ... and remains unique under concurrent creation.
- [ ] PO Reference remains a separate, always-manual field, never auto-filled or confused with the Reference Code in the UI.

---

## 4. Sourcing Intake

**Purpose:** Field entry point for a new product. Maps to BRD Section 7.2, BR-05–BR-07, FR-01–FR-04, FR-08–FR-09 (variant matrix). **Per updated requirement, this module now also captures the full Packing List field set (Section 2 of Packing_List_Module_Instructions.md) up front, per color, at intake time** — not just the product identity and variant matrix. This means the Packing List module (Module 7) becomes a review/finalize/regenerate step against data already captured here, rather than a from-scratch entry screen.

**Identifier Glossary — which code is which, system-wide:**
Because several similarly-named codes now exist across modules, here is the one authoritative distinction. Every module doc and every screen must use these exact terms — never substitute one for another in a label:

| Identifier | Set On | Format | Who/When Set | Scope |
|---|---|---|---|---|
| Buyer Reference Code | Buyer Profile | `BUY-0001` | Auto-generated at Buyer creation (Module 2); manually overridable | One per buyer, forever |
| Sister Profile Reference Code | Sister Profile | `SIS-0001` | Auto-generated at Sister Profile creation (Module 3); manually overridable | One per PO/order, forever |
| PO Reference | Sister Profile | Free text, e.g. `002F25BV` | Always manual — this is the buyer's own document number, never generated by the system | Belongs to the buyer, not you |
| **Style No** | Product | Free text, e.g. `MRF25` | **Generated once, here, at Sourcing Intake.** Identifies one product/design at the top level — one Style No can have many colors under it. | Read-only everywhere else it appears (Packing List, Invoice, QR codes) — always the same value, never re-entered or regenerated downstream |
| **Pattern No** | Color Row (under a Style) | Free text, e.g. `MR12528` | Entered per color row, also at Sourcing Intake | One per color; several Pattern Nos belong to one Style No |

**The rule that matters most:** Style No is the product-level identifier ("which design is this"); Pattern No is the color-level identifier underneath it ("which color of that design"). A Packing List line, an Invoice line, and a QR code all reference the *same* Style No + Pattern No pair that was generated at intake — they display it, they do not create a new one. If you ever see two different Style No values for what should be the same product across two screens, that's a data bug, not two legitimate identifiers.

**Fields — Product-level (unchanged from original scope):**
| Field | Type | Notes |
|---|---|---|
| Sister Profile | FK | Pre-selected from context |
| Product Name | Text | Required |
| Brand Name | Text | Defaults to "NA" if left blank |
| Style No | Text | Auto-generated, read-only |
| Image Gallery | Repeatable file+label | Label suggestions: Front Label, Back Label, Product Overall, Fabric Close-up, or custom text |

**Fields — Per Color Row (repeatable, no cap; this is where the full Packing List field set is now captured, matching Packing_List_Module_Instructions.md Section 2.1 exactly):**
| # | Field Name | System Field Name | Type | Notes |
|---|---|---|---|---|
| 1 | Pattern No | `pattern_no` | Text | One per color; unique within the style |
| 2 | PO No | `po_no` | Text | Can be entered once at Style level and inherited by every color row (see Packing List doc Section 3.1) |
| 3 | Color | `color_name` | Text | Free text, repeatable row per color |
| 4 | Order Quantity | `order_qty` | Integer | Ordered quantity for this color |
| 5 | Size Range — S/M/L/XL/XXL (configurable set) | `size_breakdown` (JSON) | Integer per size | Units per carton, per size — configurable size set per Packing Rule, not hard-coded (Packing List doc Section 3.2) |
| 6 | Total PC/Per Carton | `pcs_per_carton` | Integer (computed) | Sum of size_breakdown values |
| 7 | Inner Bundle | `inner_bundle` | Integer | |
| 8 | CTN NO (from/to) | `carton_no_from` / `carton_no_to` | Integer | Auto-extends sequentially from the previous color row |
| 9 | CTNS / TTL CTN | `carton_count` / `total_cartons` | Integer | |
| 10 | TTL PCS | `total_pcs` | Integer (computed) | = pcs_per_carton × total_cartons |
| 11 | G.W / N.W (per carton) | `gross_weight_per_carton` / `net_weight_per_carton` | Decimal | |
| 12 | TTL G.W / TTL N.W | `total_gross_weight` / `total_net_weight` | Decimal (computed) | |
| 13 | Carton Measurement L/W/H (inch) | `carton_length_inch` / `carton_width_inch` / `carton_height_inch` | Decimal | |
| 14 | CBM | `cbm` | Decimal (computed) | Same formula as Packing List doc Section 2.1 #25 — confirm divisor with Admin |

**UI Requirements:**
- Mobile-first, but this screen is now heavier than a pure field-capture form — consider a two-step flow on mobile: Step 1 = Product identity + photos (quick, in-field); Step 2 = per-color packing detail (can be completed in-field or handed off to an office-based Employee afterward if the Company Rep doesn't have all weight/measurement data on-site).
- Per-color rows use the same repeatable "Add Color" pattern as the Packing List module — in fact, this should be the **same reusable UI component**, shared between Sourcing Intake and Packing List modules, not two separately built grids that can drift apart.
- Style No and PO No behave as in Packing List doc Section 3.1 (PO No entered once, inherited per row, still stored per row).
- All computed fields (pcs_per_carton, total_pcs, total_gross_weight, total_net_weight, cbm) are read-only and live-calculated, matching Packing List doc Section 4/5 exactly.
- Submit is disabled/blocked with a clear message if the linked Sourcing Trip (Module 6) is still Open (FR-04, FR-70) — this is a hard gate, surface it clearly rather than a generic error.

**API Endpoints:**
- `POST /api/v1/products/`
- `PATCH /api/v1/products/{id}/`
- `POST /api/v1/products/{id}/images/`
- `PATCH /api/v1/products/{id}/color-rows/` — bulk update for per-color packing data (replaces the earlier `variants/` endpoint; one record per color row now carries both the size-matrix quantities and the full packing fields together)

**Business Rules:**
- Style No generation must be collision-free under concurrent submissions (use a DB sequence or UUID-based scheme, not a naive max+1 read-then-write).
- Brand Name empty string or whitespace-only must resolve to "NA" server-side, not just as a UI placeholder.
- Because this data now overlaps with the Packing List module, **the underlying data model must be shared, not duplicated** — a color row entered at Sourcing Intake should populate the same `PackingListLine`-equivalent record that the Packing List module later reviews/edits, not a separate `ProductVariant` table that then has to be manually re-copied into a packing list. See Module 7 note below.
- If packing/weight data isn't yet known at intake time (e.g. carton measurements not confirmed until warehouse stage), these fields must be optional/nullable at intake and completable later in the Packing List module — do not force the Company Rep to block submission on data they don't have yet.

**Acceptance Checklist:**
- [ ] Style No is unique across the whole system, not just per Sister Profile.
- [ ] Per-color rows support 6+ colors without breaking layout (test with 10+ rows), matching the Packing List module's own test.
- [ ] All computed fields match hand-calculated values using the same reference test case as Packing_List_Module_Instructions.md Section 7.
- [ ] Data entered here is directly visible/editable in the Packing List module later — not duplicated or re-entered.
- [ ] Submission blocked while Sourcing Trip is Open, with a clear explanatory message.
- [ ] Fields not yet known at intake time (weights, measurements) can be left blank and completed later without blocking product submission.

**Note for Module 7 (Packing Lists):** Since packing data is now captured at intake, update the Packing List module's role to: pull in the already-entered per-color rows for the Sister Profile's approved products, allow editing/finalizing them (e.g. confirming warehouse-stage weights/measurements not known in the field), and generate the export from that same underlying data — rather than treating Packing List as a separate from-scratch data-entry step.

---

## 5. Admin Approval

**Purpose:** Gate before cost tracking begins. Maps to BRD Section 7.2, BR-08–BR-10, FR-05–FR-07.

**Fields shown (read-only, reviewer view):**
- Product Name, Brand, Style No, Image Gallery, Variant Matrix, linked Sourcing Trip summary (all locations + advances, confirming it's Closed).

**Decision fields:**
| Field | Type | Notes |
|---|---|---|
| Decision | Enum (Approve/Reject) | Required |
| Rejection Reason | Text | Required only if Decision = Reject |

**UI Requirements:**
- Queue/list view: all products in "Pending Admin Approval" status, sorted oldest-first.
- Detail/review screen: full read-only product + sourcing trip summary, Approve/Reject buttons at bottom.
- Reject action opens a required reason field before confirming (no silent reject).
- On approval, show a success state confirming QC team was notified.

**API Endpoints:**
- `GET /api/v1/products/?status=pending_approval`
- `POST /api/v1/products/{id}/approve/`
- `POST /api/v1/products/{id}/reject/` (body: `{ "reason": "..." }`)

**Business Rules:**
- Only Admin role can call approve/reject endpoints (403 for all others).
- Approval only permitted if the linked SourcingTrip status is Closed (defense-in-depth, even though Intake already blocks this — FR-70).
- Every decision writes an AuditLogEntry (FR-82) and triggers a Notification (FR-84).

**Acceptance Checklist:**
- [ ] Rejection without a reason is rejected by the API (400), not just discouraged in the UI.
- [ ] Approval on a still-Open Sourcing Trip is rejected server-side even if somehow reachable in the UI.
- [ ] Audit log entry and notification both fire on every decision.

---

## 6. Sourcing Trips

**Purpose:** Multi-location sourcing tracking. Maps to BRD Section 7.3, BR-11–BR-15, FR-68–FR-71.

**Fields:**
| Field | Type | Notes |
|---|---|---|
| Product | FK | One trip per product |
| Status | Enum (Open/Closed) | Auto-computed, not manually settable |
| Full Payment Confirmed At | Timestamp | Set when Admin/Rep confirms full payment |
| **Location Entries (repeatable):** | | |
| Location Name | Text | |
| Quantity | Integer | |
| Advance Amount | Decimal | |
| Entry Status | Enum (Pending/Reported) | |
| Reported At | Timestamp | Set when marked Reported |

**UI Requirements:**
- Trip detail screen: list of Location Entries, each editable until Reported; "Add Location" button.
- Visual progress indicator (e.g. "3 of 5 locations reported") so field/office users see how close to Closed the trip is.
- "Mark Full Payment & Close Trip" action only enabled once every Location Entry is Reported — disabled state should explain why, not just be greyed out silently.
- Buyer Portal read-only equivalent view (same data, no edit controls) — BR-15, FR-71.

**API Endpoints:**
- `GET/POST /api/v1/sourcing-trips/`
- `POST /api/v1/sourcing-trips/{id}/locations/`
- `PATCH /api/v1/sourcing-trips/{id}/locations/{entry_id}/` (mark Reported)
- `POST /api/v1/sourcing-trips/{id}/close/`

**Business Rules:**
- `close/` endpoint must re-validate server-side that all entries are Reported before flipping status — do not trust client-side state (FR-69).
- Once Closed, Location Entries become read-only (no further edits without reopening, which should be a deliberate, logged Admin action if allowed at all).

**Acceptance Checklist:**
- [ ] Attempting to close a trip with any Pending location returns a 400 with a clear list of which locations are still pending.
- [ ] Buyer Portal shows this data live and correctly, with zero write controls rendered.

---

## 7. Packing Lists

**Purpose:** See the dedicated **Packing_List_Module_Instructions.md** document — full field-by-field spec already produced, including the customizable color assortment. Use that file directly for this module; it is not repeated here to avoid drift between two versions of the same spec.

---

## 8. QC Costs

**Purpose:** QC Person's cost report per product. Maps to BRD Section 7.5, BR-23–BR-26, FR-25–FR-29.

**Fields:**
| Field | Type | Notes |
|---|---|---|
| Report ID | Text | Auto-generated, unique |
| Product | FK | One report per approved product |
| Lunch Cost Applicable | Boolean toggle | |
| Lunch Cost Amount | Decimal | Rendered/required only if toggle is true |
| Goods Carrying Cost | Decimal | Always required |
| Travel Mode | Enum (With Goods / Individually) | |
| Travel Extra Cost | Decimal | Rendered/required only if Travel Mode = Individually |
| Report Total | Decimal (computed) | Sum of applicable cost fields |

**UI Requirements:**
- Single-screen form, conditional fields expand/collapse based on toggle and enum selections (do not just disable — hide non-applicable fields entirely so they can't confuse data entry).
- Running total visible at the bottom, live-updating as fields change.

**API Endpoints:**
- `POST /api/v1/qc-reports/`
- `PATCH /api/v1/qc-reports/{id}/`

**Business Rules:**
- On save, each applicable cost line writes its own row to the Central Expense Table via the shared `record_expense()` service (FR-29) — not one lump-sum row, so later reporting can break costs down by type.
- Only available against products with status = Approved for QC.

**Acceptance Checklist:**
- [ ] Toggling Lunch Cost off clears/nulls the amount field server-side, not just hides it visually.
- [ ] Each cost line appears as its own Expense row with correct `source_type` tagging (`qc_lunch`, `qc_carrying`, `qc_travel_extra`).

---

## 9. Warehouse Costs

**Purpose:** Loading/packaging cost entry + custom/extra costs. Maps to BRD Section 7.6, BR-27–BR-31, FR-30–FR-33.

**Fields:**
| Field | Type | Notes |
|---|---|---|
| QC Report | FK | Opened via Report ID |
| Loader Cost | Decimal | Required |
| Extra Worker Cost | Decimal | Optional |
| Packaging Checkboxes | 6 × (Boolean + Decimal) | Labels, Hangtags, Stickers, Cartons, Poly Bags, Gum Tape — each checkbox reveals its own cost field |
| Custom Cost Fields (repeatable) | Text (name) + Decimal (amount) + Text (remarks, optional) | User-named, add as many as needed |
| Extra Costs (repeatable) | Decimal (amount) + Text (remarks, optional) | Simpler, no name field — distinct entry path from Custom Cost Field |

**UI Requirements:**
- Checkbox list where checking reveals an inline amount field next to that item (not a separate section).
- "Add Custom Cost Field" and "Add Extra Cost" as two visibly distinct buttons/sections — per BRD, these are deliberately two different entry patterns, don't merge them into one generic "add cost" button.
- Running total at the bottom.

**API Endpoints:**
- `POST /api/v1/warehouse-costs/`
- `POST /api/v1/warehouse-costs/{id}/custom-fields/`
- `POST /api/v1/warehouse-costs/{id}/extra-costs/`

**Business Rules:**
- Same as QC Costs: every line item writes its own Expense row, tagged by specific `source_type` (`warehouse_loader`, `warehouse_packaging_item`, `custom_field`, `extra_cost`) (FR-72).
- Unchecked packaging items must not be stored as zero-value rows — exclude entirely (per SRS FR-19 note).

**Acceptance Checklist:**
- [ ] Custom Cost Field and Extra Cost remain two distinct API paths and two distinct Expense `source_type` values.
- [ ] Unchecked checkboxes produce no Expense row at all.

---

## 10. Expenses

**Purpose:** Read/report surface for the Central Expense Table. Maps to BRD Section 7.9, BR-48, FR-72–FR-73.

**Fields displayed (read-only list, this module doesn't create expenses directly — those come from QC Costs, Warehouse Costs, Sourcing Trip advances, etc.):**
| Field | Notes |
|---|---|
| Sister Profile | Filterable |
| Product | Filterable, nullable |
| Source Type | Filterable (sourcing_advance, qc_lunch, qc_carrying, qc_travel_extra, warehouse_loader, warehouse_packaging_item, custom_field, extra_cost) |
| Amount | |
| Currency | |
| Remarks | |
| Created By / Created At | |

**UI Requirements:**
- Filterable, sortable table — by Buyer Profile, Sister Profile, Source Type, date range, currency, recorded-by, free-text search. Filtering is server-side (`GET /expenses/` query params), so the table isn't limited to the rows one page happened to fetch.
- Totals row/summary at the top or bottom reflecting current filter, **per currency** — Expense rows carry their own `currency`, so a single blended total would be meaningless.
- Drill-through link from each row back to its originating record (e.g. click a `qc_lunch` row to open that QC Report).

**Download (`GET /expenses/export/`):**
- Takes the same query params as the list, plus `filetype` (`xlsx` default / `csv` / `pdf`) and `groupBy` (`none`, `buyer`, `sisterProfile`, `product`, `sourceType`, `recordedBy`, `month`, `currency`). `sourceType` accepts a comma-separated list so one file can cover several categories.
- `filetype`, not `format` — DRF reserves `format` for renderer selection and an unrecognized value there breaks routing before the view runs.
- xlsx: Summary sheet (resolved filter block + per-currency grand total + per-group breakdown) and Expenses sheet (all rows, subtotal row per group per currency). pdf: same content, landscape A4. csv: plain header + data rows with a UTF-8 BOM, no meta block, so it imports cleanly.
- Refuses over `MAX_EXPORT_ROWS` (20,000) with a "narrow your filters" 400 rather than building a document that won't fit in memory.
- Supplier-side roles only (`IsSupplierStaff`): every format carries columns the buyer-facing `ExpenseSelfSerializer` withholds. Each download writes an `EXPORT_EXPENSES` audit entry (FR-82).

**API Endpoints:**
- `GET /api/v1/expenses/?sister_profile=&source_type=&date_from=&date_to=`
- `GET /api/v1/expenses/summary/` — grouped totals by source_type

**Business Rules:**
- This module is read-only in the UI — no create/edit forms here; all writes happen via the originating modules (FR-39 principle: one shared write service, many read consumers).

**Acceptance Checklist:**
- [ ] Filtering and totals stay consistent (filtered total = sum of visible rows).
- [ ] Drill-through links correctly resolve to source records across all module types.

---

## 11. Settlement Ledger

**Purpose:** Live balance position per Sister Profile. Maps to BRD Section 7.9, BR-49–BR-51, FR-74–FR-76.

**Fields displayed:**
| Field | Notes |
|---|---|
| Sister Profile | |
| Agreement Type + Rate | Pulled from Sister Profile config |
| Total Advance Received | |
| Total Recorded Expense | |
| Amount Owed | Computed per Agreement Type formula |
| Net Position | Advance − Expense; negative triggers alert |

**UI Requirements:**
- One ledger view per Sister Profile (accessible from its detail screen) plus a cross-profile list view for Admin/Management.
- Net Position rendered with clear positive/negative visual treatment (green/red).
- Negative positions show an alert banner with a link to add funds/record advance, or otherwise resolve.
- Buyer Portal shows the same ledger, read-only, scoped to their own Sister Profiles only (BR-51).

**API Endpoints:**
- `GET /api/v1/sister-profiles/{id}/ledger/`
- `GET /api/v1/ledgers/?buyer=` (cross-profile list, Admin/Management only)

**Business Rules:**
- Ledger recomputes on every Expense/Payment/Advance write (FR-75), not on a schedule — verify this is triggered from the same service call, not a separate cron job that could lag.
- Amount Owed formula must correctly branch on Agreement Type (1: % of total purchase, 2: per-piece rate × pieces, 3: extras + commission) using the Sister Profile's stored rate config.

**Acceptance Checklist:**
- [ ] Ledger numbers match hand-calculated values for at least one test case per Agreement Type.
- [ ] Negative Net Position correctly triggers the alert (Module 1 Dashboard + notification).
- [ ] Buyer Portal ledger view is confirmed read-only and correctly scoped.

---

## 12. Invoices

**Purpose:** Commercial invoice generation and lifecycle. Maps to BRD Section 7.8, BR-36–BR-47, FR-42–FR-59.

**Fields:**
| Field | Type | Notes |
|---|---|---|
| Invoice No | Text | Auto-generated |
| Sister Profile | FK | |
| Source Packing List(s) | FK (m2m) | One or more, within same Sister Profile |
| Line Items | Repeatable | Description, brand, ctn, qty/carton, total qty, unit price, amount, net/gross weight, CBM, style/item code, remarks — each referencing its source Packing List row |
| Exchange Rate | FK, locked at generation | Copied value, not live reference |
| Commission Type | Enum (%/flat) | |
| Commission Value | Decimal | |
| Status | Enum (Draft/Pending Approval/Issued/Rejected/Void) | |
| Created By (Employee) / Approved By (Admin) | FK | |
| Payments (repeatable) | Date, Amount, Method/Reference | |
| Outstanding Balance | Decimal (computed) | Total + Commission − Sum(Payments) |
| Void Reason | Text | Required only if Status = Void |

**UI Requirements:**
- Builder screen: select Sister Profile → select approved Packing List(s) → line items pre-fill, editable remarks per line → select published exchange rate → set commission → submit for approval.
- Once Issued, line items and totals render read-only; a visible "Void" action (with required reason) is the only lifecycle action available.
- Payment recording as a separate simple sub-form on the invoice detail screen, updating Outstanding Balance live.
- Export button producing a PDF matching the business's existing invoice layout.

**Document layout (implemented — `apps/invoicing/exports.py`):**
The export is a combined **Commercial Invoice / Packing List**, in both PDF (landscape A4) and Excel, carrying the same content:
1. Company letterhead from `CompanyProfile` — the uploaded banner image, or a typeset name/tagline/address block when no logo is set. The banner *replaces* the text block rather than stacking above it, since a real letterhead already carries the address.
2. Consignee block (buyer name, branding, contact info, PO / Sister Profile) and invoice meta (No, date, status).
3. Line table: Mark, **Foto**, Description, Brand, Color/Size, CTN, QTY/CTN, T.QTY, Unit Price, Amount, N.W, T/N.W, G.W, T/G.W, Size (L×W×H cm), CBM/ctn, CBM, Composition, HS Code. CBM/ctn and HS Code are dropped from the PDF only — nineteen columns don't fit landscape A4 at a readable size.
4. Totals block: value and converted value, commission, paid, outstanding, exchange rate, total qty / cartons / cube / net weight / gross weight.
5. Bank details footer from `CompanyProfile`.

- **Photos** come from the line's source `Product.images.first()`, thumbnailed to 220px. A missing, unreadable or deleted image degrades to an empty cell — never a failed download. The letterhead is thumbnailed at 1400px since it prints ~180mm wide.
- Excel writes amounts as **numbers**, not preformatted strings, with a live `SUM()` totals row.

**Calculation (all server-side, `services.compute_line_item`):**
`totalQty = ctn × qtyPerCtn`, `amount = totalQty × unitPrice`, `cbmPerCtn = L×W×H ÷ 1,000,000` (cm), `cbm = ctn × cbmPerCtn`, `netWeight/grossWeight = ctn × per-carton`. **A value supplied by the caller always wins** — short/excess cartons are real and the packing list is the authority. Carton dimensions arrive in inches from `PackingCarton` and are converted to cm on the way in (`dimensionsInCm: false`); no packing data is migrated.

**Currency:**
- `sourceCurrency` prices the lines; `targetCurrency` + `exchangeRateValueLocked` give the conversion.
- `rateQuote` records which way the locked rate reads: `multiply` (target = source × rate — what a published `ExchangeRate` means, and the default so pre-existing invoices are unaffected) or `divide` (`1 target = rate source`, i.e. "1 USD = 120 BDT" as typed by hand). Storing the direction keeps the printed figure identical to the one entered and avoids rounding a financial document through a 1/120 reciprocal.
- A published rate wins over a typed one when both are given: it's the auditable one.

**API Endpoints:**
- `POST /api/v1/invoices/`
- `POST /api/v1/invoices/{id}/submit/`
- `POST /api/v1/invoices/{id}/approve/`
- `POST /api/v1/invoices/{id}/reject/`
- `POST /api/v1/invoices/{id}/void/`
- `POST /api/v1/invoices/{id}/payments/`
- `GET /api/v1/invoices/{id}/export/?lang=en|ka`

**Business Rules:**
- Exchange rate value copied onto the invoice at generation — verify no live FK is used for display (BR-41, FR-57).
- Issued invoices are immutable except via Void (BR-46, FR-49) — no in-place edits, ever.
- Every status transition writes an AuditLogEntry (FR-82).

**Acceptance Checklist:**
- [ ] Changing a published exchange rate after invoice issuance does not alter any existing invoice's displayed rate.
- [ ] Attempting to edit line items on an Issued invoice is rejected server-side (400/403), not just hidden in the UI.
- [ ] Void requires a reason and preserves all original data (no hard delete).

---

## 13. Exchange Rates

**Purpose:** Admin-managed custom exchange rates. Maps to BRD Section 7.8, BR-40–BR-42, FR-55–FR-59.

**Fields:**
| Field | Type | Notes |
|---|---|---|
| Source Currency | Text/Enum | |
| Target Currency | Text/Enum | |
| Rate | Decimal | Manually entered, not a live market feed |
| Effective Date | Date | |
| Published By | FK (Admin) | |

**UI Requirements:**
- List view of all published rates, sorted by effective date descending.
- Create form: Admin-only, straightforward fields above.
- Employees see a read-only picker (dropdown of currently published rates) when generating an invoice — not this management screen at all.

**API Endpoints:**
- `GET/POST /api/v1/exchange-rates/` (POST restricted to Admin)
- `GET /api/v1/exchange-rates/published/` (Employee-facing read-only list)

**Business Rules:**
- Only Admin role can create exchange rate records (BR-42).
- Historical rates are never deleted, only superseded by a newer effective-dated entry (FR-58).

**Acceptance Checklist:**
- [ ] Employee role cannot POST to this endpoint (403).
- [ ] Rate history remains fully queryable for audit purposes.

---

## 14. Document Vault

**Purpose:** Per-Sister-Profile document storage. Maps to BRD Section 7.11, BR-59, FR-85.

**Fields:**
| Field | Type | Notes |
|---|---|---|
| Sister Profile | FK | |
| Document Type | Enum | PO, Contract, Invoice, Packing List, QC Photo, Other |
| File | File upload | |
| Uploaded By / Uploaded At | Auto | |

**UI Requirements:**
- Grid or list view, filterable by Document Type, scoped to the current Sister Profile's detail screen.
- Upload widget with document-type tagging at upload time.
- Buyer Portal shows the same vault, read-only, scoped to their own Sister Profiles.

**API Endpoints:**
- `GET/POST /api/v1/sister-profiles/{id}/documents/`
- `DELETE /api/v1/documents/{id}/` (Admin only, consider soft-delete for audit consistency)

**Business Rules:**
- File uploads scoped and validated against the Sister Profile's `buyer_id` on every request, same as all other buyer-scoped data.

**Acceptance Checklist:**
- [ ] Buyer Portal can view/download but never upload or delete.
- [ ] Documents correctly filtered by type and remain scoped to their Sister Profile only.

---

## 15. Audit Log

**Purpose:** System-wide change history. Maps to BRD Section 7.11, BR-57, FR-82–FR-83.

**Fields displayed:**
| Field | Notes |
|---|---|
| Actor | Who made the change |
| Action | e.g. approve, reject, void, publish_rate, create_expense |
| Entity Type / Entity ID | What was changed |
| Before / After snapshot | JSON diff view |
| Timestamp | |

**UI Requirements:**
- Filterable table: by Actor, Entity Type, Action, date range.
- Row expand to show before/after JSON diff in a readable (not raw-JSON-dump) format — e.g. a simple field-by-field comparison.
- Admin-only screen; not exposed to Buyer Portal in Phase 1 (FR-83).

**API Endpoints:**
- `GET /api/v1/audit-log/?actor=&entity_type=&action=&date_from=&date_to=`

**Business Rules:**
- Write path for audit entries should be a shared decorator/service called from every sensitive action (Expense writes, approvals, rate publishing, invoice actions) — do not rely on each module remembering to log independently; centralize the call.

**Acceptance Checklist:**
- [ ] Every action listed in FR-82 produces a corresponding audit entry — verify with a checklist run-through of each triggering action.
- [ ] Non-Admin roles cannot access this endpoint (403).

---

## 16. Users

**Purpose:** Internal user/role management (not Buyer Portal users — those are managed via Module 2, Buyers).

**Fields:**
| Field | Type | Notes |
|---|---|---|
| Name / Email | Text | |
| Role | Enum | Admin, Company Representative, QC Person, Warehouse Manager, Employee, Management |
| Assigned Sister Profiles | FK (m2m) | For non-Admin/Management roles, scopes what they can see/act on |
| Status | Enum (Active/Inactive) | |

**UI Requirements:**
- List view with role filter.
- Create/edit form: role selector drives which "Assigned Sister Profiles" picker appears (Admin/Management don't need this field — they see everything).

**Account Creation Flow (Employee/internal logins):**
1. Admin clicks "New User" → enters Name, Email, selects Role from the dropdown (Admin, Company Representative, QC Person, Warehouse Manager, Employee, Management).
2. Admin sets an initial password directly (same manual pattern as Buyer accounts — no self-registration for internal staff either, consistent with the platform's overall no-self-signup approach).
3. If Role is not Admin/Management, the "Assign Sister Profiles" picker appears — Admin selects which Sister Profiles this user can see and act on. Admin/Management skip this step; they see everything by design.
4. On save, system creates the `User` record with the chosen role and, where applicable, the assigned-profile links.
5. Admin can revisit "Assign Sister Profiles" at any time as new POs come in, without recreating the user.

**API Endpoints:**
- `GET/POST /api/v1/users/` — POST creates the internal user account (role + initial password)
- `GET/PATCH /api/v1/users/{id}/`
- `POST /api/v1/users/{id}/assign-profiles/`
- `POST /api/v1/users/{id}/reset-password/`

**Business Rules:**
- Only Admin can create/edit users, change role assignments, or reset passwords.
- Deactivating a user should not delete their historical records (created_by references must remain intact for audit purposes).
- This module and Module 2 (Buyers) are the only two places accounts are created in the system — Buyer logins always go through Module 2 (bound to a Buyer Profile), Employee/internal logins always go through this module. Keep them as two distinct flows; do not merge into one generic "create account" screen, since the required fields and downstream linkage differ (buyer_profile_id vs. assigned Sister Profiles + role).

**Acceptance Checklist:**
- [ ] Non-Admin/Management users only see and can act on Sister Profiles they're explicitly assigned to, verified across Modules 4–14.
- [ ] Deactivated users' historical audit/creation records remain fully intact and viewable.
- [ ] Admin can create an Employee/QC/Warehouse/Company Rep account and assign Sister Profiles in one flow.

---

## 17. Final QC & QR

**Purpose:** Missing from the current build/sidebar. This is a distinct step from Module 8 (QC Costs) — QC Costs captures the *cost report*; this module captures the *final verified product data* and generates the dual QR codes that gate the status change to "Completed." Maps to BRD Section 7.7, BR-32–BR-35, FR-22, FR-25–FR-27, FR-34–FR-38. Add "Final QC & QR" as its own sidebar item, positioned after Packing Lists and before Invoices (matching the pipeline order in the App Workflow doc, Section 4, Step 9).

**Fields:**
| Field | Type | Notes |
|---|---|---|
| Product | FK | Must have status = Ready for Final QC (i.e. Warehouse Costs step already completed) |
| Final Goods Name | Text | Confirmed/corrected product name at final inspection |
| Final Price | Decimal | Confirmed unit price |
| Fabric Details | Text | Material composition, etc. |
| Finalized Packing List | FK / confirmation | Confirms the Packing List (Module 7) is locked and correct as of this point |
| Product QR Code | Generated, read-only | Encodes: size, color, quantity, fabric, price (JSON payload, versioned schema per SRS FR-25) |
| Carton QR Code | Generated, read-only | Encodes: carton contents, total quantity, QC Report ID (SRS FR-26) |

**UI Requirements:**
- Queue/list view: all products with status = "Ready for Final QC," so QC Person can see what's waiting.
- Detail screen: form for Final Goods Name / Price / Fabric Details, plus a read-only summary of the already-finalized Packing List (pulled from Module 7, not re-entered).
- Two clearly separate "Generate Product QR" and "Generate Carton QR" actions (they encode different data and can be generated at different times — don't merge into one button).
- Once both QR codes exist, the screen shows a "Mark Completed" confirmation (or auto-transitions — see Business Rules) and both QR images are downloadable/printable individually or as a batch sheet (SRS FR-38, Should-priority).
- Status badge on this screen and everywhere else in the app should read "Completed" only after this gate passes — verify this is the same status value/enum used across Sourcing Intake, Admin Approval, Sourcing Trips, Packing Lists, and the Buyer Portal's Sourcing Progress tab, not a separate parallel status field.

**API Endpoints:**
- `GET /api/v1/products/?status=ready_for_final_qc`
- `PATCH /api/v1/products/{id}/final-qc/` — saves Final Goods Name, Price, Fabric Details
- `POST /api/v1/products/{id}/generate-product-qr/`
- `POST /api/v1/products/{id}/generate-carton-qr/`

**Business Rules:**
- Status auto-transitions to "Completed" only when **both** QR codes exist for the product (BR-35, FR-27) — this must be a server-side check triggered after each QR generation call, not a manual status dropdown.
- QR generation should be blocked if Final Goods Name / Price / Fabric Details aren't yet saved — the QR payload depends on this data being finalized first.
- QR payload stored as structured JSON with a `schema_version` field so future payload changes don't break already-printed QR codes (SRS FR-25 note).

**Acceptance Checklist:**
- [ ] This screen/module actually exists in the sidebar and is reachable — closing the gap identified above.
- [ ] Status only flips to "Completed" once both QR codes are generated, verified with a test that generates only one and confirms status stays at the prior stage.
- [ ] QR payload correctly encodes the specified fields and can be scanned/decoded to verify content matches the source product record.
- [ ] "Completed" status is consistent across every module that displays it, including the Buyer Portal.

---

## 18. Buyer Portal — Full Experience

**Purpose:** The current Buyer Portal (see reference screenshot) only shows 4 KPI tiles and a bare "Recent Sourcing Requests" table — nowhere near what BR-52–BR-56 / FR-77–FR-81 actually require. This section is the real spec for what a logged-in buyer must be able to see. Every screen here is read-only and scoped strictly to the logged-in buyer's own Buyer Profile (enforced server-side, per DRF Migration Instructions Section 2).

**Overall structure:** Buyer Portal has its own left-nav (simpler than the Admin sidebar), reflecting only what a buyer needs:

```
Dashboard
My Orders (Sister Profiles)
  └─ [Order Detail] — tabs: Overview | Sourcing Progress | Costs | Ledger | Packing List | Invoices | Documents
```

### 18.1 Dashboard (replaces the current bare version)

| Section | Content |
|---|---|
| Welcome header | Buyer name, portal login label (as today) |
| KPI tiles | Total Orders (Sister Profiles), Orders In Progress, Orders Completed, Outstanding Balance across all orders (sum of all Settlement Ledgers) |
| Active Sourcing Trips | List of currently Open Sourcing Trips across all their orders, with a live "X of Y locations reported" progress indicator |
| Recent Activity | Chronological feed: status changes, invoices issued, payments recorded — pulled from the same events that trigger Notifications (FR-84), filtered to this buyer only |
| Alerts | Negative-balance alerts, if any, shown prominently at the top |

### 18.2 My Orders (Sister Profile list)

- Table: PO Reference, Agreement Type, Status, Order Date, Current Balance — one row per Sister Profile belonging to this buyer.
- Click-through to Order Detail.

### 18.3 Order Detail — Overview Tab

- PO Reference, Agreement Type + rate (buyer should be able to see the terms they agreed to), current pipeline status (Sourcing Trip Open → ... → Completed → Invoice Issued), key dates.

### 18.4 Order Detail — Sourcing Progress Tab

Maps to BR-15, FR-71. For every product under this order:
- Product name, brand, style no, photo thumbnail.
- Sourcing Trip status (Open/Closed) with a location-by-location breakdown: location name, quantity sourced there, advance paid there, reported status — exactly the data captured in Module 6, read-only here.
- Current pipeline status badge (Pending Approval / Approved for QC / In Warehouse / Ready for Final QC / Completed) — this is the "Recent Sourcing Requests" table from the current screenshot, but expanded per-product with full trip detail instead of just a one-line status.

### 18.5 Order Detail — Costs Tab

Maps to BR-51 (Expense visibility). A read-only breakdown, grouped by source type, of every cost recorded against this order:
- Sourcing advances (by location), QC costs, warehouse costs, custom/extra costs — same data as Module 10 (Expenses), filtered to this buyer's Sister Profile, with a running total.
- No remarks/internal notes that are marked internal-only should leak here (add an `is_internal` flag to Expense remarks if the business wants to keep some notes staff-only — flag this as a decision for Admin to confirm).

### 18.6 Order Detail — Settlement Ledger Tab

Maps to BR-51, FR-74–FR-76. Exactly Module 11's ledger view, scoped to this one Sister Profile:
- Total Advance Received, Total Recorded Expense, Amount Owed (per their Agreement Type), Net Position — with the same positive/negative visual treatment as the Admin view.
- This is the single most important buyer-facing screen — it directly answers "is my money still net positive or negative right now," which was explicitly requested in the original brainstorm.

### 18.7 Order Detail — Packing List Tab

- Read-only rendering of the finalized (or in-progress) packing list for this order, matching the Packing List module's fields (Section 2 of Packing_List_Module_Instructions.md) — buyer sees the same table structure staff work with, minus edit controls.
- Download button for PDF/Excel export.

### 18.8 Order Detail — Invoices Tab

Maps to BR-36–BR-47 (buyer-facing subset). For each invoice on this order:
- Invoice No, Status, Total Value, Commission, Exchange Rate used, Outstanding Balance, Payment history (date/amount/method).
- Download button for the invoice PDF, buyer's choice of English or Georgian.

### 18.9 Order Detail — Documents Tab

Maps to BR-59, FR-85. Same as Module 14 (Document Vault), scoped to this Sister Profile, download-only (no upload/delete controls rendered for the Buyer role at all).

**API Endpoints (all Buyer-role-scoped, read-only):**
- `GET /api/v1/portal/dashboard/`
- `GET /api/v1/portal/orders/`
- `GET /api/v1/portal/orders/{id}/` (overview)
- `GET /api/v1/portal/orders/{id}/sourcing-progress/`
- `GET /api/v1/portal/orders/{id}/costs/`
- `GET /api/v1/portal/orders/{id}/ledger/`
- `GET /api/v1/portal/orders/{id}/packing-list/`
- `GET /api/v1/portal/orders/{id}/invoices/`
- `GET /api/v1/portal/orders/{id}/documents/`

Note these are dedicated Buyer Portal endpoints, not the Admin endpoints with fields hidden client-side — per SRS FR-45/FR-46, write separate buyer-facing serializers so there's no risk of an Admin-only field leaking through a shared serializer.

**Business Rules:**
- Every one of these endpoints must filter by `request.user.buyer_profile_id` at the queryset level — reuse the `TenantScopedViewSet` base class from DRF Migration Instructions Section 2 for all of them, not ad-hoc filtering per view.
- None of these screens render any create/edit/delete control for the Buyer role, anywhere — verify this explicitly, not just by omission.

**Acceptance Checklist:**
- [ ] A buyer with two Sister Profiles sees both correctly under "My Orders," and only their own — verified with a cross-buyer access test (attempt to fetch another buyer's order ID, expect 403/404).
- [ ] Sourcing Progress tab shows live location-by-location data matching what staff entered in Module 6, with no lag beyond the near-real-time target in SRS NFR.
- [ ] Settlement Ledger tab numbers match the Admin-side ledger for the same Sister Profile exactly.
- [ ] No write-capable UI element (button, form, edit icon) appears anywhere in the Buyer Portal.
- [ ] Invoice and packing list downloads work in both English and Georgian.

---

## How to Use This Pack

Feed one module section at a time to your AI coding assistant, alongside the DRF Migration Instructions for architecture rules. Suggested prompt pattern:

> "Using the attached BRD, SRS, DRF Migration Instructions, and the '[Module Name]' section of the Module Documentation Pack, build the UI and API for this module. Follow the tenant-scoping and service-layer rules. Include tests per the Acceptance Checklist before moving to the next module."

Recommended build order follows the sidebar top-to-bottom, which also matches the natural pipeline sequence: Buyers → Sister Profiles → Sourcing Intake → Admin Approval → Sourcing Trips → Packing Lists → QC Costs → Warehouse Costs → **Final QC & QR (Module 17 — currently missing from the build, add it here)** → Expenses → Settlement Ledger → Invoices → Exchange Rates → Document Vault → Audit Log → Users → Buyer Portal (Module 18, build last since it depends on all the data-producing modules above already existing).

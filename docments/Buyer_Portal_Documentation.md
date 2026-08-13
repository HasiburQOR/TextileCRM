# Buyer Portal Documentation
### Textile Sourcing, Traceability & Buyer CRM Platform
Full specification for the Buyer Portal — every screen a logged-in buyer sees. Companion to BRD v2.0 (Section 7.10), SRS v2.0 (FR-77–FR-81), and the DRF Migration Instructions (tenant scoping rules).

---

# Buyer Portal — Full Experience

**Purpose:** The current Buyer Portal (see reference screenshot) only shows 4 KPI tiles and a bare "Recent Sourcing Requests" table — nowhere near what BR-52–BR-56 / FR-77–FR-81 actually require. This section is the real spec for what a logged-in buyer must be able to see. Every screen here is read-only and scoped strictly to the logged-in buyer's own Buyer Profile (enforced server-side, per DRF Migration Instructions Section 2).

**Overall structure:** Buyer Portal has its own left-nav (simpler than the Admin sidebar), reflecting only what a buyer needs:

```
Dashboard
My Orders (Sister Profiles)
  └─ [Order Detail] — tabs: Overview | Sourcing Progress | Costs | Ledger | Packing List | Invoices | Documents
```

### 17.1 Dashboard (replaces the current bare version)

| Section | Content |
|---|---|
| Welcome header | Buyer name, portal login label (as today) |
| KPI tiles | Total Orders (Sister Profiles), Orders In Progress, Orders Completed, Outstanding Balance across all orders (sum of all Settlement Ledgers) |
| Active Sourcing Trips | List of currently Open Sourcing Trips across all their orders, with a live "X of Y locations reported" progress indicator |
| Recent Activity | Chronological feed: status changes, invoices issued, payments recorded — pulled from the same events that trigger Notifications (FR-84), filtered to this buyer only |
| Alerts | Negative-balance alerts, if any, shown prominently at the top |

### 17.2 My Orders (Sister Profile list)

- Table: PO Reference, Agreement Type, Status, Order Date, Current Balance — one row per Sister Profile belonging to this buyer.
- Click-through to Order Detail.

### 17.3 Order Detail — Overview Tab

- PO Reference, Agreement Type + rate (buyer should be able to see the terms they agreed to), current pipeline status (Sourcing Trip Open → ... → Completed → Invoice Issued), key dates.

### 17.4 Order Detail — Sourcing Progress Tab

Maps to BR-15, FR-71. For every product under this order:
- Product name, brand, style no, photo thumbnail.
- Sourcing Trip status (Open/Closed) with a location-by-location breakdown: location name, quantity sourced there, advance paid there, reported status — exactly the data captured in Module 6, read-only here.
- Current pipeline status badge (Pending Approval / Approved for QC / In Warehouse / Ready for Final QC / Completed) — this is the "Recent Sourcing Requests" table from the current screenshot, but expanded per-product with full trip detail instead of just a one-line status.

### 17.5 Order Detail — Costs Tab

Maps to BR-51 (Expense visibility). A read-only breakdown, grouped by source type, of every cost recorded against this order:
- Sourcing advances (by location), QC costs, warehouse costs, custom/extra costs — same data as Module 10 (Expenses), filtered to this buyer's Sister Profile, with a running total.
- No remarks/internal notes that are marked internal-only should leak here (add an `is_internal` flag to Expense remarks if the business wants to keep some notes staff-only — flag this as a decision for Admin to confirm).

### 17.6 Order Detail — Settlement Ledger Tab

Maps to BR-51, FR-74–FR-76. Exactly Module 11's ledger view, scoped to this one Sister Profile:
- Total Advance Received, Total Recorded Expense, Amount Owed (per their Agreement Type), Net Position — with the same positive/negative visual treatment as the Admin view.
- This is the single most important buyer-facing screen — it directly answers "is my money still net positive or negative right now," which was explicitly requested in the original brainstorm.

### 17.7 Order Detail — Packing List Tab

- Read-only rendering of the finalized (or in-progress) packing list for this order, matching the Packing List module's fields (Section 2 of Packing_List_Module_Instructions.md) — buyer sees the same table structure staff work with, minus edit controls.
- Download button for PDF/Excel export.

### 17.8 Order Detail — Invoices Tab

Maps to BR-36–BR-47 (buyer-facing subset). For each invoice on this order:
- Invoice No, Status, Total Value, Commission, Exchange Rate used, Outstanding Balance, Payment history (date/amount/method).
- Download button for the invoice PDF, buyer's choice of English or Georgian.

### 17.9 Order Detail — Documents Tab

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


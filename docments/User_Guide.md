# User Guide — Textile Sourcing, Traceability & Buyer CRM Platform

A plain-English guide to using the app. If you're new, read **Getting Started** and **How the Pipeline Works** first — everything else is a reference you can jump to by module.

---

## 1. Getting Started

### Logging in

Open the app at **http://localhost:5173** (or wherever it's deployed) and sign in with a username/password. There are two very different experiences depending on who logs in:

- **Staff (Admin, Company Rep, QC, Warehouse, Employee, Management)** land in the full **Admin App** — the sidebar with all 16 modules described below.
- **Buyers** land in a separate, much simpler **Buyer Portal** — read-only, scoped to only their own orders. See [Section 3](#3-the-buyer-portal-what-a-buyer-sees).

### Demo accounts

These accounts already exist in the system so you can log in as any role and see exactly what that role sees:

| Username | Password | Role | What they can do |
|---|---|---|---|
| `admin` | `admin123` | Admin | Everything — the only role that can approve products, manage users, publish exchange rates, reset buyer passwords, and issue/void invoices |
| `hasib` | `pass123` | Company Representative | Field-facing: create sourcing intake entries, run sourcing trips |
| `karim` | `pass123` | QC Person | Final QC & QR, QC cost reports |
| `rahim` | `pass123` | Warehouse Manager | Warehouse cost reports |
| `nasrin` | `pass123` | Employee | Packing lists, invoices |
| `farzana` | `pass123` | Management | Read-only oversight across Buyers, Sister Profiles, everything else |
| `ridoy` | `ridoy123` | Buyer | Buyer Portal — read-only view of their own orders only |

> Passwords are demo-only, not meant for a production environment. In production, an Admin creates every staff account (Module 16) and every buyer login (Module 2) — there is no public sign-up page anywhere in the system, by design.

### The sidebar, and who sees what

The left sidebar shows only the modules relevant to the logged-in role. Admin always sees everything; every other role sees a curated subset. If a module you expect is missing from your sidebar, it's almost always because your role doesn't need it — not a bug. See the table in [Section 4](#4-roles-at-a-glance) for exactly who sees what.

---

## 2. How the Pipeline Works (read this once, it explains everything)

Every product this business sources moves through the same fixed sequence of stages. Understanding this sequence is the key to understanding the whole app, because almost every module exists to handle one stage of it:

```
1. Sourcing Intake        →  A Company Rep logs a new product: name, brand, photos,
                              per-color packing detail (sizes, cartons, weights).

2. Sourcing Trip           →  Money goes out to source it. The Rep records every
                              location visited, quantity picked up there, and the
                              advance paid — one trip per product, closes only once
                              every location is confirmed "Reported."

3. Admin Approval          →  Once the Sourcing Trip is Closed, the product enters
                              a queue. Admin reviews photos + trip summary and
                              Approves or Rejects (with a required reason).

4. Packing List            →  The per-color packing data captured at intake gets
                              reviewed/finalized here — confirming any weights or
                              measurements not known out in the field — and rolls
                              up into the shippable packing list with grand totals.

5. QC Costs                →  The QC Person logs their trip costs (lunch, carrying,
                              travel) against the product. Each cost line becomes
                              its own entry in the central Expense ledger.

6. Warehouse Costs          →  The Warehouse Manager logs loading + packaging costs
                              (labels, hangtags, cartons, etc.) plus any custom or
                              extra costs. Same ledger, same pattern.

7. Final QC & QR            →  Once warehouse work is done, QC (or Admin) records
                              the truly final goods name/price/fabric details and
                              generates two QR codes — one identifying the product,
                              one identifying the shipping carton. The product only
                              becomes "Completed" once BOTH codes exist.

8. Invoice                  →  An Employee builds a commercial invoice from the
                              finalized packing list(s), locks in an exchange rate,
                              sets commission, and submits it for Admin approval.
                              Once Issued, an invoice can never be edited — only
                              Voided with a reason, or paid down via Payments.

Throughout all of this:
  Expenses          — every cost from steps 5–6 (and sourcing advances from
                      step 2) lands in one central ledger, viewable by source.
  Settlement Ledger — the live "who owes what" balance per order, computed
                      from that same ledger against the buyer's agreement rate.
  Documents, Audit Log, Notifications — supporting records that apply across
                      every stage above.
```

Every "status" you see badged on a product (Sourcing Trip Open → Pending Approval → Approved for QC → In Warehouse → Ready for Final QC → Completed) is just this pipeline, one step at a time. A product can only move forward — never skip a step — and several transitions are hard-gated server-side (e.g. you cannot submit for approval while a Sourcing Trip is still Open; you cannot generate a QR code before saving the Final QC data).

---

## 3. The Buyer Portal — what a buyer sees

Buyers log into a completely separate, simplified view — no sidebar full of internal modules, just their own orders:

- **Dashboard** — KPI tiles (total orders, in progress, completed, outstanding balance), active sourcing trips with live progress, a recent-activity feed, and negative-balance alerts front and center.
- **My Orders** — one row per Sister Profile (their PO), click through to see everything about it.
- **Order Detail**, tabbed:
  - **Overview** — PO reference, agreement terms, current pipeline status.
  - **Sourcing Progress** — live location-by-location sourcing data, per product.
  - **Costs** — every expense recorded against this order, grouped by type.
  - **Ledger** — the same Settlement Ledger staff see, scoped to this order: advance received, expense recorded, amount owed, net position.
  - **Packing List** — the finalized packing list, read-only.
  - **Invoices** — status, totals, payment history, downloadable PDF (English or Georgian).
  - **Documents** — download-only document vault for this order.

Nothing in the Buyer Portal has a create/edit/delete button anywhere — it is deliberately 100% read-only, and every screen is scoped so a buyer can only ever see their own orders (verified server-side, not just hidden in the UI).

---

## 4. Roles at a Glance

| Role | Sidebar modules |
|---|---|
| **Admin** | Everything, always — plus exclusive actions (approve/reject products, publish exchange rates, void/approve invoices, manage users, reset buyer passwords) |
| **Management** | Dashboard, Buyers, Sister Profiles, Sourcing Trips, everything else read-mostly — the oversight role |
| **Company Representative** | Sourcing Intake, Sourcing Trips, Packing Lists, Expenses |
| **QC Person** | Packing Lists, Final QC & QR, QC Costs, Expenses |
| **Warehouse Manager** | Warehouse Costs, Expenses |
| **Employee** | Sourcing Intake, Packing Lists, Invoices, Expenses |
| **Buyer** | Buyer Portal only (separate app, see Section 3) |

A handful of modules (Admin Approval, Exchange Rates, Audit Log, Users) have no `roles` restriction visible to non-admins at all — Admin is the only role that ever sees them in the sidebar.

---

## 5. Module Reference

Each module below: what it's for, who can use it, and how to actually use it.

### Dashboard
Landing page for staff. Live counts (open Sourcing Trips, products pending approval, this month's expenses), negative-balance alerts, and the last 10 audit log entries — every tile is clickable through to the filtered module behind it.

### Buyers *(Management)*
The top of the tenant hierarchy — one record per buyer company. Create a buyer, set their portal login here, and view all their Sister Profiles (orders) from the detail page. Only Admin can create/edit a buyer or reset their portal password.

### Sister Profiles *(Management)*
One record per Purchase Order/shipment. Each one belongs to a Buyer and carries an Agreement Type (percentage, per-piece rate, or commission structure) that governs how the Settlement Ledger calculates what's owed. **Once any cost has been recorded against it, the Agreement Type locks** — this is intentional, not a bug, so the money math can't shift mid-order.

### Sourcing Intake *(Company Rep, Employee, Management)*
Where a new product enters the system. Fill in product identity (name, brand, style number — auto-generated) and photos, then add one row per color with its full packing detail: order quantity, size breakdown, carton range, weights, and measurements. Click any photo to open it full-screen in a gallery viewer. Use **View / Edit / Delete** on any product afterward to correct mistakes — Edit reopens every field, including every color row, not just the top-level product info.

### Admin Approval *(Admin)*
A queue of every product waiting on a decision, sorted oldest first. Open one, review the photos and sourcing trip summary, then Approve or Reject. Rejecting requires a reason — there's no silent reject. This gate only opens once the linked Sourcing Trip is Closed.

### Sourcing Trips *(Company Rep, Management)*
One trip per product. Add a location entry for every place goods were sourced (location name, quantity, advance paid), then mark it Reported once confirmed. **"Close Trip" only becomes available once every location is Reported** — the button explains why it's disabled if it isn't yet. Use View/Edit/Delete to fix location entries before they're reported; once reported, an entry is locked (its advance is already booked as an expense).

### Packing Lists *(Employee, Company Rep, Management)*
Reviews and finalizes the packing data captured at intake into a shippable packing list, with grand totals and a summary box (order qty, ship qty, short/excess %, total cartons/weight/CBM). Product photos show inline with the same gallery viewer as Sourcing Intake. "Add Fields" appends another color row; carton numbering extends automatically from the previous row. Full View/Edit/Delete on any packing list.

### Final QC & QR *(QC, Admin)*
The last checkpoint before a product is marked Completed. Open a product from the "Ready for Final QC" queue, save the Final Goods Name / Final Price / Fabric Details, then generate the **Product QR** (encodes size/color/quantity/fabric/price) and the **Carton QR** (encodes carton contents and the QC Report ID) — these are two separate buttons and two separate codes on purpose. **You must save the final data before either QR can generate, and the product only flips to Completed once both codes exist** — both rules are enforced by the server, not just the UI. Every generated QR code can be downloaded as a PNG for printing.

### QC Costs *(QC, Management)*
One cost report per approved product: lunch cost (toggle), goods carrying cost, and travel cost (only if traveling individually rather than with the goods). Each applicable line becomes its own entry in the Expense ledger, tagged by type, so costs can be broken down later. Full View/Edit/Delete.

### Warehouse Costs *(Warehouse, Management)*
Loader cost, extra worker cost, six packaging checkboxes (each revealing its own cost field when checked — labels, hangtags, stickers, cartons, poly bags, gum tape), plus repeatable Custom Cost Fields and Extra Costs (two deliberately separate entry patterns). Unchecked items never create an expense row. Full View/Edit/Delete.

### Expenses *(QC, Warehouse, Company Rep, Employee, Management)*
The read-only ledger every cost above feeds into. Filter by Sister Profile, source type, or date range; totals stay in sync with whatever's currently filtered. Click any row to jump back to the report that created it. Nothing is ever created or edited directly here — that would break the single-source-of-truth rule the whole costing system depends on.

### Settlement Ledger *(Management)*
The live balance for a Sister Profile: total advance received, total expense recorded, amount owed (computed from the order's Agreement Type), and net position — shown in green if positive, red with an alert if negative. Recalculates immediately on every new expense, no delay.

### Invoices *(Employee, Management)*
Build an invoice by picking a Sister Profile and its finalized packing list(s); line items pre-fill from that data. Lock in a published exchange rate and set commission, then submit for Admin approval. **Once Issued, an invoice can never be edited** — the only lifecycle action left is Void (with a required reason), which preserves the original data rather than deleting it. Record payments against an invoice and watch the outstanding balance update live. Export as a bilingual PDF (English/Georgian). Delete is only available for invoices that were never issued (Pending Approval or Rejected).

### Exchange Rates *(Admin to publish, everyone else reads)*
Admin-only screen to publish manual exchange rates (not a live feed) with an effective date. Older rates are never deleted, only superseded — so historical invoices always keep the rate they were actually generated with. Employees building an invoice see a simple read-only picker of currently published rates.

### Document Vault
Per-Sister-Profile file storage, tagged by type (PO, Contract, Invoice, Packing List, QC Photo, Other). Upload/delete for staff; buyers see the same vault read-only, download-only.

### Audit Log *(Admin)*
Every sensitive action in the system — approvals, rejections, rate publishing, invoice status changes — writes an entry here automatically: who did what, to what, with a before/after snapshot. Filter by actor, entity type, action, or date range.

### Users *(Admin)*
Create and manage staff accounts (this is separate from Buyer portal logins, which live under the Buyers module). Assign a role; non-Admin/Management roles can additionally be scoped to specific Sister Profiles so they only see what they're assigned to. Deactivating a user never deletes their historical records — everything they created stays intact for audit purposes.

### Notifications
Not in the sidebar — open it from the bell icon in the header. A feed of events relevant to you (approvals, rejections, trip closures) as they happen.

---

## 6. Frequently Asked "Why can't I..."

- **"Why can't I submit this product for approval?"** — Its Sourcing Trip is still Open. Every location needs to be marked Reported, then the trip closed, before submission unlocks.
- **"Why is the QR button greyed out on Final QC?"** — Save Final Goods Name, Final Price, and Fabric Details first; QR generation is blocked until that data exists, so the code never encodes blanks.
- **"Why can't I edit this invoice?"** — It's already Issued. Issued invoices are permanently locked by design (so nothing changes after a buyer has seen it) — Void it and create a new one if it's genuinely wrong.
- **"Why is the Agreement Type field locked on this Sister Profile?"** — Because a cost has already been recorded against it. Changing the rate formula after money has moved would make historical numbers stop adding up.
- **"Why can't I delete this Sourcing Trip location?"** — It's already been Reported, meaning its advance is already booked as an expense. Deleting it would leave the ledger out of sync with what was actually recorded.
- **"I'm logged in as an Employee/QC/Warehouse user and half the sidebar is missing"** — Expected. Each role only sees the modules relevant to their job; Admin is the only role that sees the full list.

---

## 7. Known Limitations (as of this audit)

Honest caveats, so nothing here surprises you in day-to-day use.

**Fixed during this audit:**
- **Agreement Type/Rate lock was silently broken** — `SisterProfile.is_rate_locked()` always returned `False` (a leftover stub from before the Expense ledger existed), so Admin could change an order's Agreement Type or rate even after costs had already been recorded against it, which would have made historical Settlement Ledger numbers stop adding up. Fixed to check for existing expense history, and verified live: editing the rate on an order with recorded costs now correctly returns a 400 error, while unrelated fields (status, PO reference) still edit fine.

**Still open, worth knowing about:**
- **Internal staff (Company Rep, QC, Warehouse, Employee) currently see every Sister Profile / order, not just ones assigned to them.** The spec describes an "Assigned Sister Profiles" scoping concept for these roles; it isn't built — there's no assignment field anywhere yet. Fine for a small trusted team working the same shared pipeline (which is how the app is used today), but worth flagging before onboarding a larger staff where teams should be walled off from each other's orders.
- **Buyers/Sister Profiles have no "Deactivate" action yet** — the spec calls for soft-deactivation instead of deletion once an order has history, but today there's simply no delete *or* deactivate control, so no data-loss risk, just a missing convenience action.
- **A few list pages (Sourcing Trips inside Sister Profile detail, Expenses, Audit Log, Document Vault) fetch up to a few hundred rows at once with no pagination control** — fine at today's data volume, worth adding real pagination before this scales to thousands of records.
- **No demo Employee/Management accounts existed until this audit** — they've now been added (`nasrin` / `farzana`, see Section 1) purely so every role can be demoed; feel free to rename or remove them.
- **`PlaceholderPage.tsx`** is a leftover unused file in the frontend — never routed, safe to ignore or delete.

Everything else audited — every one of the 16 sidebar modules, the Buyer Portal's 3 screens, and all role-based permission checks — is implemented, wired to real data, and enforces its business rules server-side (not just hidden in the UI).

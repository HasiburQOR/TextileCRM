# Buyer Wallet
### Textile Sourcing, Traceability & Buyer CRM Platform
Companion to BRD v2.0 Section 7.9 (Central Expense Table & Settlement Ledger) and Module Documentation Pack Module 11 (Settlement Ledger). This module adds a real, transaction-based cash wallet per Buyer Profile — distinct from, but feeding data to, the existing Settlement Ledger.

---

## Purpose

Every buyer has one pooled Wallet at the Buyer Profile level (not per Sister Profile). Admin tops it up when the buyer sends funds; every real cost incurred across any of that buyer's Sister Profiles — Sourcing Intake advances, Sourcing Trip location advances, Packing List costs, QC Costs, Warehouse Costs, custom/extra costs — automatically deducts from this same pool. The Wallet answers one question at a glance, for both Admin and the buyer: **"how much cash does this buyer currently have with us, and is it positive or negative?"**

This is deliberately a single shared pool across all of a buyer's orders (per your decision) — a buyer running three POs at once has one balance, not three, since money they send isn't earmarked to a specific PO unless you choose to earmark it manually (see Section 6, optional enhancement).

---

## Relationship to the Settlement Ledger (Module 11) — do not merge these

| | Buyer Wallet (this module) | Settlement Ledger (existing) |
|---|---|---|
| Scope | One pool per Buyer Profile | One ledger per Sister Profile |
| Tracks | Actual cash: real top-ups minus real expenses | Contractual amount owed, computed per Agreement Type formula |
| Deduction basis | Raw actual cost, always | % of purchase (Type 1), per-piece rate (Type 2), or extras+commission (Type 3) |
| Answers | "Do they have enough cash with us right now?" | "How much do they owe us under this specific order's agreement?" |

Both are needed. The Wallet is the liquidity check that lets Admin/buyer see cash position instantly; the Settlement Ledger is what actually gets invoiced. They share the same underlying Expense Table as their data source, so there is one write path, not two.

---

## Data Model

```
BuyerWallet
  id
  buyer_profile_id (FK, one-to-one with BuyerProfile)
  currency
  created_at

WalletTransaction  (append-only — never update or delete a row; reverse with a new row instead)
  id
  wallet_id (FK)
  type (enum: top_up | deduction | refund | adjustment)
  amount            -- positive for top_up/refund, negative for deduction; adjustment can be either
  currency
  exchange_rate_used (nullable — only set if amount required conversion, locked at transaction time)
  source_type (nullable, enum — mirrors Expense.source_type: sourcing_advance, qc_lunch,
                qc_carrying, qc_travel_extra, warehouse_loader, warehouse_packaging_item,
                custom_field, extra_cost, manual_top_up, manual_adjustment)
  source_expense_id (FK to Expense, nullable — set for every deduction so it traces back to
                      the exact QC Report / Warehouse Cost / Sourcing Trip entry that caused it)
  sister_profile_id (FK, nullable — tags which order the spend was for, even though the
                      balance itself is pooled at the buyer level; needed for reporting/breakdown)
  method_reference (text, nullable — bank transfer ID, cheque no., etc., required for top-ups)
  reason (text, nullable — required for manual adjustments and refunds)
  created_by (FK user)
  created_at
```

`BuyerWallet.balance` is never stored as a mutable field — it's always `SUM(WalletTransaction.amount)` for that wallet, computed live or cached/materialized and recomputed on every write (same pattern as the Settlement Ledger's recompute rule).

---

## Functional Requirements

| ID | Requirement |
|---|---|
| WF-01 | System creates exactly one BuyerWallet automatically when a Buyer Profile is created (Module 2) — never created separately/manually. |
| WF-02 | Admin can record a Top-up: amount, currency, method/reference (required). Writes one `top_up` WalletTransaction. |
| WF-03 | Every Expense write (from Sourcing Trip advances, QC Costs, Warehouse Costs, Custom/Extra Costs, Packing List-related costs) triggers exactly one `deduction` WalletTransaction in the same service call as the Expense row — via the shared `record_expense()` service extended to also write the wallet side (see Business Rules). |
| WF-04 | Each deduction transaction stores `source_expense_id` and `sister_profile_id` so spend is fully traceable to its origin and attributable to a specific order for reporting, even though the balance is pooled. |
| WF-05 | If an Expense is voided/corrected, system writes a `refund` transaction reversing the original deduction — never deletes or edits the original row. |
| WF-06 | Admin can make a manual `adjustment` transaction (positive or negative) with a required reason — for corrections that don't map to a specific Expense (e.g. bank fee, manual correction). |
| WF-07 | Wallet balance recomputes on every transaction write, near-real-time (same target as Settlement Ledger, sub-minute). |
| WF-08 | System raises a Negative-Balance Alert when wallet balance goes below zero, and a Low-Balance Alert at a configurable threshold before it reaches zero (e.g. 10% of average monthly spend, or an Admin-set flat amount per buyer). |
| WF-09 | Optionally, once balance crosses a configurable floor (default: zero), new cost-producing actions (Sourcing Intake submission, QC Report save, Warehouse Cost save) are soft-blocked with a clear message, requiring Admin override to proceed. (Confirm with Admin whether hard-stop or alert-only is wanted before building — flagged as open decision, see below.) |
| WF-10 | Buyer Portal displays the Wallet balance and full transaction history (top-ups and deductions, each with its source description) — read-only, scoped to their own wallet only. |
| WF-11 | Admin dashboard/Buyer detail screen shows the same balance and transaction history, plus the ability to top-up and adjust. |
| WF-12 | Every WalletTransaction write generates an AuditLogEntry (actor, action, amount, reason/reference). |

---

## UI Requirements

**Admin — Buyer Profile detail screen, new "Wallet" tab:**
- Large balance display at top, green/red per sign, currency shown.
- "Add Top-up" button → form: amount, currency, method/reference.
- "Adjust Balance" button (separate, visually distinct from Top-up) → form: amount (+/-), required reason.
- Transaction history table below: Date, Type, Amount, Source (e.g. "QC Cost — Style MRF25" linking through to that QC Report), Sister Profile, Running Balance column.
- Filter by Sister Profile, by transaction type, by date range — since the pool is shared, Admin needs to be able to answer "how much of this buyer's spend came from Order X" even though the balance itself isn't split.

**Buyer Portal — new "Wallet" section (add to the nav alongside Dashboard/My Orders, or as a tab on the Buyer Portal Dashboard):**
- Same balance display and transaction history, fully read-only, no Top-up/Adjust controls rendered at all.
- Each deduction row should be understandable to a buyer without jargon — e.g. "Warehouse packaging — PO 002F25BV — $45.00" rather than raw `source_type` enum values.

**Dashboard (Module 1) update:**
- Add a "Buyers with Negative Wallet Balance" widget alongside the existing Settlement Ledger negative-balance alert — these are two different signals (cash liquidity vs. contractual owed amount) and both deserve visibility.

---

## API Endpoints

- `GET /api/v1/buyers/{id}/wallet/` — balance + summary
- `GET /api/v1/buyers/{id}/wallet/transactions/?sister_profile=&type=&date_from=&date_to=`
- `POST /api/v1/buyers/{id}/wallet/top-up/` (Admin only)
- `POST /api/v1/buyers/{id}/wallet/adjust/` (Admin only, reason required)
- `GET /api/v1/portal/wallet/` (Buyer role, read-only, self-scoped — no `{id}` param, resolved from the authenticated buyer's own profile)

---

## Business Rules

- **Single write path.** Extend the existing `record_expense()` service (SRS FR-72/FR-39) so that writing an Expense row and writing its corresponding wallet `deduction` transaction happen inside the same atomic transaction. Never let a module call these separately — that's how the two ledgers drift apart.
- **Pooled balance, per-order traceability.** The balance itself has no `sister_profile_id`; only individual transactions do. Reports that need a per-order breakdown sum transactions filtered by `sister_profile_id`; they never split the wallet itself.
- **Append-only.** No `WalletTransaction` row is ever updated or hard-deleted. Corrections are always a new reversing/adjusting row, consistent with the Invoice Void pattern (BR-46) and the Audit Log's requirement for reconstructable history.
- **Currency conversion locked at transaction time**, same rule as Invoice exchange rates (BR-41) — if a deduction is in a different currency than the wallet's base currency, the rate used is stored on that transaction permanently.
- **Only Admin** can create Top-up or Adjustment transactions; Deduction and Refund transactions are only ever system-generated from the Expense/Void flows, never manually created directly.

---

## Open Decision (confirm before building WF-09)

**Hard-block vs. alert-only on negative/low balance.** A hard block protects against overspend but could stall field operations (a Company Rep mid-sourcing-trip shouldn't necessarily be blocked from logging an already-committed advance just because the buyer's wallet dipped negative). Suggested middle ground: **alert-only for Sourcing Trip/QC/Warehouse cost entry** (spend already committed in the field shouldn't be blocked), but **hard-block on generating a new Sourcing Intake request or Invoice** if the wallet is materially negative beyond a configurable buffer — this stops new commitments without freezing work already in motion. Confirm this split with Admin before implementing WF-09 as anything stricter than an alert.

---

## Acceptance Checklist

- [ ] Every Buyer Profile has exactly one BuyerWallet, created automatically at Buyer creation.
- [ ] A Top-up and a subsequent Expense-driven Deduction both appear correctly in transaction history with correct running balance.
- [ ] Voiding/correcting an Expense produces a Refund transaction, not a silent edit — original deduction remains visible in history.
- [ ] Wallet balance is provably always `SUM(transactions)` — no drift between a cached balance field (if used) and the transaction log, verified with a reconciliation test.
- [ ] Buyer Portal shows full transaction history read-only, with human-readable source descriptions, correctly scoped to only their own wallet.
- [ ] Negative and low-balance alerts fire correctly and are visible on both the Admin Dashboard and the Buyer Portal.
- [ ] Manual Adjustment always requires and stores a reason; attempting one without a reason is rejected server-side.

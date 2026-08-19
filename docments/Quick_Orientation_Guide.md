# Quick Orientation Guide

A short map of the system: what each module is for, how money moves, and the
order you actually do things in. For deep detail on any one module, see
`Module_Documentation_Pack.md`; for step-by-step screens, see `User_Guide.md`.

---

## What this app is

A sourcing and traceability platform for a textile buying house. The supplier
side (you) sources goods in Bangladesh on behalf of overseas buyers, records
every cost along the way, and issues commercial invoices. Buyers get a
read-only portal to watch their own orders and money.

There are **two front doors**, same login page, different destination by role:

| Front door | Who | Where |
|---|---|---|
| **Admin panel** | Your staff (admin, management, employee, company rep, QC, warehouse) | everything under `/` |
| **Buyer portal** | Your customers | `/portal` — their orders, documents and wallet only |

---

## The one idea to understand first

Everything hangs off a two-level structure:

```
Buyer Profile          "Nordvik Retail Group"        — the customer, BUY-0001
  └── Sister Profile   "NRG-PO-2026-014"             — ONE purchase order, SIS-0002
        ├── Products, sourcing costs
        ├── Packing lists
        ├── Warehouse costs
        └── Invoices
```

A **Buyer Profile** is the customer. A **Sister Profile** is a single
purchase order / shipment for that customer. Every product, cost, packing
list and invoice belongs to exactly one Sister Profile.

Each Sister Profile carries two things that decide how money is handled:

**1. The agreement** — how you get paid on this order. A label only; the
actual rate is typed on each invoice.

| Agreement | Meaning | Rate you enter on the invoice |
|---|---|---|
| Supplier-funded | You buy everything and cover all expenses; the buyer pays you a percentage of the purchase | a percentage |
| Per piece | You earn a fixed amount on every piece | an amount per piece |
| Cost + commission | You front the costs, the buyer reimburses them in full and adds a commission | a percentage |

**2. The currency pair and exchange rate** — e.g. `BDT → USD @ 120`, read as
*"1 USD = 120 BDT"*. Costs are spent in the supplier currency and charged to
the buyer in theirs, converted at this rate.

> Set the rate when you create the profile. Once any cost is recorded against
> it the currency configuration locks, because changing it would restate money
> the buyer has already been charged.

---

## How money moves — two separate tracks

This is the part people mix up. They are **not** the same pot.

**Track 1 — the Buyer Wallet (cash you hold).**
The buyer wires you money up front; an admin records it as a top-up. Every
cost you record anywhere in the system automatically deducts from that wallet.
Nothing else touches it.

```
Buyer wires 10,000 USD   →  top-up          →  balance 10,000 USD
Warehouse cost 12,000 BDT →  auto-deduction  →  balance  9,900 USD
                             (12,000 ÷ 120 = 100 USD)
```

Every wallet row shows **both** figures — what was spent on the ground
(12,000 BDT) and what came off the balance (100 USD) — plus the rate it was
converted at. That rate is frozen on the row: if you renegotiate later, past
transactions and any refunds against them keep the original rate.

A negative balance means the buyer has spent past what they funded. It raises
an alert on the dashboard.

**Track 2 — the Invoice (what you bill).**
An invoice is a separate commercial document with its own payments and
outstanding balance. It is where the agreement charge is calculated. Recording
a payment against an invoice does **not** move the wallet.

---

## The modules

Ordered roughly the way an order flows through them.

| Module | What it's for |
|---|---|
| **Dashboard** | Counts, buyer funds received/charged per currency, and negative-balance alerts |
| **Buyers** | The customer record, plus their pooled wallet: balance, top-ups, adjustments, full history |
| **Sister Profiles** | One per purchase order. Sets the agreement and the currency/exchange rate. Its overview shows where the order's money has gone |
| **Product Templates** | Reusable custom-field sets so intake forms match how you actually record a product type |
| **Sourcing Intake** | Register products with per-colour variants, sizes and quantities. Goes through admin approval |
| **Sourcing Costs** | Costs from a sourcing trip, per product per location. Each one deducts the wallet |
| **Packing Lists** | Carton-level packing: quantities, weights, dimensions, CBM. Feeds invoice lines |
| **Warehouse Costs** | Loading, extra workers, packaging materials, extra costs. Each one deducts the wallet |
| **Expenses** | The central table of every cost recorded anywhere, in both currencies. Read-only view with filters and export |
| **Invoices** | Build the commercial invoice from packing lists, apply the agreement charge, approve, issue, record payments, export PDF/Excel |
| **Exchange Rates** | Published reference rates. Informational — invoices use the Sister Profile's own rate |
| **Document Vault** | Files attached to an order, visible to the buyer |
| **Audit Log** | Who changed what, including currency and agreement edits |
| **Users / Admin Approval / Company Profile** | Staff accounts, pending approvals, and your letterhead + bank details printed on invoices |

---

## A typical order, start to finish

1. **Create the buyer** (Buyers → New). A wallet is created automatically.
2. **Record their payment** (Buyer detail → Top up) — this is the cash you now hold.
3. **Create a Sister Profile** for the PO. Pick the agreement, set the currency
   pair and the exchange rate.
4. **Add products** (Sourcing Intake) with colours, sizes and order quantities.
   Admin approves them.
5. **Record costs as they happen** — sourcing costs on the trip, warehouse costs
   at packing. Each deducts the wallet automatically, converted at the profile's
   rate. Nothing to do by hand.
6. **Build the packing list** once cartons are packed.
7. **Create the invoice** from that packing list. Unit prices are in the buyer's
   currency. Enter the agreement rate; the panel on the right shows what the
   order has cost so far, in both currencies, so you can sanity-check the charge.
8. **Admin approves** the invoice — it becomes Issued and the buyer is notified.
9. **Export** as PDF or Excel (English or Georgian) and send it.
10. **Record payments** against the invoice as they arrive.

---

## Who sees what

| Role | Can do |
|---|---|
| **admin** | Everything, including approvals, top-ups, users, exchange rates and all money settings |
| **management** | Buyers, sister profiles and every operational screen |
| **employee** | Sourcing intake, packing lists, invoices, expenses, documents |
| **company_rep** | Sourcing intake, sourcing costs, packing lists, expenses, documents |
| **qc** | Expenses and documents |
| **warehouse** | Warehouse costs, expenses, documents |
| **buyer** | Their own orders, documents, invoices and wallet — read-only, in the portal |

Only an admin can create a buyer, create or edit a Sister Profile, top up a
wallet, or approve an invoice.

Buyers can only ever see their own data; the system scopes every request by
buyer, so there is no way to reach another customer's records.

---

## Things that trip people up

- **The wallet and the invoice are separate.** Paying an invoice does not top
  up the wallet, and a wallet deduction is not a bill.
- **The agreement rate is per invoice, not per profile.** The profile says
  *how* you charge; each invoice says *how much*. Every invoice needs a rate.
- **A rate of 0 means "not agreed yet."** Costs still record, but pass through
  to the wallet unconverted and invoices print no converted total. Set the rate
  before recording costs.
- **Per-piece agreements read the rate differently.** On a per-piece order,
  `0.35` means 0.35 per piece — on a 2,000-piece order that is 700, not 0.35%.
- **Issued invoices are never edited.** Fix the rate while it is still Pending
  Approval; after that, Void it (with a reason) and reissue.
- **Corrections are always reversing entries**, never edits — a deleted cost
  writes a refund row at the original rate, leaving the history intact.

---

### A note on the older docs

`User_Guide.md` and `Module_Documentation_Pack.md` predate the agreement and
currency rework. Where they describe a per-profile commission rate, a
"Settlement Ledger" screen, or per-invoice exchange-rate entry, this guide is
the current behaviour.

# Worked Example — Men's T-Shirt, 1,000 pcs: Sourcing Intake to Issued Invoice

A complete start-to-finish walkthrough of one real shipment through the system,
with every figure computed and every screen named. Use it as the reference when
training someone on the invoice flow, or as a check that a change hasn't moved a
number that shouldn't have moved.

Every total in this document has been arithmetically verified against the source
figures. Where the source figures disagreed with themselves, that is called out
rather than silently resolved — see **Two figures that need your decision** below.

---

## 0. Two figures that need your decision

The expense list as supplied contains two lines whose stated total does not match
its own multiplication:

| Expense | As written | Multiplication gives | Difference |
| --- | --- | --- | --- |
| QC | `1250 TK × 2 = 2400 tk` | **2,500** | 100 |
| Cartons | `28 × 135 tk = 3640 tk` | **3,780** | 140 |

Both are readable two ways, and the system will happily record either:

- **The stated total is right, the unit rate is a typo.** `2400 ÷ 2 = 1200/head`,
  and `3640 ÷ 28 = 130/carton`. Both land on clean round rates, which is mildly
  suggestive.
- **The unit rate is right, the total is a typo.** Then QC is 2,500 and cartons
  are 3,780.

This moves the invoice by **240 tk**:

| Basis | Expense total | Invoice TOTAL VALUE |
| --- | --- | --- |
| Totals as written | 18,795 tk | **283,795 tk** |
| Recomputed from unit rates | 19,035 tk | **284,035 tk** |

**This document uses the recomputed basis (19,035 / 284,035)** because the system
computes packaging cost from a per-unit rate and would produce those figures
naturally. Confirm which you want before issuing the real invoice — after Admin
approval the numbers are locked (BR-46) and the only exit is Void.

---

## 1. The goods

| Field | Value |
| --- | --- |
| Product | Men's T-Shirt |
| Material | 100% Cotton |
| Order qty | 1,000 pcs |
| Sizes | S, M, L, XL, XXL |
| Size ratio | 1 : 1 : 2 : 1 : 1 |
| Colours | Black, Navy, Grey, White |
| Rate | 265 tk / pc |
| Pack | 36 pcs per carton |
| Cartons | 27 full + 1 part carton (28 pcs) = **28 cartons** |
| Carton size | 50 × 40 × 30 cm |

**Quantity reconciles exactly:** `27 × 36 = 972`, `972 + 28 = 1,000 pcs` ✓

**Size ratio inside one full carton** — the ratio sums to 6, and `36 ÷ 6 = 6`, so
each full carton holds:

| S | M | L | XL | XXL | Total |
| --- | --- | --- | --- | --- | --- |
| 6 | 6 | 12 | 6 | 6 | 36 |

### Weights and volume

| | Per carton | × cartons | Total |
| --- | --- | --- | --- |
| Net (full) | 14.00 kg | × 27 | 378.00 kg |
| Net (part carton) | 10.90 kg | × 1 | 10.90 kg |
| **Total net** | | | **388.90 kg** |
| Gross (full) | 15.65 kg | × 27 | 422.55 kg |
| Gross (part carton) | 12.50 kg | × 1 | 12.50 kg |
| **Total gross** | | | **435.05 kg** |
| CBM | 0.06 | × 28 | **1.68 CBM** |

CBM per carton is `50 × 40 × 30 ÷ 1,000,000 = 0.06`. Note that the system stores
carton dimensions in **inches** on the Packing List and converts to cm on the way
into the invoice — so if you enter 50/40/30 on a Packing List, tick the
centimetres option, or the invoice will print 127 × 101.6 × 76.2 cm.

> **Open point — colour split.** 1,000 pcs across 4 colours is 250 each, but 28
> cartons does not divide evenly by 4 colours at 36 pcs/carton (250 ÷ 36 = 6.9).
> So the cartons cannot be solid-colour with this pack. This document treats the
> cartons as **assorted** (all four colours mixed, per the size ratio). If your
> cartons are actually solid-colour, the carton count per colour needs deciding
> before the Packing List is built, and the line items below split differently.

---

## 2. Sourcing Intake — create the Product

**Screen:** Sourcing Intake → New Product

| Field | Value |
| --- | --- |
| Sister Profile | *(the buyer's order)* |
| Product name | Men's T-Shirt |
| Material | `100% Cotton` |
| Brand | *as applicable* |

`Material` matters here: it is captured once at intake and carried automatically
onto every invoice line generated from this product, so the Material column on
the printed document fills itself. Add a photo labelled **Product Overall** — the
export picks that label preferentially for the Foto column, falling back to the
earliest upload.

Then add one **Variant per colour** (Black, Navy, Grey, White) with the size
breakdown above.

---

## 3. Packing List

**Screen:** Packing Lists → New

Build **two carton rows**, because the full cartons and the part carton have
genuinely different weights and quantities. One row averaging them would give a
per-carton weight matching no actual carton on the dock.

| Row | Cartons | Pcs/ctn | Ship qty | Net/ctn | Gross/ctn | L×W×H (cm) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 — full | 27 | 36 | 972 | 14.00 | 15.65 | 50 × 40 × 30 |
| 2 — part | 1 | 28 | 28 | 10.90 | 12.50 | 50 × 40 × 30 |

Totals: **28 cartons, 1,000 pcs, 388.90 kg net, 435.05 kg gross, 1.68 CBM.**

---

## 4. Warehouse Cost — all the expenses

**Screen:** Warehouse Costs → New Warehouse Cost

Record against the **Sister Profile**, and set **Packing List** to the one from
step 3 so the cost is tied to this specific shipment. Every field below writes a
row into the Central Expense Table automatically and deducts the buyer's wallet —
you never enter these twice.

### Mapped to the built-in fields

| Form field | Value | From your list |
| --- | --- | --- |
| Loading | 400 | Loading |
| Extra worker | 7,500 | Packer man 3,750 + Finishing/Packing man 3,750 |
| Poly bags | 2,200 | Poly |
| Cartons | 3,780 | 28 × 135 |
| Gum tape | 98 | Gum / Scotch tape |
| Stickers | 112 | Shipping mark, 28 × 4 |
| | **14,090** | *subtotal* |

### Mapped to custom cost fields

The remainder has no dedicated checkbox, so each goes in as a named custom cost
(**+ Add custom cost**, name + amount):

| Custom field name | Amount |
| --- | --- |
| QC | 2,500 |
| Unloading | 400 |
| Carrying / Van | 720 |
| Personal Transport | 310 |
| Lunch | 960 |
| Marker | 55 |
| | **4,945** |

> Loading and Unloading are split deliberately — the built-in `Loading` field is
> a single figure, so recording unloading as its own custom line keeps both
> visible and separately correctable later.
>
> QC goes in as a custom cost rather than through the QC module, since the QC
> report step is not part of the live workflow.

**Warehouse Cost total: 14,090 + 4,945 = 19,035 tk** ✓

---

## 5. Invoice

**Screen:** Invoices → New Invoice

1. Pick the **Sister Profile**.
2. Tick the **Packing List** from step 3 — both carton rows arrive as invoice
   lines, pre-filled with quantities, weights and dimensions.
3. Tick the **Warehouse Cost** from step 4 — it arrives as one more line, priced
   at its own total.
4. Enter the **rate of 265** against each of the two product lines. The warehouse
   line is already priced.
5. Leave **Line Currency** as `BDT`.

### The three lines

| # | Description | Ctn | Qty | Rate | Amount |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | Men's T-Shirt — full cartons | 27 | 972 | 265 | 257,580 |
| 2 | Men's T-Shirt — part carton | 1 | 28 | 265 | 7,420 |
| 3 | Warehouse Cost — *(PL ref)* | 1 | 1 | 19,035 | 19,035 |
| | **TOTAL VALUE** | **28** | **1,000** | | **284,035** |

Product `265,000` + warehouse `19,035` = **284,035 tk**.

### What the printed document shows

The exported PDF/Excel prints **one money figure — TOTAL VALUE 284,035 BDT** —
plus the payment record and the physical totals. There are no per-line Unit Price
or Amount columns on the document, and no commission or exchange-rate lines. The
per-line rates above still exist in the system and still drive the total; they
are simply not what this document communicates.

> **Leave Commission set to None.** Commission is no longer printed but is still
> applied to the outstanding balance, so setting one produces a document reading
> `TOTAL VALUE 284,035` above an outstanding figure that doesn't match it.

The line table on the document carries the packing detail: № / Foto / Description
/ Brand / Details / CTN / QTY-CTN / T.QTY / N.W / T-N.W / G.W / T-G.W / SIZE
(L,W,H) / CBM-ctn / CBM / Material / Style No.

---

## 6. Approve, pay, deliver

| Step | Who | What happens |
| --- | --- | --- |
| Submit | Employee | Invoice created as **Pending Approval** |
| Fix payment options | Employee/Admin | **Edit Payment** — rate/commission/currency, Pending only |
| Approve | **Admin** | → **Issued**. Buyer notified. Figures lock (BR-46) |
| Record Payment | Admin | Issued only. Outstanding recomputes on every write |
| Correct a payment | Admin | Payments are editable and deletable while Issued |
| Export | anyone with access | PDF or Excel, English or Georgian |

**Before approving**, make sure Company Profile carries the letterhead, the bank
details, and the **seal & signature** — the seal prints bottom-right of every
invoice above the *Authorized Signatory* line, and the letterhead prints centred
at the top. A missing bank block prints a visible "not yet configured" notice.

### What the buyer sees

The buyer signs into the portal → **My Orders** → this order → **Invoices** tab,
where the invoice is listed with its status, total and outstanding balance, and
**PDF** / **Excel** download buttons. Buyers only ever reach their own invoices —
another buyer's id returns the same 404 as one that doesn't exist.

---

## 7. Summary

| | |
| --- | --- |
| Goods | 1,000 pcs Men's T-Shirt, 100% cotton, 4 colours, S–XXL @ 1:1:2:1:1 |
| Cartons | 28 (27 full @ 36 + 1 part @ 28) |
| Net / Gross | 388.90 kg / 435.05 kg |
| Volume | 1.68 CBM |
| Goods value | 265,000 tk |
| Shipment expenses | 19,035 tk |
| **Invoice TOTAL VALUE** | **284,035 tk** |

*(283,795 tk if the expense totals are taken as written — see section 0.)*

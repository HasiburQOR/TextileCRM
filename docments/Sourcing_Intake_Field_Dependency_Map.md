# Sourcing Intake: How Every Field Connects

A study guide for the **Sourcing Intake** page (`/products`). For every field it answers three questions:

1. **Where does the value come from?** Typed by you, or calculated from other fields?
2. **What does it change on the same screen?**
3. **Where does it go later?** Packing List, Invoice, Buyer Portal, QR codes, Sourcing Costs, and so on.

Written from the code at commit `bb78b55` (2026-09-30), then updated after the 8 bugs in section 9 were fixed (marked ✅ FIXED wherever they appear). The main source files:

- Screen: [ProductsPage.tsx](../frontend-admin/src/pages/ProductsPage.tsx), [ProductDetailPage.tsx](../frontend-admin/src/pages/ProductDetailPage.tsx)
- Server rules and formulas: [sourcing/models.py](../backend/apps/sourcing/models.py), [sourcing/services.py](../backend/apps/sourcing/services.py), [sourcing/serializers.py](../backend/apps/sourcing/serializers.py)
- Where the data goes next: the packing-list document export ([packing/exports.py](../backend/apps/packing/exports.py), rendered from the intake record itself), [InvoicesPage.tsx](../frontend-admin/src/pages/InvoicesPage.tsx), [invoicing/exports.py](../backend/apps/invoicing/exports.py)

---

## Legend

| Mark | Meaning |
|---|---|
| 🟢 | **Connected and working.** Feeds other fields or modules as expected. |
| 🟡 | **Works, but a link is missing or surprising.** Read the note. |
| 🔴 | **Bug.** Doesn't behave the way a user would expect. |
| ⚪ | **Standalone.** Nothing else depends on it. It's only shown or kept for reference. |
| ⚫ | **Dead.** Saved in the database, but the current screens never fill it in or never use it. |

---

## 1. The big picture

```
                     ┌──────────────────────┐
                     │    SISTER PROFILE    │  supplier currency · buyer currency · exchange rate
                     └──────────┬───────────┘  (and which Buyer owns the order)
                                │ picked at the top of the form
                                ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  SOURCING INTAKE  =  1 Product  +  1 row per colour              │
 └───────┬──────────────────────┬──────────────────────┬───────────┘
         │ product is picked    │ "Submit for Approval" │ rows are COPIED
         │ in a cost item       │ needs its Sourcing    │ when you pick this
         ▼                      │ Cost to be CLOSED     │ product in a packing list
  SOURCING COSTS ───────────────┘                       ▼
  (charges the buyer's wallet)                 PACKING LIST (carton rows)
                                                        │ cartons are picked
                                                        ▼ into an invoice
                                                     INVOICE ──► PDF / Excel

  BUYER PORTAL reads the Product (read-only) · ADMIN APPROVAL changes its Status
```

**Remember:** Packing List and Invoice get a **copy** of the intake values at the moment you build them. If you edit the product later, packing lists and invoices that already exist **do not change**.

---

## 2. The calculation chain inside one colour row

Worked numbers: Navy · sizes `S:2 M:4 L:4 XL:2` · cartons 1–10 · 250 BDT per piece · rate 1 USD = 120 BDT · G.W 8.5 kg · N.W 7.8 kg · carton 60×40×35 cm.

```
Size Breakdown  S:2 M:4 L:4 XL:2 ──── add up ─────────────► PC/CTN ........ 12
CTN From 1 , CTN To 10 ─────────── To − From + 1 ──────────► CTNS .......... 10

PC/CTN × CTNS ────────────────────────────────────────────► TTL PCS ....... 120
TTL PCS × Unit Price (250) ───────────────────────────────► Amount ........ 30,000.00 BDT
Unit Price ÷ exchange rate (120) ─────────────────────────► Unit Price USD  2.08
Amount ÷ exchange rate ───────────────────────────────────► Amount USD .... 250.00
G.W 8.5 × CTNS ───────────────────────────────────────────► TTL G.W ....... 85.00
N.W 7.8 × CTNS ───────────────────────────────────────────► TTL N.W ....... 78.00
L × W × H ÷ 1,000,000  (60×40×35) ────────────────────────► CBM ........... 0.0840
CBM × CTNS ───────────────────────────────────────────────► TTL CBM ....... 0.8400

Order Qty (typed) ─────── NOT connected to anything on this screen ───────────
```

Three things to understand:

1. **CTNS drives almost everything.** If CTN From/To are blank, CTNS = 0, and then TTL PCS, Amount, TTL G.W, TTL N.W and TTL CBM are **all 0**, even when price, weights and dimensions are filled in.
2. **Order Qty is on its own.** Typing 500 in Order Qty while the cartons add up to 120 pieces gives no warning here. The two numbers are compared for the first time in the Packing List, as Short/Excess.
3. **The browser calculates for preview, and the server calculates again on save.** Both use the same formulas (`computeVariantDerived` in the browser, `compute_variant_derived` on the server). The saved values come from the server: Amount rounded to 2 decimals, CBM to 4.

---

## 3. Top-of-form fields (one value for the whole product)

### 3.1 Product Template 🟡

| | |
|---|---|
| **Comes from** | You pick it from the dropdown. "Custom" means no template. |
| **Changes on screen** | Each field in the template becomes a **purple column** at the end of the grid. Picking another template **replaces** those columns and **clears the values typed in them**. |
| **Goes to** | The template's name is saved and shown later as "Template: …". The column list is **copied** into the product, so editing the template later never changes this product. |
| **Problems** | Inactive templates still appear in the dropdown: the screen asks for `isActive=true`, but the server ignores that filter. The template's "Required" flag is never enforced. |

### 3.2 Sister Profile 🟢, the most connected field on the form

| | |
|---|---|
| **Comes from** | Picked from the searchable dropdown ("PO Reference — Buyer name"). Required. |
| **Changes on screen** | The currency codes in the headers of the 4 price columns, and the **exchange rate** behind the purple buyer-currency columns. |
| **Goes to** | • **Buyer Portal:** decides which buyer can see this product.<br>• **Sourcing Costs:** the product only shows up in the cost-item picker of the *same* Sister Profile, and costs are charged to *that* buyer's wallet.<br>• **Packing Lists:** the product only shows up when building a packing list for the *same* Sister Profile.<br>• **Sister Profile page:** the product is listed there, and its Order Qty counts toward "pcs on order" and "unit cost".<br>• **Product list:** the "Sister Profile PO" column. |
| **Problems** | ✅ FIXED: the dropdown used to load only the first 50 Sister Profiles because the server ignored `page_size`. It now loads up to 200 (the size the screen asks for; the server allows up to 500). 🟡 An Admin can change it later in Edit, even after costs were booked. Those costs stay with the old buyer. |

### 3.3 PO No 🟢

| | |
|---|---|
| **Comes from** | Typed. Optional. |
| **Changes on screen** | Nothing. |
| **Goes to** | • **Packing List:** becomes the default PO on every carton row of this product, unless that row already has its own PO. It prints in the packing PDF/Excel.<br>• **Sourcing Cost pages:** shown next to each cost item.<br>• **QR code** (`po`). |
| **Not linked to** | The Sister Profile's **PO Reference**. They are two separate fields. |

### 3.4 Product Name 🟢

| | |
|---|---|
| **Comes from** | Typed. Required. |
| **Goes to** | It's the product's label everywhere: product list, detail page, Approvals queue, Sourcing Cost pages, **Packing List "Product" column and export**, the **default Description on invoice lines**, expense remarks ("Transport: *Men's T-Shirt* @ Gazipur"), approval/rejection notifications, and the QR code. |

### 3.5 Brand Name 🟡

| | |
|---|---|
| **Comes from** | Typed. Blank becomes `NA`. This happens in the browser only, so a brand made of spaces is saved as spaces. |
| **Goes to** | Product list and search, detail header, Dashboard "recent products", Buyer Portal, Sourcing Cost pages, QR code. |
| **Missing link** | 🟡 The Packing List has **its own** Brand Name box, typed again and not pre-filled. Invoice lines take their Brand **from the packing list**. So the brand you type at intake **never reaches the invoice**. |

### 3.6 Style # (system code, not on the form) 🟢

| | |
|---|---|
| **Comes from** | Created automatically on save as `STY-<time>-<random>`. An Admin can change it later in Edit. |
| **Goes to** | Product list, detail page, barcode (when the row's own Style No is blank), **every Packing List carton's Style No** (forced; it can't be typed there), packing PDF/Excel, **invoice line "Style / Item code"**, Expenses search and export, Sourcing Cost pages, Dashboard, Buyer Portal, product QR. |
| **Problem** | 🟡 If an Admin changes it after a packing list exists, that packing list's **stored** Style No (printed in its PDF/Excel) keeps the old value until the packing list is edited and saved again. |

### 3.7 Material (hidden, product level) 🟡

| | |
|---|---|
| **Comes from** | There's no box for it. On save it's **copied from the first colour row's Material**. On Edit, clearing row 1's Material keeps the old product value. |
| **Goes to** | Packing carton `productMaterial`, then the invoice line's **Material**, used **only when the carton's own Material is blank**. The server does the same fallback when creating an invoice. |

---

## 4. Colour-row fields (one value per colour)

### Group A: Identity

#### 4.1 Color 🟢, the key of the row

| | |
|---|---|
| **Comes from** | Typed. |
| **Changes on screen** | Nothing is calculated from it, but **it decides whether the row is saved at all**. |
| **Goes to** | Packing carton **Color**, packing PDF/Excel, invoice line **Color/Size note**, **photo matching** (the colour photo is found by comparing its name to this value), product QR (`colors`), Buyer Portal packing list. |
| **Problems** | ✅ FIXED: a row with data but no Color used to be thrown away on save. Now the save is blocked, the message names the row ("Enter a Color on row 2…"), and its Color box turns red until you type one. A row you never typed into is still skipped quietly. ✅ FIXED: Admin Edit with every Color blank used to delete all colour rows. Now both the screen and the server refuse it. 🟡 Renaming a colour in Edit doesn't rename its photo, so photo matching falls back to the first photo. |

#### 4.2 Style No (row) ⚪

| | |
|---|---|
| **Comes from** | Typed. It's the factory's code, e.g. `MRF25`. Max 64 characters. |
| **Goes to** | **Only** the barcode text and QR label on the intake screens. If blank, the system Style # is used instead. |
| **Not linked to** | ⚪ It is **not copied** to the Packing List or the Invoice. Cartons always use the system Style #. |

#### 4.3 CTN SL 🟢 (partly)

| | |
|---|---|
| **Goes to** | Packing carton **CTN SL**, shown in the packing grid, view and PDF/Excel. QR (`ctnSl`). |
| **Does not go to** | The invoice. |

#### 4.4 Description (row) 🟢 (partly)

| | |
|---|---|
| **Goes to** | Packing carton **Description**, shown in the packing grid, view and PDF/Excel. QR (`desc`). |
| **Does not go to** | The invoice. The invoice line's Description is the **Product Name** instead. |

#### 4.5 Material (row) 🟢

| | |
|---|---|
| **Goes to** | • Row 1 only: becomes the product's **Material** (see 3.7).<br>• Every row: packing carton **Material**, then the invoice line **Material** (preferred over the product's), printed in the invoice PDF/Excel **Material** column. |

#### 4.6 Pattern No 🟡

| | |
|---|---|
| **Goes to** | Packing carton **Pattern No**, shown in the packing grid and PDF/Excel. ✔ |
| **Missing link** | 🟡 The invoice builder **never copies Pattern No** into invoice lines, although the invoice has a Pattern No field and its PDF has a spot to print it (`STY-… / pattern`). On invoices it's always blank. |

### Group B: Quantity and cartons

#### 4.7 Order Qty 🟢 (but not linked on this screen)

| | |
|---|---|
| **Comes from** | Typed. The pieces the buyer ordered **in this colour**. |
| **Changes on screen** | Only the footer's **Total Order Qty**. It is **not** compared with TTL PCS. |
| **Goes to** | • **Product Total Order Qty** (sum of all rows): product list, detail page title, Buyer Portal, QR (`qty`).<br>• **Sister Profile page:** "pcs on order", and **unit cost = all costs ÷ total order qty**.<br>• **Packing carton Order Qty:** this is where **Short/Excess = Order Qty − Ship Qty** is worked out for the first time. |

#### 4.8 Size Breakdown 🟢

| | |
|---|---|
| **Comes from** | "Add Size", then a label and a quantity. The quantities are **per carton**, not for the whole order. Sizes with a blank label are dropped. |
| **Changes on screen** | PC/CTN, then TTL PCS, then Amount. |
| **Goes to** | Packing carton size breakdown, then PC/CTN and **Ship Qty**, then invoice line **Qty/CTN** and **Total Qty**. Also the product QR (`sizes`, in the Final QC module, currently hidden). |

#### 4.9 PC/CTN (automatic) 🟢

`= sum of the size quantities`. Feeds **TTL PCS**. The Packing List calculates its own copy ("Total PC/Per CTN") from the copied size breakdown.

#### 4.10 CTN From / CTN To 🟢

| | |
|---|---|
| **Comes from** | Typed. "Add Row" sets the new row's From to the previous row's To + 1, **only at the moment you click**. |
| **Changes on screen** | CTNS, then everything multiplied by CTNS (see section 2). |
| **Goes to** | Packing carton From/To. If blank here, the Packing List continues the numbering after the previous row. |
| **Not checked** | Overlapping ranges, gaps, and To smaller than From (CTNS quietly becomes 0). Changing an earlier row later does **not** shift the rows after it. |

#### 4.11 CTNS (automatic) 🟢, the multiplier

`= To − From + 1`. Multiplies PC/CTN, G.W, N.W and CBM. Feeds the footer's **Total Cartons**.

#### 4.12 TTL PCS (automatic) 🟢

`= PC/CTN × CTNS`. Feeds **Amount**. Not compared with Order Qty here. The Packing List calls the same number **Ship Qty** and calculates it again.

### Group C: Money

#### 4.13 Unit Price (supplier currency) 🟢

| | |
|---|---|
| **Comes from** | Typed. The **buy price per piece**, the same for every size of the colour. |
| **Changes on screen** | Amount, and Unit Price in buyer currency (÷ rate). |
| **Goes to** | Packing carton **Unit Price**, then carton Amount (Ship Qty × price), then the **invoice line Unit Price and Amount** (a default you can still edit there). |
| **QR code** | ✅ FIXED: it used to be put inside the row's QR code (`price`, `amt`), so a printed label revealed your buy price. Price and amount are now left out of the intake QR and the packing-list carton QR. |

#### 4.14 Amount (supplier currency, automatic) 🟢

`= TTL PCS × Unit Price`, rounded to 2 decimals. Feeds the footer total and the QR. Saved on the row, but the Packing List and Invoice calculate their own.

#### 4.15 Unit Price / Amount in buyer currency (purple, automatic) ⚪

| | |
|---|---|
| **Comes from** | `supplier value ÷ Sister Profile exchange rate` ("1 buyer = X supplier"). |
| **Saved?** | **No.** Calculated on screen every time. Shows "—" if the Sister Profile has no rate. |
| **Note** | The rate can be edited on the Sister Profile until the first cost is booked. If it changes, these numbers change for old products too. |

### Group D: Weight and carton size

#### 4.16 G.W / N.W (kg per carton) 🟢

| | |
|---|---|
| **Changes on screen** | TTL G.W / TTL N.W (× CTNS). |
| **Goes to** | Packing carton weights (blank becomes 0), then invoice line **weight per carton** and **total weights**, then the invoice PDF. |
| **Not checked** | N.W bigger than G.W. |

#### 4.17 TTL G.W / TTL N.W (automatic) 🟢

`= weight × CTNS`. Shown in the intake tables, footer and QR. The Packing List calculates its own.

#### 4.18 L / W / H (cm) 🟢 + 🟡

| | |
|---|---|
| **Changes on screen** | CBM, then TTL CBM. |
| **Goes to** | Packing carton L/W/H, **converted to inches (÷ 2.54)** and stored with 2 decimals. The invoice converts them back to cm for printing. |
| **Problem** | 🟡 The unit conversion with rounding can shift CBM a little. With 60×40×35 cm × 10 cartons: intake TTL CBM **0.8400**, packing list when first created **0.8400**, the same packing list **after it's edited and saved: 0.8401**. The edit recalculates CBM from the rounded inches (23.62 × 15.75 × 13.78). |

#### 4.19 CBM / TTL CBM (automatic) 🟢

`CBM = L×W×H ÷ 1,000,000` and `TTL CBM = CBM × CTNS`. Feeds the footer **Total CBM** and the QR. The Packing List calculates its own from inches.

### Group E: Notes and extra columns

#### 4.20 Remarks 🟡

| | |
|---|---|
| **Goes to** | Packing carton **Remarks**, shown in the packing grid and view. ✔ |
| **Does not go to** | The packing PDF/Excel, or the invoice. |
| **Length** | ✅ FIXED: packing cartons used to allow only 255 characters, so a long intake remark could make the packing-list save fail. Both sides now allow any length (migration `packing/0015`). |

#### 4.21 Template / custom columns (purple) 🟡

| | |
|---|---|
| **Comes from** | The chosen Template (3.1) and/or "Add Column". The types are Text, Number, Decimal, Yes/No, and Dropdown (template fields only). |
| **Goes to** | Packing carton (shown as extra columns in the packing grid) ✔, and the QR code, on both the list's 👁 View dialog and the detail page. (✅ FIXED: the detail page used to leave them out, so one row had two different QR codes.) |
| **Does not go to** | The packing PDF/Excel, or the invoice. |
| **Problems** | Values are matched **by column label**, so two columns with the same label share values. A column can't be removed once added. "Required" isn't enforced. |

#### 4.22 Color Image 🟡

| | |
|---|---|
| **Comes from** | The camera box on the row. It's uploaded **after** the product is saved, into the Photo Gallery with the label "Custom" and the **colour name** as its name. |
| **Goes to** | Packing List screens and the Invoice builder screen show the photo **whose name matches the row's colour**. |
| **Missing link** | 🟡 The **printed invoice (PDF/Excel)** doesn't match by colour. It uses the photo labelled **"Product Overall"**, otherwise the first photo, so every colour line prints the **same** photo. |
| **Problems** | ✅ FIXED: a failed photo upload during Create used to leave the form open, so clicking Create again made a duplicate product. Now the product page opens anyway and a yellow notice names the colours whose photo didn't upload. In Edit, the changes are kept and "Save Changes" retries only the failed photos. 🟡 In Edit, the existing photo isn't shown on the row, and uploading again **adds** a second photo instead of replacing the first. |

#### 4.23 Inner Bundle ⚫ (at intake)

The database field exists and the spec lists it, but **the intake grid has no box for it**, so it is always saved as **1**. The Packing List does have an Inner Bundle box, so you can fix it there.

---

## 5. Buttons and the footer

| Element | What it touches | Mark |
|---|---|---|
| **Add Row** | New row. CTN From = previous To + 1, and the purple columns start blank. | 🟢 |
| **Add Column** | Adds a column to this product only, saved with the product's column list. Never goes into the shared Field Library. No way to remove it. | 🟡 |
| **🗑 on a row** | Removes the row. The last row can't be removed. | 🟢 |
| **Footer totals** (Order Qty, Cartons, CBM, Amount in both currencies) | Display only, never saved. They count exactly the rows that will be saved; untouched blank rows are left out. (✅ FIXED: they used to include rows that were then dropped.) | ⚪ |
| **Create Product** | Saves, recalculates everything on the server, uploads the colour photos, then opens the detail page. | 🟢 |

---

## 6. After saving: the detail page and the lifecycle

### 6.1 Status 🟡

```
Sourcing Cost Open ──[Submit for Approval]──► Pending Approval ──[Admin Approve]──► Approved for QC
        ▲  needs: the product's latest Sourcing  ▲       │
        │  Cost to be CLOSED                     │       └──[Admin Reject + reason]──► Rejected
        │                                        └────────[Resubmit for Approval]──────┘
        │
Approved for QC ──[QC report created]──► In Warehouse ──[Mark Ready for Final QC]──► Ready for Final QC
                                                          needs: a Warehouse Cost          │
                                                          on this order                    │
                                              Completed ◄──[both QR codes generated]───────┘
```

- **What depends on Status:** the Submit/Resubmit button (in "Sourcing Cost Open" or "Rejected"), Approve/Reject (only in "Pending Approval"), creating a QC report (only in "Approved for QC"), and Mark Ready for Final QC (only in "In Warehouse").
- ✅ FIXED: **In Warehouse → Ready for Final QC.** Nothing used to do this. Now an Admin or Warehouse Manager clicks **Mark Ready for Final QC** on the product page. The spec says this step comes after the Warehouse Costs, so the button only works once the order has at least one Warehouse Cost. (Warehouse costs are recorded per order, not per product, so this can't be triggered automatically.) The Warehouse role can now open Sourcing Intake for this.
- ✅ FIXED: **Rejected is no longer a dead end.** After the problem is fixed, click **Resubmit for Approval**. It passes the same Sourcing Cost check and goes back to Pending Approval. The old rejection reason is cleared from the product and kept in the Audit Log (`RESUBMIT_PRODUCT`).
- 🟡 Still true: the QC pages are hidden in the menu, so reaching In Warehouse in the first place needs those pages switched back on.
- 🟡 **Status does *not* block Packing Lists or Invoices.** A product in *any* status (even Rejected) can be packed and invoiced.

### 6.2 Submit for Approval, which depends on Sourcing Costs 🟢

Checks that the product's **most recent Sourcing Cost item** belongs to a Sourcing Cost whose status is **Closed**. If not: *"Cannot submit for approval while the product's Sourcing Cost is Open (or missing)."*

### 6.3 Factory Packing List ⚪

A photo or PDF of the factory's own sheet. **Reference only.** Nothing reads it, and it doesn't fill in the grid. (✅ FIXED: the server used to accept any file type. It now accepts only real JPG/PNG/GIF/WEBP images or PDFs up to 10 MB, checking the file contents and not just the name.)

### 6.4 Photo Gallery 🟢

Photos with labels: Front Label, Back Label, Product Overall, Fabric Close-up, Custom. **"Product Overall" is the photo printed on invoices.** Colour-named photos (4.22) are used on the Packing List and Invoice builder screens.

### 6.5 Barcode / QR on each row 🟢

- **Barcode text** = row Style No, or the system Style # if blank.
- **QR content** = product fields (Style #, name, brand, PO, material, Sister Profile PO) + the row's fields (colour, sizes, quantities, weights, CBM, remarks) + purple columns.
- ✅ FIXED: the QR used to include your buy price and amount, and the detail-page QR used to differ from the View-dialog QR. Neither is true now.

### 6.6 Rejection Reason, Reviewed By/At, Created By

- **Rejection Reason:** shown in a red box when Rejected, and sent in the notification. 🟢
- **Created By:** the person who gets the approve/reject notification. 🟢
- **Reviewed By/At:** display only. ⚪

---

## 7. Hidden database fields that nothing on screen uses (⚫)

| Field | Why it's dead |
|---|---|
| `Product.customFields` | An older "one-off fields" system. Its API endpoint still exists, but the screen now uses purple columns instead and never reads or writes this. |
| `ProductImage.gpsLat`, `gpsLng`, `capturedAt` | Meant for photo GPS and time data. Never sent by the upload screen, never shown. |
| `goodsName`, `finalPrice`, `fabricDetails` | Filled only on the Final QC page, which is hidden. The View dialog shows them as "—". |
| `productQrGenerated/Payload`, `cartonQrGenerated/Payload` | Final QC & QR module, which is hidden. |
| `innerBundle` (intake) | No box on the intake grid, so always 1 (see 4.23). |
| Row totals saved on the server (`pcsPerCarton`, `noOfCartons`, `totalPcs`, `totalAmount`, `totalGrossWeight`, `totalNetWeight`, `cbm`, `totalCbm`) | ⚪ Saved and displayed at intake, but the Packing List and Invoice **recalculate their own** instead of reading these. |

---

## 8. The journey of each field: Intake → Packing List → Invoice

| Intake field | Packing List carton | Invoice line | Printed on invoice PDF/Excel? |
|---|---|---|---|
| Product Name | Product (read live) | Description | ✅ |
| Style # (system) | Style No (forced) | Style / Item code | ✅ |
| Brand Name | ✘ (packing list has its own brand box) | Brand = packing list's brand | ✘ intake brand never arrives |
| PO No | PO No (default) | — | — |
| Material (product) | productMaterial | Material (fallback) | ✅ if the carton has none |
| Row Style No | ✘ | ✘ | ✘ |
| Color | Color | Color/Size note | ✅ |
| Pattern No | Pattern No | ✘ never copied | ✘ |
| CTN SL | CTN SL | ✘ | ✘ |
| Description (row) | Description | ✘ (product name used) | ✘ |
| Material (row) | Material | Material (preferred) | ✅ |
| Order Qty | Order Qty → Short/Excess | ✘ | ✘ |
| Size Breakdown | Size Breakdown → PC/CTN → Ship Qty | Qty/CTN, Total Qty | ✅ |
| CTN From / To | CTN From / To → CTNS | CTN | ✅ |
| Unit Price | Unit Price → Amount | Unit Price, Amount | ✅ |
| G.W / N.W | G.W / N.W → totals | per-carton and total weights | ✅ |
| L / W / H (cm) | L / W / H (**inches**) → CBM | dimensions (back to cm), CBM | ✅ |
| Remarks | Remarks (screen only) | ✘ | ✘ |
| Purple columns | Extra columns (screen only) | ✘ | ✘ |
| Inner Bundle | Inner Bundle (always 1 from intake) | ✘ | ✘ |
| Colour photo | Photo matched by colour (screen) | Photo matched by colour (builder screen) | 🟡 prints the "Product Overall" photo for every line |

---

## 9. The fix list

### 🔴 Bugs (all ✅ FIXED)

1. ✅ **Rows with no Color vanished on save** without warning, and the footer totals still counted them. Now the save is blocked and the row is flagged; totals match what gets saved.
2. ✅ **Admin Edit with every Color blank deleted all colour rows.** Now it's refused by both the screen and the server.
3. ✅ **A failed colour-photo upload could create a duplicate product.** Now the product opens anyway, and a notice lists the photos that failed.
4. ✅ **Long Remarks (over 255 characters) could break the Packing List save.** Carton remarks now allow any length.
5. ✅ **Every list and dropdown stopped at 50 items** because the server ignored `page_size`. Now it's honoured, up to 500. Screens that ask for 200 still stop at 200; see the note below.
6. ✅ **Nothing moved a product from In Warehouse to Ready for Final QC, and Rejected had no resubmit.** Both now exist (section 6.1).
7. ✅ **The QR code contained the buy price, and the detail-page QR differed from the View-dialog QR.** Both are fixed, and the packing-list carton QR no longer has the price either.
8. ✅ **The Factory Packing List upload accepted any file type.** Now only real images or PDFs up to 10 MB.

> Note on 5: most screens ask for 200 rows (a few ask for 500). Past that, they'd need "load more" or search on the server. Not a problem at today's data size, but it will be later.

### 🟡 Missing links worth adding

9. Show **Order Qty vs TTL PCS** (short/excess) on each intake row.
10. Copy **Brand Name** into the Packing List header, so it reaches the invoice.
11. Copy **Pattern No** into invoice lines. The invoice PDF already has a spot for it.
12. Print the **colour-matched photo** on each invoice line, like the screens already do.
13. Add an **Inner Bundle** box to the intake grid.
14. Show a real **Material** box at product level, instead of copying it silently from row 1.
15. Decide what **Row Style No** is for. Either copy it into the Packing List and Invoice, or remove it to avoid confusion with the system Style #.
16. Include **Remarks** and **purple columns** in the Packing List PDF/Excel if the buyer needs them.
17. Let **Status** block packing and invoicing of Rejected or unapproved products (if that's the business rule).
18. Store carton size in **one unit** (cm or inches) to stop the CBM rounding drift.
19. Enforce template **"Required"** fields, hide **inactive templates**, warn before a template switch clears values, and block duplicate column labels.

### ⚫ Clean-up candidates

20. Remove the old `Product.customFields` and its `/custom-fields/` endpoint, or bring it back on purpose.
21. Either capture photo GPS/time (`gpsLat`, `gpsLng`, `capturedAt`) or remove those fields.
22. Remove the Factory Packing List, or make it useful (for example, read its rows into the grid).

---

## 10. Practice: trace one row from start to finish

Use the Navy row from section 2 and follow it through each step.

**Step 1: Intake (saved on the server)**

| Field | Value |
|---|---|
| Color | Navy |
| Size Breakdown | S:2 M:4 L:4 XL:2 → PC/CTN **12** |
| CTN | 1–10 → CTNS **10** → TTL PCS **120** |
| Unit Price | 250.00 → Amount **30,000.00** (buyer view: 2.08 / 250.00 USD) |
| G.W / N.W | 8.5 / 7.8 → TTL **85.00 / 78.00** |
| L×W×H | 60×40×35 cm → CBM **0.0840**, TTL CBM **0.8400** |
| Order Qty | 500 → *no warning here* |

**Step 2: Packing List** (pick this product; the row is copied in)

| Field | Value |
|---|---|
| Style No | STY-… (system code, not "MRF25") |
| L×W×H | 23.62 × 15.75 × 13.78 **inches** |
| Ship Qty | 120, Order Qty 500 → **Short 380 (76.00%)**. The mismatch shows for the first time here. |
| TTL CBM | 0.8400 (**0.8401** after the packing list is edited and saved) |
| Brand | whatever you type in the packing list header (the intake brand is **not** copied) |

**Step 3: Invoice** (pick this carton)

| Field | Value |
|---|---|
| Description | the Product Name |
| Style / Item code | STY-… |
| CTN / Qty per CTN / Total Qty | 10 / 12 / 120 |
| Unit Price / Amount | 250.00 / 30,000.00 |
| Weights | per carton 8.50 / 7.80, totals 85.00 / 78.00 |
| Material | the row's Material |
| Color note | "Navy" |
| Pattern No | **blank** (never copied) |
| Photo on the PDF | the "Product Overall" photo, not the Navy photo |

### Test yourself

<details>
<summary>1. You fill in price, weights and size, but Amount and TTL G.W show 0. Why?</summary>

CTN From/To are blank or To is smaller than From, so CTNS = 0 and everything multiplied by CTNS is 0.
</details>

<details>
<summary>2. Where is Order Qty first compared with the number of pieces actually packed?</summary>

In the Packing List, as Short/Excess = Order Qty − Ship Qty. Intake never compares them.
</details>

<details>
<summary>3. You typed Brand "Zara" at intake. Why is Brand empty on the invoice?</summary>

Invoice lines take Brand from the Packing List header, which has its own Brand box that isn't pre-filled from the product.
</details>

<details>
<summary>4. You filled in a whole row but forgot the Color. What happens on save?</summary>

The save is blocked with "Enter a Color on row N…", and that row's Color box turns red until you type one. (Before the fix, the row was silently dropped.)
</details>

<details>
<summary>5. Which intake field decides the currencies and the exchange rate?</summary>

The Sister Profile. Buyer-currency values = supplier value ÷ its exchange rate. They're calculated on screen and never saved.
</details>

<details>
<summary>6. You fix a typo in the product's Style # after the packing list is made. Does the packing list PDF update?</summary>

No. The carton rows keep the old Style No until that packing list is edited and saved again. (Invoices already issued never change either, by design.)
</details>

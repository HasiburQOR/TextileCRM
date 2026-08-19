# Instruction Prompt: Packing List Module — Exact Field Match + Customizable Color Assortment

Use this as a task prompt for an AI coding assistant. It defines the Packing List module (auto-generation + manual entry + export) so its output matches the reference commercial packing list format field-for-field, with a customizable color assortment (not fixed at 6 — user-defined, 6 is today's typical count).

---

## 1. Source Reference

The reference document is a factory-issued packing list with this structure: one Style No. can have several Pattern Nos underneath it, each Pattern No representing one color/design, each with its own carton range, size breakdown, and weight/measurement data, rolling up into a grand total row and a summary box. Every field below must exist in the data model and the generated/exported document — none may be dropped, renamed without a mapped equivalent, or merged silently into another field.

---

## 2. Complete Field List (do not omit any of these)

### 2.1 Row-level fields (one row = one Pattern/Color within a Style)

| # | Field Name (reference label) | System Field Name | Type | Notes |
|---|---|---|---|---|
| 1 | CTN NO (from) | `carton_no_from` | Integer | Start of carton range for this color |
| 2 | CTN NO (to) | `carton_no_to` | Integer | End of carton range for this color |
| 3 | CTNS | `carton_count` | Integer | Number of cartons for this color; = `carton_no_to − carton_no_from + 1` |
| 4 | STYLE NO | `style_no` | Text | Shared across multiple pattern rows |
| 5 | PATTERN NO | `pattern_no` | Text | One per color; unique within a style |
| 6 | PO NO | `po_no` | Text | Can span/merge across multiple pattern rows under one style |
| 7 | ORDER QUANTITY | `order_qty` | Integer | Ordered quantity for this specific color |
| 8 | COLOR | `color_name` | Text | Free text, user-defined — see Section 3 |
| 9 | SIZE RANGE — S | `size_qty_s` | Integer | Units of size S per carton (ratio, not total) |
| 10 | SIZE RANGE — M | `size_qty_m` | Integer | Units of size M per carton |
| 11 | SIZE RANGE — L | `size_qty_l` | Integer | Units of size L per carton |
| 12 | SIZE RANGE — XL | `size_qty_xl` | Integer | Units of size XL per carton |
| 13 | SIZE RANGE — XXL | `size_qty_xxl` | Integer | Units of size XXL per carton |
| 14 | TOTAL PC/PER CTN | `pcs_per_carton` | Integer (computed) | = sum of all size_qty_* fields for this color |
| 15 | INNER Bundle | `inner_bundle` | Integer | Inner packing bundle count |
| 16 | TTL CTN | `total_cartons` | Integer | = `carton_count` (duplicated column in reference — keep both, they can diverge if cartons are split non-sequentially) |
| 17 | TTL PCS | `total_pcs` | Integer (computed) | = `pcs_per_carton × total_cartons` |
| 18 | G.W | `gross_weight_per_carton` | Decimal | Per-carton gross weight (kg) |
| 19 | N.W | `net_weight_per_carton` | Decimal | Per-carton net weight (kg) |
| 20 | TTL G.W | `total_gross_weight` | Decimal (computed) | = `gross_weight_per_carton × total_cartons` |
| 21 | TTL N.W | `total_net_weight` | Decimal (computed) | = `net_weight_per_carton × total_cartons` |
| 22 | CTN MEASUREMENT — L | `carton_length_inch` | Decimal | Carton length, inches |
| 23 | CTN MEASUREMENT — W | `carton_width_inch` | Decimal | Carton width, inches |
| 24 | CTN MEASUREMENT — H | `carton_height_inch` | Decimal | Carton height, inches |
| 25 | CBM | `cbm` | Decimal (computed) | = `(L × W × H) / 61023.7 × total_cartons` (inches³ → CBM), or per current business formula — confirm with Admin before hardcoding the divisor |

### 2.2 Grand Total row (`G.TOTAL`)

Auto-computed by summing the row-level fields down each column:

| Field | Computed As |
|---|---|
| `grand_total_cartons` | Sum of `carton_count` across all rows |
| `grand_total_pcs` | Sum of `total_pcs` across all rows |
| `grand_total_gross_weight` | Sum of `total_gross_weight` across all rows |
| `grand_total_net_weight` | Sum of `total_net_weight` across all rows |
| `grand_total_cbm` | Sum of `cbm` across all rows |

### 2.3 Summary box fields (below the main table)

| Field (reference label) | System Field Name | Computed As |
|---|---|---|
| Total Order Quantity | `summary_order_qty` | Sum of `order_qty` across all rows |
| Total Ship Quantity | `summary_ship_qty` | Sum of `total_pcs` across all rows |
| SHORT/EXCESS QTY | `summary_short_qty` | = `summary_order_qty − summary_ship_qty` (negative = excess) |
| Percentage | `summary_short_pct` | = `summary_short_qty / summary_order_qty × 100`, 2 decimal places |
| Total Carton Qty | `summary_carton_qty` | = `grand_total_cartons` |
| Total Gross Weight | `summary_gross_weight` | = `grand_total_gross_weight` |
| Total Net Weight | `summary_net_weight` | = `grand_total_net_weight` |
| Total CBM | `summary_cbm` | = `grand_total_cbm` |

**Do not drop the unit labels** (PCS, %, KGS, CBM) — they must render next to each summary value exactly as in the reference.

---

## 3. Color Customization Requirement

The reference shows one color per row, many rows per style — that part of the layout stays as-is. What needs to be **customizable** is how many colors a user can define **per Style/Pattern group when building the packing list**, matching the earlier BRD requirement for a flexible color × size input:

- The system must **not** hard-code a fixed count (e.g. exactly 6 colors) anywhere in the schema or UI.
- On the Product/Variant intake and on the Packing List builder, color entries must be a **repeatable list** — user can add or remove color rows freely (1 to N, no artificial cap), each becoming its own row in the generated packing list, with the reference's typical case being ~6 colors per style, but the system must handle fewer or more without layout or calculation breakage.
- Each color entry independently carries its own: Pattern No, PO No (or inherits from the shared Style if PO No is common — see 3.1 below), Order Quantity, full Size Range breakdown (S/M/L/XL/XXL — see 3.2), Inner Bundle, weights, and carton measurements.
- Adding a new color to an existing packing list must **not** require re-entering or disturbing carton numbering for colors already entered above it — carton ranges should extend sequentially from the last entered color's `carton_no_to + 1`.

### 3.1 PO No merging behavior
Where multiple color rows under one Style share the same PO No (as in the reference, shown as one merged cell spanning many rows), the system should let PO No be entered once at the Style level and auto-populate to every color row under it, while still storing it per row in the data model (not only at the style level) so each row remains independently exportable/traceable.

### 3.2 Size Range flexibility
The reference uses a fixed S/M/L/XL/XXL range. Build the size columns as a **configurable set** (reuse the existing Packing Rule / size-assortment-ratio concept from the BRD), not hard-coded to exactly these five sizes — some styles may need different size sets (e.g. numeric sizing, one-size). Default the UI to S/M/L/XL/XXL since that's the current standard, but the underlying model must support adding/removing size columns per Packing Rule.

---

## 4. Data Model Changes

Extend the existing `PackingList` / `PackingListLine` (or `PackingCarton`) entities from the SRS data model as follows — do not create a parallel/duplicate table:

```
PackingListLine (extends existing PackingCarton entity)
  id
  packing_list_id (FK)
  style_no
  pattern_no
  po_no
  color_name
  carton_no_from
  carton_no_to
  carton_count            (computed)
  order_qty
  size_breakdown (JSON: { "S": 1, "M": 3, "L": 5, "XL": 4, "XXL": 2 })   -- configurable keys, see 3.2
  pcs_per_carton          (computed: sum of size_breakdown values)
  inner_bundle
  total_cartons
  total_pcs               (computed)
  gross_weight_per_carton
  net_weight_per_carton
  total_gross_weight      (computed)
  total_net_weight        (computed)
  carton_length_inch
  carton_width_inch
  carton_height_inch
  cbm                     (computed)

PackingListSummary (derived, computed on read or cached on the PackingList record)
  packing_list_id
  grand_total_cartons
  grand_total_pcs
  grand_total_gross_weight
  grand_total_net_weight
  grand_total_cbm
  summary_order_qty
  summary_ship_qty
  summary_short_qty
  summary_short_pct
```

All computed fields (`carton_count`, `pcs_per_carton`, `total_pcs`, `total_gross_weight`, `total_net_weight`, `cbm`, and everything in `PackingListSummary`) must be calculated server-side by a service function, recalculated live whenever a `PackingListLine` is added, edited, or removed — never left to the frontend to compute and submit as static values.

---

## 5. UI Requirements

- Packing List builder shows one editable row per color, with an "Add Color" button that appends a new row inheriting Style No and PO No from the group, and auto-filling the next sequential carton range.
- Size Range columns render dynamically based on the active Packing Rule's configured size set (default S/M/L/XL/XXL, but must not be hardcoded).
- All computed columns (`TOTAL PC/PER CTN`, `TTL CTN`, `TTL PCS`, `TTL G.W`, `TTL N.W`, `CBM`) are read-only in the UI and update live as the user edits input fields in that row.
- A running Grand Total row is pinned at the bottom of the table, recalculating live.
- The Summary box (Total Order Quantity, Total Ship Quantity, Short/Excess Qty, Percentage, Total Carton Qty, Total Gross Weight, Total Net Weight, Total CBM) renders below the table, matching the reference's field order and unit labels exactly.

---

## 6. Export Requirements

- PDF/Excel export must reproduce the reference layout: merged Style No / PO No cells spanning their color group, the size-range sub-header under one "SIZE RANGE" column group, the G.TOTAL row, and the summary box beneath — matching column order and grouping shown in the reference image.
- Do not flatten merged cells into repeated values in the exported table — preserve the visual grouping (Style No and PO No shown once per group, not repeated on every row) as in the reference.
- Reuse the existing bilingual (EN/KA) export pipeline (WeasyPrint) — column headers must be localizable, not hardcoded English strings in the template.

---

## 7. Acceptance Checklist (verify before marking this module done)

- [ ] Every field in Section 2.1–2.3 exists in the data model and appears in both the on-screen builder and the exported document — cross-check against the reference image field by field.
- [ ] Adding a 7th, 8th, etc. color to a style does not break layout, carton numbering, or totals.
- [ ] Removing a color mid-list correctly renumbers carton ranges for colors after it, or clearly flags a gap requiring manual carton renumbering (confirm desired behavior with Admin — this is a business-rule choice, not purely technical).
- [ ] All computed totals match hand-calculated values for the reference image's own data (use it as a test fixture: Style MRF25, first row ECRU HERRINGBONE, Order Qty 60, size ratio 1/3/5/4/2, 15 pcs/carton, 4 cartons, TTL PCS 60, G.W 6.90, TTL G.W 27.60, CBM 0.18 — should reproduce exactly).
- [ ] Grand Total row and Summary box values match sums of the entered rows, including the Short/Excess and Percentage calculation.
- [ ] Exported PDF visually matches the reference's merged-cell grouping and column order.

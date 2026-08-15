# Custom Size Breakdown (Per Color)
### Textile Sourcing, Traceability & Buyer CRM Platform
Feature update to Module 4 (Sourcing Intake) and the Packing List module. Replaces the fixed S/M/L/XL/XXL size grid with fully custom, per-color size entry. Feed this alongside Module_Documentation_Pack.md and Packing_List_Module_Instructions.md when implementing.

---

## 1. What Changed and Why

The system previously assumed every product uses the same shared size columns (S/M/L/XL/XXL) across all colors. That breaks the moment the business sources anything beyond standard tops — pants use waist sizes (30/32/34), footwear uses entirely different sizing systems, some items are "Free Size" only. The fix: **each color row now carries its own independent, repeatable list of `{ size label, quantity }` pairs**, typed freely by the user. Two colors on the very same product can have completely different size sets.

This is one underlying data model, shared identically between Sourcing Intake (where it's first captured) and Packing List (which displays/finalizes it) — not two separate implementations.

---

## 2. Old vs. New

| | Old (fixed grid) | New (per-color custom) |
|---|---|---|
| Structure | One shared set of size columns (S/M/L/XL/XXL) across the whole product or Packing Rule | Each color row has its own independent size list |
| Size labels | Fixed to a pre-set list | Free text — any label: "S", "32", "Free Size", "EU 42", anything |
| Cross-color consistency | All colors forced to share the same columns | Not required — Color 1 can be S/M/L, Color 2 can be Free Size only |
| Data shape | `{ "S": 1, "M": 3, "L": 5, "XL": 4, "XXL": 2 }` (fixed keys) | `[{ "size_label": "S", "quantity": 1 }, { "size_label": "M", "quantity": 3 }, ...]` (array, arbitrary labels) |

---

## 3. Field Definition (replaces the old Size Range field)

| Field | System Field Name | Type | Notes |
|---|---|---|---|
| Size Breakdown (custom, per color) | `size_breakdown` | JSON array of `{ size_label, quantity }` | Repeatable per color row — user adds/removes size entries freely. Not a fixed column set, not shared across colors. |
| Total PC/Per Carton | `pcs_per_carton` | Integer (computed) | Sum of all `quantity` values in this color's `size_breakdown` array |

---

## 4. UI Requirements

- Each color row gets its own "Add Size" control, opening a small repeatable list of Size Label + Quantity pairs underneath that specific color.
- Do **not** render a shared matrix/grid of size columns spanning all colors — this was the old behavior and must be fully replaced, not left as a fallback option.
- Two colors on the same product must be able to have entirely different size sets with no shared-schema constraint blocking it (e.g. one color S/M/L, another Free Size only, on the same Style No).
- This same component/pattern is used identically in both Sourcing Intake (Module 4) and the Packing List module — build it once, reuse it, don't build two versions that could drift apart.
- `pcs_per_carton` remains read-only and live-recalculates as size rows are added/edited/removed.

---

## 5. Data Model

```
-- Per-color row (shared entity between Sourcing Intake and Packing List, per the
-- "reference, don't copy" rule from the Reference Numbers & Identifier System doc)

color_row:
  ...existing fields (pattern_no, po_no, color_name, order_qty, carton fields, etc.)...
  size_breakdown: [
    { "size_label": "S", "quantity": 1 },
    { "size_label": "M", "quantity": 3 },
    { "size_label": "L", "quantity": 5 }
  ]
  pcs_per_carton: computed = sum(entry.quantity for entry in size_breakdown)
```

No fixed schema/enum constrains `size_label` — it is free text, validated only for non-empty and (if desired) reasonable length, not against any predefined list.

---

## 6. Business Rules

- `pcs_per_carton` must recalculate server-side whenever `size_breakdown` changes — never trust a client-submitted total.
- A color row with an empty `size_breakdown` array should be treated as invalid/incomplete for submission purposes (at least one size entry required), unless the business explicitly wants to support sizeless products (e.g. accessories) — confirm this edge case before enforcing it as a hard validation.
- No migration/backfill logic should assume old data was in the fixed S/M/L/XL/XXL shape if any real data already exists under the old model — write a explicit migration script that converts old fixed-key records into the new array format (`{"S": 1, "M": 3}` → `[{"size_label": "S", "quantity": 1}, {"size_label": "M", "quantity": 3}]`) rather than assuming a clean slate.

---

## 7. Acceptance Checklist

- [ ] Adding, editing, and removing size rows within a single color works independently of every other color on the same product.
- [ ] Two colors on the same product can have entirely different size labels/counts (e.g. one S/M/L, one Free Size only) without any shared-schema error.
- [ ] A mixed test case (one shirt-style product with S/M/L/XL sizing, one pants-style product with numeric waist sizing) both work correctly through the same UI component and data model, with no hard-coded apparel-top assumption anywhere in validation.
- [ ] `pcs_per_carton` recalculates correctly and matches hand-calculated sums for a multi-size-entry test case.
- [ ] Sourcing Intake and Packing List display identical `size_breakdown` data for the same color row (same underlying record, not two independently-entered copies).

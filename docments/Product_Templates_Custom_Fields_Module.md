# Product Templates & Custom Fields
### Textile Sourcing, Traceability & Buyer CRM Platform
Extends Module 4 (Sourcing Intake) in the Module Documentation Pack. This adds a template layer so the intake form adapts to different product categories (shirts, pants, footwear, accessories, etc.) instead of forcing every product through one fixed field set.

---

## The Core Idea

Right now, Sourcing Intake has one fixed field list for every product. That breaks down the moment you source something that isn't a standard top (pants need waist/inseam, footwear needs a completely different size system and no "sleeve length," accessories might not need cartons of size breakdowns at all). The fix is a **Product Template**: a named, reusable set of field choices that Admin configures once per product category, then reuses every time that category is sourced.

Three layers, in order of how rigid they are:

1. **Core Fields** — always present, never removable, because the rest of the pipeline (Packing List, Expense Table, QR generation) depends on them existing. These are locked into every template.
2. **Optional Field Library** — a growing catalog of fields Admin can toggle on/off per template (e.g. Sleeve Length, Waist Size, Inseam, Neck Style, Sole Material, Fabric GSM). Off by default; a template turns on only what's relevant.
3. **Custom Fields** — true one-offs, added ad hoc on a specific product when even the library doesn't have what's needed, without polluting the shared template.

---

## Data Model

```
ProductTemplate
  id
  name                    -- e.g. "Shirt", "Trousers", "Footwear"
  description
  is_active
  created_by, created_at

TemplateField
  id
  template_id (FK)
  field_key               -- machine name, e.g. "sleeve_length"
  label                   -- display name, e.g. "Sleeve Length"
  field_type (enum: text | number | decimal | boolean | select)
  select_options (JSON, nullable)   -- only used if field_type = select
  is_required
  is_core                 -- true for fields that can never be removed from ANY template
                              (Color, Pattern No, PO No, Order Qty, Size Breakdown, Inner
                              Bundle, Carton No range, weights, carton dimensions, CBM)
  display_order
  field_group (nullable)  -- see Auto-Select Groups below

FieldGroup
  id
  name                    -- e.g. "Carton Measurements", "Inner Packing"
  description

-- FieldGroup membership: TemplateField.field_group references FieldGroup.id.
-- Selecting one field in a group auto-selects the rest of that group (see Business Rules).

Product (extends existing entity from Module 4)
  ...existing fields...
  template_id (FK, nullable — null means "Custom / no template", core fields only)
  custom_fields (JSON array: [{ "label": "...", "type": "...", "value": "..." }])
      -- one-off fields for this specific product only, not saved to any template
```

---

## Auto-Select Field Groups (the "relevant fields that work with others" part)

Rather than a complex field-by-field dependency graph (hard to reason about, easy to get wrong), group related fields together. Selecting **any one field in a group** auto-selects the whole group when building a template. Suggested starting groups:

| Group | Fields | Why they travel together |
|---|---|---|
| Carton Measurements | Length, Width, Height, CBM | CBM is computed from the other three — meaningless without all of them |
| Inner Packing | Inner Bundle, PC/CTN | PC/CTN calculation depends on knowing the inner bundle structure |
| Weight | Gross Weight, Net Weight, Total Gross/Net Weight | Same reasoning — partial weight data breaks the rollup totals |
| Bottom-Wear Sizing | Waist Size, Inseam Length | Almost always sourced together for pants/trousers |
| Footwear Sizing | Shoe Size System (e.g. EU/UK/US), Sole Material | Footwear-specific, rarely needed alongside apparel fields |

Admin can define new groups as new product categories get added — this list isn't meant to be exhaustive on day one.

---

## UI Requirements

### Template Manager (new Admin screen, e.g. under Settings or a new sidebar item "Product Templates")
- List of existing templates (Shirt, Pants, Footwear, ...) with an "Add Template" button.
- Template builder: checkbox list of the full Field Library, grouped visually by FieldGroup. Checking one field in a group highlights/auto-checks the rest of that group, with a small inline note ("these fields are linked and were selected together").
- Core fields shown in the list but greyed out/always-checked — cannot be unchecked, with a tooltip explaining why (they feed Packing List/Expense/QR downstream).
- Reorder fields via drag handle (`display_order`) — this becomes the order they render in on the intake form.
- Save as a named template.

### Sourcing Intake screen (update to Module 4's existing flow)
- **First step, before anything else**: "Select Product Template" dropdown (Shirt / Pants / Footwear / ... / Custom). Choosing one instantly reshapes the form below to show only that template's fields (core fields always present, plus whatever the template turned on).
- Choosing "Custom" shows core fields only, plus an "Add Custom Field" button (label + type + value) for anything not worth building into a shared template yet.
- A per-product "Add Custom Field" option should also be available **even when a template is selected** — for the rare one-off attribute on an otherwise-normal shirt, without having to edit the shared Shirt template for one product.
- The per-color packing detail grid (as in your screenshot) stays as-is structurally, but its Size Breakdown section now uses the per-color custom size rows we already locked in (not the fixed S/M/L/XL/XXL grid shown in the current screenshot) — update that part of the build alongside this feature, since they're related.

---

## API Endpoints

- `GET/POST /api/v1/product-templates/`
- `GET/PATCH/DELETE /api/v1/product-templates/{id}/`
- `GET/POST /api/v1/field-groups/`
- `GET /api/v1/field-library/` — full catalog of available optional fields, for the template builder's checkbox list
- `POST /api/v1/products/{id}/custom-fields/` — add a one-off field to a specific product

---

## Business Rules

- Core fields (`is_core = true`) can never be removed from a template or from a product, regardless of template selection — enforce server-side, not just by greying out the checkbox client-side.
- Selecting one field in a `field_group` auto-adds the rest of that group to the template at save time — implement as a single validation/completion step on save, not a live client-side-only behavior that could be bypassed via direct API calls.
- Changing a Template's field set after products already exist against it should **not** retroactively alter already-created products — existing products keep whatever fields they were created with (store the resolved field set on the product at creation time, or reference the template version, not a live pointer that changes retroactively).
- Custom Fields added at the product level are private to that product — they do not appear as options in the shared Field Library unless an Admin explicitly "promotes" a custom field into the library (a deliberate action, not automatic), so ad hoc one-offs don't silently clutter every future template's checkbox list.
- Field `field_key` values must be unique within the Field Library — prevent two fields with the same machine name existing under different labels, which would break downstream data consistency.

---

## Suggestions (since you asked)

1. **Start with 3–4 templates, not a huge library.** Shirt, Pants, Footwear, and a generic "Other" are probably enough to start — you'll learn what fields actually matter per category once real products flow through, and it's much easier to add fields to the library later than to prune a bloated one.

2. **Let a template inherit from another.** E.g. "Pants" and "Shorts" probably share 90% of the same fields (waist size, fabric, etc.) minus inseam length. A lightweight "clone template" action (copy an existing template's field selection as a starting point for a new one) saves a lot of re-clicking versus building every template from zero.

3. **Version templates, don't just overwrite them.** Per the business rule above about not retroactively changing existing products — consider giving each template a version number, so if you ever need to audit "what fields did we actually capture for this product in March," you can trace it back precisely, not just to "whatever the Shirt template currently looks like."

4. **Promote custom fields deliberately, with a light review step.** If three different products all end up with an ad hoc custom field called "Zipper Type," that's a strong signal it should become a real library field. A simple admin view — "custom fields used 3+ times, not yet in the library" — turns organic real-world usage into your field library roadmap, rather than you guessing upfront what every product type needs.

5. **Don't let field_type get too clever early.** Text, Number, Decimal, Boolean, and Select cover almost everything you'll need (fabric composition, sizes, yes/no flags, dropdown-style options like sole material). Resist the urge to add file-upload or multi-select custom field types until a real use case forces it — every extra type is more UI and validation surface to maintain.

---

## Acceptance Checklist

- [ ] Core fields cannot be removed from any template, verified via direct API attempt (not just UI).
- [ ] Selecting one field in a Field Group auto-includes the rest of the group when saving a template.
- [ ] Choosing a Template on the Sourcing Intake screen correctly reshapes the visible fields, hiding non-selected optional fields entirely (not just disabling them).
- [ ] Adding a per-product Custom Field does not affect the shared Template or Field Library.
- [ ] Editing an existing Template's field set does not alter already-created Products that used a prior version of that template.
- [ ] "Custom" (no template) intake flow still enforces all core fields correctly.

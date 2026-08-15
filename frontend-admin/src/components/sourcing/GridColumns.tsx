import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import type { CustomFieldEntry, FieldType, ProductTemplateFieldEntry } from "@/types/templates"

/** Product_Templates_Custom_Fields_Module.md, redesigned per user feedback:
 * a Template's fields (plus any ad hoc ones added while building one
 * product/packing list) render as real spreadsheet columns — every row
 * (one color) has its own value per column, so it's always clear which
 * color owns which value. `Product.resolvedTemplateFields` /
 * `PackingList`-side equivalent is the column schema; each row's own
 * `customFieldValues` holds its values, matched to columns by label. */

export function columnsFromTemplateFields(fields: ProductTemplateFieldEntry[]): ProductTemplateFieldEntry[] {
  return [...fields].sort((a, b) => a.displayOrder - b.displayOrder)
}

export function blankValuesForColumns(columns: ProductTemplateFieldEntry[]): CustomFieldEntry[] {
  return columns.map((c) => ({ label: c.label, type: c.fieldType, value: "" }))
}

/** Union of the columns already used by a set of rows (inferred from each
 * row's own customFieldValues), in first-seen order. Used where a single
 * grid can span rows sourced from different Products/templates (Packing
 * List builder) so there's no one authoritative column schema to read —
 * unlike Sourcing Intake, where all rows share one Product's template. */
export function columnsFromValues(rowsValues: CustomFieldEntry[][]): ProductTemplateFieldEntry[] {
  const seen = new Map<string, ProductTemplateFieldEntry>()
  for (const values of rowsValues) {
    for (const v of values) {
      if (!seen.has(v.label)) {
        seen.set(v.label, {
          id: v.label, fieldKey: v.label.toLowerCase().replace(/\s+/g, "_"), label: v.label, fieldType: v.type,
          selectOptions: [], isRequired: false, fieldGroup: null, displayOrder: 0,
        })
      }
    }
  }
  return [...seen.values()]
}

export function mergeColumns(base: ProductTemplateFieldEntry[], extra: ProductTemplateFieldEntry[]): ProductTemplateFieldEntry[] {
  const result = [...base]
  for (const c of extra) {
    if (!result.some((x) => x.label === c.label)) result.push(c)
  }
  return result
}

export function getCellValue(values: CustomFieldEntry[], column: ProductTemplateFieldEntry): string {
  return values.find((v) => v.label === column.label)?.value ?? ""
}

export function setCellValue(values: CustomFieldEntry[], column: ProductTemplateFieldEntry, value: string): CustomFieldEntry[] {
  if (values.some((v) => v.label === column.label)) {
    return values.map((v) => (v.label === column.label ? { ...v, value } : v))
  }
  return [...values, { label: column.label, type: column.fieldType, value }]
}

export function ColumnCellInput({ column, value, onChange }: {
  column: ProductTemplateFieldEntry
  value: string
  onChange: (value: string) => void
}) {
  if (column.fieldType === "boolean") {
    return (
      <Select className="h-7 w-20 text-xs" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </Select>
    )
  }
  if (column.fieldType === "select" && column.selectOptions.length > 0) {
    return (
      <Select className="h-7 w-24 text-xs" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {column.selectOptions.map((o) => (<option key={o} value={o}>{o}</option>))}
      </Select>
    )
  }
  return (
    <Input
      className="h-7 w-20 text-xs" value={value} onChange={(e) => onChange(e.target.value)}
      type={column.fieldType === "number" || column.fieldType === "decimal" ? "number" : "text"}
    />
  )
}

const AD_HOC_FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "decimal", label: "Decimal" },
  { value: "boolean", label: "Boolean" },
]

/** "Add Column" — an ad hoc grid column scoped to just this product/list,
 * never written back to the shared Field Library (BR: custom fields added
 * at this level are private, not shared-library options). No Select type
 * here since ad hoc columns have no way to define their option list yet —
 * pick a Select field from the Field Library (via a Product Template)
 * instead if that's needed. */
export function AddColumnDialog({ onClose, onAdd }: {
  onClose: () => void
  onAdd: (column: ProductTemplateFieldEntry) => void
}) {
  const [label, setLabel] = useState("")
  const [fieldType, setFieldType] = useState<FieldType>("text")

  function handleSubmit(e: React.FormEvent) {
    // React bubbles portaled events through the *React* tree, not the DOM
    // tree — this dialog is portaled out of the parent Create/Edit
    // <form>, but without stopPropagation() the submit would still reach
    // and trigger that outer form's onSubmit too.
    e.preventDefault()
    e.stopPropagation()
    if (!label.trim()) return
    onAdd({
      id: crypto.randomUUID(),
      fieldKey: label.trim().toLowerCase().replace(/\s+/g, "_"),
      label: label.trim(),
      fieldType,
      selectOptions: [],
      isRequired: false,
      fieldGroup: null,
      displayOrder: 0,
    })
  }

  return (
    <Dialog open onClose={onClose} title="Add Column">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Column Label *</label>
          <Input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Fabric GSM" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
          <Select value={fieldType} onChange={(e) => setFieldType(e.target.value as FieldType)}>
            {AD_HOC_FIELD_TYPE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </Select>
        </div>
        <p className="text-[11px] text-slate-400">
          Applies to every row in this table. Private to this product/list — never added to the shared Field Library.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit">Add Column</Button>
        </div>
      </form>
    </Dialog>
  )
}

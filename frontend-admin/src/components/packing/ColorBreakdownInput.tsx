import { Plus, Trash2 } from "lucide-react"

export interface ColorBreakdownRow {
  name: string
  qty: number
}

export const DEFAULT_COLOR_SLOT_COUNT = 6

/** No predefined color names — every row starts blank and the user types
 * whatever color name applies. */
export function emptyColorBreakdownRows(count: number = DEFAULT_COLOR_SLOT_COUNT): ColorBreakdownRow[] {
  return Array.from({ length: count }, () => ({ name: "", qty: 0 }))
}

export function colorBreakdownToRows(breakdown: Record<string, number>): ColorBreakdownRow[] {
  const entries = Object.entries(breakdown || {})
  return entries.length ? entries.map(([name, qty]) => ({ name, qty })) : emptyColorBreakdownRows()
}

/** Rows with a name are kept (blank names default to "Color N" so a
 * nonzero quantity is never silently dropped); fully-empty rows are
 * dropped. */
export function colorRowsToBreakdown(rows: ColorBreakdownRow[]): Record<string, number> {
  const result: Record<string, number> = {}
  rows.forEach((row, i) => {
    const name = row.name.trim()
    if (!name && !row.qty) return
    result[name || `Color ${i + 1}`] = row.qty
  })
  return result
}

export function ColorBreakdownInput({ rows, onChange }: {
  rows: ColorBreakdownRow[]
  onChange: (rows: ColorBreakdownRow[]) => void
}) {
  function updateRow(i: number, patch: Partial<ColorBreakdownRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i))
  }
  function addRow() {
    onChange([...rows, { name: "", qty: 0 }])
  }

  return (
    <div className="flex flex-col gap-1">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            className="h-6 w-16 rounded border border-slate-200 px-1 text-[10px] placeholder:text-slate-300"
            placeholder={`Color ${i + 1}`}
            value={row.name}
            onChange={(e) => updateRow(i, { name: e.target.value })}
          />
          <input
            className="h-6 w-9 rounded border border-slate-200 px-1 text-xs text-center"
            type="number" min={0}
            value={row.qty}
            onChange={(e) => updateRow(i, { qty: Number(e.target.value) })}
          />
          <button type="button" onClick={() => removeRow(i)} className="shrink-0 text-slate-300 hover:text-red-500">
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600">
        <Plus className="h-2.5 w-2.5" /> Add Color
      </button>
    </div>
  )
}

import { Plus, Trash2 } from "lucide-react"

/** Custom_Size_Breakdown_Feature.md: a per-color, free-form list of
 * {size_label, quantity} pairs — replaces the old fixed S/M/L/XL/XXL grid.
 * Two colors on the same product can carry entirely different size sets;
 * this component has no notion of a shared column set at all. */
export interface SizeBreakdownEntry {
  size_label: string
  quantity: number
}

export function emptySizeBreakdownRows(): SizeBreakdownEntry[] {
  return []
}

/** Rows with a label are kept (blank labels are dropped along with the
 * row); fully-empty rows never make it into the saved payload. */
export function sizeRowsClean(rows: SizeBreakdownEntry[]): SizeBreakdownEntry[] {
  return rows.filter((r) => r.size_label.trim())
}

export function sizeRowsTotalQty(rows: SizeBreakdownEntry[]): number {
  return rows.reduce((sum, row) => sum + (row.quantity || 0), 0)
}

export function SizeBreakdownInput({ rows, onChange }: {
  rows: SizeBreakdownEntry[]
  onChange: (rows: SizeBreakdownEntry[]) => void
}) {
  function updateRow(i: number, patch: Partial<SizeBreakdownEntry>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i))
  }
  function addRow() {
    onChange([...rows, { size_label: "", quantity: 0 }])
  }

  return (
    <div className="flex flex-col gap-1">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            className="h-6 w-14 rounded border border-slate-200 px-1 text-[10px] placeholder:text-slate-300"
            placeholder="Size"
            value={row.size_label}
            onChange={(e) => updateRow(i, { size_label: e.target.value })}
          />
          <input
            className="h-6 w-9 rounded border border-slate-200 px-1 text-xs text-center"
            type="number" min={0}
            value={row.quantity}
            onChange={(e) => updateRow(i, { quantity: Number(e.target.value) })}
          />
          <button type="button" onClick={() => removeRow(i)} className="shrink-0 text-slate-300 hover:text-red-500">
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600">
        <Plus className="h-2.5 w-2.5" /> Add Size
      </button>
    </div>
  )
}

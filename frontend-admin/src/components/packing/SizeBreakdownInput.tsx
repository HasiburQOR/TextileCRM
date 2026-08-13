export function SizeBreakdownInput({ sizeKeys, values, onChange }: {
  sizeKeys: string[]; values: Record<string, number>; onChange: (u: Record<string, number>) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      {sizeKeys.map((size) => (
        <div key={size} className="flex items-center gap-1">
          <span className="w-8 shrink-0 text-right text-[10px] text-slate-400">{size}</span>
          <input
            className="h-6 w-9 rounded border border-slate-200 px-1 text-xs text-center"
            type="number" min={0} value={values[size] ?? 0}
            onChange={(e) => onChange({ ...values, [size]: Number(e.target.value) })}
          />
        </div>
      ))}
    </div>
  )
}

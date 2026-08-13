import { Construction } from "lucide-react"

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white py-24 text-center">
      <Construction className="h-8 w-8 text-slate-300" />
      <h1 className="text-lg font-semibold text-slate-700">{title}</h1>
      <p className="max-w-sm text-sm text-slate-400">
        This screen is built in a later frontend phase. The backend API behind it is already live.
      </p>
    </div>
  )
}

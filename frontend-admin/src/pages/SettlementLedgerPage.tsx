import { useQuery } from "@tanstack/react-query"
import { AlertTriangle } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Paginated } from "@/types/api"

interface SettlementLedgerRow {
  sisterProfile: string; sisterProfilePoReference: string; buyerName: string; agreementType: string
  totalAdvance: string; totalExpense: string; amountOwed: string; netPosition: string
  negativeBalance: boolean; updatedAt: string
}

export function SettlementLedgerPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")

  const ledgersQuery = useQuery({
    queryKey: ["settlements", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SettlementLedgerRow>>("/settlements/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const filtered = useMemo(() => {
    const rows = ledgersQuery.data ?? []
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter((r) => r.sisterProfilePoReference.toLowerCase().includes(q) || r.buyerName.toLowerCase().includes(q))
  }, [ledgersQuery.data, search])

  const negativeCount = (ledgersQuery.data ?? []).filter((r) => r.negativeBalance).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settlement Ledger</h1>
        <p className="text-sm text-slate-500">Live balance position per Sister Profile.</p>
      </div>

      {negativeCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {negativeCount} Sister Profile{negativeCount > 1 ? "s" : ""} with a negative balance.
        </div>
      )}

      <Input className="w-72" placeholder="Search PO or buyer..." value={search} onChange={(e) => setSearch(e.target.value)} />

      <Card>
        <CardContent className="p-0">
          {ledgersQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No ledger data yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Sister Profile</th>
                  <th className="px-4 py-3 font-medium">Buyer</th>
                  <th className="px-4 py-3 font-medium">Agreement</th>
                  <th className="px-4 py-3 font-medium">Advance</th>
                  <th className="px-4 py-3 font-medium">Expense</th>
                  <th className="px-4 py-3 font-medium">Amount Owed</th>
                  <th className="px-4 py-3 font-medium">Net Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.sisterProfile} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/sister-profiles/${r.sisterProfile}`)}>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.sisterProfilePoReference || r.sisterProfile}</td>
                    <td className="px-4 py-3 text-slate-500">{r.buyerName}</td>
                    <td className="px-4 py-3 text-slate-500">Type {r.agreementType}</td>
                    <td className="px-4 py-3 text-slate-500">{Number(r.totalAdvance).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-500">{Number(r.totalExpense).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-500">{Number(r.amountOwed).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={cn("font-semibold", r.negativeBalance ? "text-red-600" : "text-emerald-600")}>
                        {Number(r.netPosition).toLocaleString()}
                      </span>
                      {r.negativeBalance && <Badge variant="danger" className="ml-2">Negative</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

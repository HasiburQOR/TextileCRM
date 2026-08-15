import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import type { Paginated } from "@/types/api"
import type { BuyerProfile } from "@/types/buyers"
import type { SisterProfile } from "@/types/sourcing"

interface Expense {
  id: string; sisterProfile: string; sisterProfilePoReference: string
  buyerProfile: string; buyerProfileName: string
  product: string | null; productName: string | null
  sourceType: string; amount: string; currency: string
  remarks: string; fieldName: string; createdByName: string; createdAt: string
}

const SOURCE_TYPES = [
  "sourcing_advance", "qc_lunch", "qc_carrying", "qc_travel_extra",
  "warehouse_loader", "warehouse_extra_worker", "warehouse_packaging_item", "custom_field", "extra_cost",
]

export function ExpensesPage() {
  const navigate = useNavigate()
  const [buyerFilter, setBuyerFilter] = useState("")
  const [sisterProfileFilter, setSisterProfileFilter] = useState("")
  const [sourceTypeFilter, setSourceTypeFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const expensesQuery = useQuery({
    queryKey: ["expenses", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Expense>>("/expenses/", { params: { page_size: 500 } })
      return data.results
    },
  })

  const buyersQuery = useQuery({
    queryKey: ["buyers", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BuyerProfile>>("/buyers/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const profilesQuery = useQuery({
    queryKey: ["sister-profiles", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 200 } })
      return data.results
    },
  })

  // Choosing a Buyer narrows which Sister Profiles are selectable to that
  // buyer's own — picking one from a different buyer would silently produce
  // zero rows otherwise.
  const sisterProfileOptions = useMemo(
    () => (profilesQuery.data ?? []).filter((sp) => !buyerFilter || sp.buyerProfile === buyerFilter),
    [profilesQuery.data, buyerFilter],
  )

  function handleBuyerChange(value: string) {
    setBuyerFilter(value)
    if (value && sisterProfileFilter) {
      const current = profilesQuery.data?.find((sp) => sp.id === sisterProfileFilter)
      if (current?.buyerProfile !== value) setSisterProfileFilter("")
    }
  }

  const filtered = useMemo(() => {
    const rows = expensesQuery.data ?? []
    return rows.filter((e) => {
      if (buyerFilter && e.buyerProfile !== buyerFilter) return false
      if (sisterProfileFilter && e.sisterProfile !== sisterProfileFilter) return false
      if (sourceTypeFilter && e.sourceType !== sourceTypeFilter) return false
      const day = e.createdAt.slice(0, 10)
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false
      return true
    })
  }, [expensesQuery.data, buyerFilter, sisterProfileFilter, sourceTypeFilter, dateFrom, dateTo])

  const total = filtered.reduce((sum, e) => sum + Number(e.amount), 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Expenses</h1>
        <p className="text-sm text-slate-500">Central Expense Table — every cost-producing action, in one place.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select className="w-56" value={buyerFilter} onChange={(e) => handleBuyerChange(e.target.value)}>
          <option value="">All Buyers</option>
          {buyersQuery.data?.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
        </Select>
        <Select className="w-56" value={sisterProfileFilter} onChange={(e) => setSisterProfileFilter(e.target.value)}>
          <option value="">All Sister Profiles</option>
          {sisterProfileOptions.map((sp) => (<option key={sp.id} value={sp.id}>{sp.poReference || sp.id}</option>))}
        </Select>
        <Select className="w-48" value={sourceTypeFilter} onChange={(e) => setSourceTypeFilter(e.target.value)}>
          <option value="">All Source Types</option>
          {SOURCE_TYPES.map((t) => (<option key={t} value={t}>{t.replace(/_/g, " ")}</option>))}
        </Select>
        <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span className="text-sm text-slate-400">to</span>
        <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <span className="text-sm text-slate-500">{filtered.length} expenses</span>
          <span className="text-lg font-semibold text-slate-900">Total: {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {expensesQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No expenses match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Buyer</th>
                    <th className="px-4 py-3 font-medium">Sister Profile</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Source Type</th>
                    <th className="px-4 py-3 font-medium">Field</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Remarks</th>
                    <th className="px-4 py-3 font-medium">Recorded By</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((e) => (
                    <tr
                      key={e.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => navigate(e.product ? `/products/${e.product}` : `/sister-profiles/${e.sisterProfile}`)}
                    >
                      <td className="px-4 py-3 text-slate-500">{e.buyerProfileName || "—"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{e.sisterProfilePoReference || e.sisterProfile}</td>
                      <td className="px-4 py-3 text-slate-500">{e.productName || "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{e.sourceType.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-slate-500">{e.fieldName || "—"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{Number(e.amount).toLocaleString()} {e.currency}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-slate-400" title={e.remarks || undefined}>{e.remarks || "—"}</td>
                      <td className="px-4 py-3 text-slate-400">{e.createdByName || "—"}</td>
                      <td className="px-4 py-3 text-slate-400">{new Date(e.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

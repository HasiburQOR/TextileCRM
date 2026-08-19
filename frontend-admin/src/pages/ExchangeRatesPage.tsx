import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { extractErrorMessage } from "@/lib/errors"
import type { Paginated } from "@/types/api"
import type { ExchangeRate, ExchangeRateCreateInput } from "@/types/invoicing"

export function ExchangeRatesPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const isAdmin = user?.role === "admin"

  const ratesQuery = useQuery({
    queryKey: ["exchange-rates", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ExchangeRate>>("/exchange-rates/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const createMutation = useMutation({
    mutationFn: async (input: ExchangeRateCreateInput) => {
      const { data } = await api.post<ExchangeRate>("/exchange-rates/", input)
      return data
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exchange-rates"] }); setCreateOpen(false) },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Exchange Rates</h1>
          <p className="text-sm text-slate-500">Manually published rates, used when generating invoices.</p>
        </div>
        {isAdmin && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Publish Rate</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          {ratesQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : !ratesQuery.data?.length ? (
            <p className="py-10 text-center text-sm text-slate-400">No exchange rates published yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Pair</th>
                  <th className="px-4 py-3 font-medium">Rate</th>
                  <th className="px-4 py-3 font-medium">Effective Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ratesQuery.data.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.sourceCurrency} → {r.targetCurrency}</td>
                    <td className="px-4 py-3 text-slate-500">{Number(r.rate).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                    <td className="px-4 py-3 text-slate-400">{r.effectiveDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <PublishRateDialog
          onClose={() => setCreateOpen(false)}
          onSubmit={createMutation.mutate}
          loading={createMutation.isPending}
          error={createMutation.error ? extractErrorMessage(createMutation.error) : null}
        />
      )}
    </div>
  )
}

function PublishRateDialog({ onClose, onSubmit, loading, error }: {
  onClose: () => void; onSubmit: (input: ExchangeRateCreateInput) => void; loading: boolean; error: string | null
}) {
  const [sourceCurrency, setSourceCurrency] = useState("USD")
  const [targetCurrency, setTargetCurrency] = useState("BDT")
  const [rate, setRate] = useState(0)
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({ sourceCurrency, targetCurrency, rate, effectiveDate })
  }

  return (
    <Dialog open onClose={onClose} title="Publish Exchange Rate">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Source Currency *</label>
            <Input required value={sourceCurrency} onChange={(e) => setSourceCurrency(e.target.value.toUpperCase())} maxLength={8} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Target Currency *</label>
            <Input required value={targetCurrency} onChange={(e) => setTargetCurrency(e.target.value.toUpperCase())} maxLength={8} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Rate *</label>
          <Input required type="number" min={0} step="0.000001" value={rate} onChange={(e) => setRate(Number(e.target.value))} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Effective Date *</label>
          <Input required type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>{loading ? "Publishing..." : "Publish Rate"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

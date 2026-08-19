import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { extractErrorMessage } from "@/lib/errors"
import type { Paginated } from "@/types/api"
import type { AgreementType, BuyerProfile, SisterProfile, SisterProfileCreateInput, SisterProfileStatus } from "@/types/buyers"
import { AGREEMENTS } from "@/types/buyers"

const STATUS_BADGE: Record<SisterProfileStatus, "info" | "success" | "danger"> = {
  active: "info", completed: "success", cancelled: "danger",
}

export function SisterProfilesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const buyerFilter = searchParams.get("buyer") ?? ""
  const [search, setSearch] = useState("")
  const [agreementFilter, setAgreementFilter] = useState<AgreementType | "all">("all")
  const [statusFilter, setStatusFilter] = useState<SisterProfileStatus | "all">("all")
  const [createOpen, setCreateOpen] = useState(!!buyerFilter)

  const profilesQuery = useQuery({
    queryKey: ["sister-profiles", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const filtered = useMemo(() => {
    const rows = profilesQuery.data ?? []
    return rows.filter((sp) => {
      if (buyerFilter && sp.buyerProfile !== buyerFilter) return false
      if (agreementFilter !== "all" && sp.agreementType !== agreementFilter) return false
      if (statusFilter !== "all" && sp.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        return sp.poReference.toLowerCase().includes(q) || sp.buyerProfileName.toLowerCase().includes(q)
      }
      return true
    })
  }, [profilesQuery.data, buyerFilter, agreementFilter, statusFilter, search])

  const createMutation = useMutation({
    mutationFn: async (input: SisterProfileCreateInput) => {
      const { data } = await api.post<SisterProfile>("/sister-profiles/", input)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sister-profiles"] })
      setCreateOpen(false)
      navigate(`/sister-profiles/${data.id}`)
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sister Profiles</h1>
          <p className="text-sm text-slate-500">One purchase order / shipment per buyer, each with its own agreement.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New Sister Profile
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="w-64 pl-9" placeholder="Search PO or buyer..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="w-44" value={agreementFilter} onChange={(e) => setAgreementFilter(e.target.value as AgreementType | "all")}>
          <option value="all">All Agreement Types</option>
          {(Object.keys(AGREEMENTS) as AgreementType[]).map((key) => (
            <option key={key} value={key}>{AGREEMENTS[key].short}</option>
          ))}
        </Select>
        <Select className="w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SisterProfileStatus | "all")}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        {buyerFilter && (
          <Badge variant="info" className="cursor-pointer" onClick={() => setSearchParams({})}>
            Filtered by buyer ✕
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {profilesQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No Sister Profiles match the current filters.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">PO Reference</th>
                  <th className="px-4 py-3 font-medium">Buyer</th>
                  <th className="px-4 py-3 font-medium">Agreement</th>
                  <th className="px-4 py-3 font-medium">Currency</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((sp) => (
                  <tr key={sp.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/sister-profiles/${sp.id}`)}>
                    <td className="px-4 py-3"><code className="text-xs text-slate-500">{sp.referenceCode}</code></td>
                    <td className="px-4 py-3 font-medium text-slate-900">{sp.poReference || sp.id}</td>
                    <td className="px-4 py-3 text-slate-500">{sp.buyerProfileName}</td>
                    <td className="px-4 py-3 text-slate-500" title={AGREEMENTS[sp.agreementType]?.title}>
                      {AGREEMENTS[sp.agreementType]?.short ?? `Type ${sp.agreementType}`}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {sp.supplierCurrency} → {sp.buyerCurrency}
                      {Number(sp.exchangeRate) > 0 && (
                        <span className="block text-slate-400">
                          1 {sp.buyerCurrency} = {Number(sp.exchangeRate).toLocaleString()} {sp.supplierCurrency}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3"><Badge variant={STATUS_BADGE[sp.status]}>{sp.status}</Badge></td>
                    <td className="px-4 py-3 text-slate-400">{new Date(sp.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <CreateSisterProfileDialog
          initialBuyer={buyerFilter}
          onClose={() => setCreateOpen(false)}
          onSubmit={createMutation.mutate}
          loading={createMutation.isPending}
          error={createMutation.error ? extractErrorMessage(createMutation.error) : null}
        />
      )}
    </div>
  )
}

function CreateSisterProfileDialog({ initialBuyer, onClose, onSubmit, loading, error }: {
  initialBuyer: string; onClose: () => void
  onSubmit: (input: SisterProfileCreateInput) => void
  loading: boolean; error: string | null
}) {
  const [buyerProfile, setBuyerProfile] = useState(initialBuyer)
  const [poReference, setPoReference] = useState("")
  const [agreementType, setAgreementType] = useState<AgreementType>("1")
  const [supplierCurrency, setSupplierCurrency] = useState("BDT")
  const [buyerCurrency, setBuyerCurrency] = useState("USD")
  const [exchangeRate, setExchangeRate] = useState("")
  const [referenceCode, setReferenceCode] = useState("")

  const buyersQuery = useQuery({
    queryKey: ["buyers", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BuyerProfile>>("/buyers/", { params: { page_size: 200 } })
      return data.results
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      buyerProfile,
      poReference,
      agreementType,
      supplierCurrency: supplierCurrency.trim().toUpperCase(),
      buyerCurrency: buyerCurrency.trim().toUpperCase(),
      exchangeRate: exchangeRate.trim() || "0",
      referenceCode: referenceCode.trim() || undefined,
    })
  }

  return (
    <Dialog open onClose={onClose} title="New Sister Profile">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Buyer *</label>
          <Select required value={buyerProfile} onChange={(e) => setBuyerProfile(e.target.value)}>
            <option value="">Select buyer...</option>
            {buyersQuery.data?.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">PO Reference</label>
          <Input value={poReference} onChange={(e) => setPoReference(e.target.value)} placeholder="Buyer's PO number" />
        </div>

        <fieldset>
          <legend className="mb-2 block text-xs font-medium text-slate-600">Agreement with this buyer *</legend>
          <div className="flex flex-col gap-2">
            {(Object.keys(AGREEMENTS) as AgreementType[]).map((key) => {
              const spec = AGREEMENTS[key]
              const selected = agreementType === key
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer gap-3 rounded-md border p-3 transition ${
                    selected ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio" name="agreementType" value={key} checked={selected}
                    onChange={() => setAgreementType(key)} className="mt-1 h-4 w-4 shrink-0"
                  />
                  <span className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-slate-900">{spec.title}</span>
                    <span className="text-xs leading-relaxed text-slate-500">{spec.explanation}</span>
                    <span className="text-xs text-slate-400">
                      The {spec.rateLabel.toLowerCase()} is entered on each invoice, not here.
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-xs font-medium text-slate-600">Currency &amp; exchange rate</legend>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            Sourcing and warehouse costs are spent in the supplier's currency and charged to the buyer's
            wallet in theirs, converted at this rate. Both figures are shown to both sides.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Supplier currency *</label>
              <Input
                required maxLength={8} value={supplierCurrency}
                onChange={(e) => setSupplierCurrency(e.target.value.toUpperCase())} placeholder="BDT"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Buyer currency *</label>
              <Input
                required maxLength={8} value={buyerCurrency}
                onChange={(e) => setBuyerCurrency(e.target.value.toUpperCase())} placeholder="USD"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">Exchange rate</label>
            <Input
              type="number" min={0} step="0.000001" value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)} placeholder="e.g. 120"
            />
            <p className="mt-1 text-xs text-slate-400">
              {Number(exchangeRate) > 0
                ? `1 ${buyerCurrency || "buyer"} = ${exchangeRate} ${supplierCurrency || "supplier"}`
                : "Leave blank until the rate is agreed — costs then pass through unconverted."}
            </p>
          </div>
        </fieldset>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Reference Code</label>
          <Input value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} placeholder="Leave blank to auto-generate SIS-0001..." />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading || !buyerProfile}>{loading ? "Creating..." : "Create Sister Profile"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

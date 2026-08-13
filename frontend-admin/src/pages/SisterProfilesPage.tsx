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

const AGREEMENT_RATE_KEY: Record<AgreementType, { key: string; label: string; suffix: string }> = {
  "1": { key: "percentage_rate", label: "Percentage of Purchase Value", suffix: "%" },
  "2": { key: "rate_per_unit", label: "Rate per Unit", suffix: "/pc" },
  "3": { key: "commission_percentage", label: "Commission Percentage", suffix: "%" },
}

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
          <option value="1">Type 1 — % of purchase</option>
          <option value="2">Type 2 — per unit</option>
          <option value="3">Type 3 — commission</option>
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
                  <th className="px-4 py-3 font-medium">PO Reference</th>
                  <th className="px-4 py-3 font-medium">Buyer</th>
                  <th className="px-4 py-3 font-medium">Agreement</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((sp) => (
                  <tr key={sp.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/sister-profiles/${sp.id}`)}>
                    <td className="px-4 py-3 font-medium text-slate-900">{sp.poReference || sp.id}</td>
                    <td className="px-4 py-3 text-slate-500">{sp.buyerProfileName}</td>
                    <td className="px-4 py-3 text-slate-500">Type {sp.agreementType}</td>
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
  const [rateValue, setRateValue] = useState<number>(0)

  const buyersQuery = useQuery({
    queryKey: ["buyers", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BuyerProfile>>("/buyers/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const rateSpec = AGREEMENT_RATE_KEY[agreementType]

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      buyerProfile,
      poReference,
      agreementType,
      agreementRateConfig: { [rateSpec.key]: rateValue },
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
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Agreement Type *</label>
          <Select required value={agreementType} onChange={(e) => { setAgreementType(e.target.value as AgreementType); setRateValue(0) }}>
            <option value="1">Type 1 — % of purchase value</option>
            <option value="2">Type 2 — fixed rate per unit</option>
            <option value="3">Type 3 — reimburse + commission</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{rateSpec.label} *</label>
          <div className="relative">
            <Input
              required type="number" min={0} step="0.01" value={rateValue}
              onChange={(e) => setRateValue(Number(e.target.value))}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{rateSpec.suffix}</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading || !buyerProfile}>{loading ? "Creating..." : "Create Sister Profile"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

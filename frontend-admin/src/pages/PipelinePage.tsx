import { useQuery } from "@tanstack/react-query"
import { ChevronRight, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import type { Paginated } from "@/types/api"
import type { SisterProfile, SisterProfileStatus } from "@/types/buyers"
import { PIPELINE_STEP_ORDER, type PipelineStepKey } from "@/types/pipeline"
import type { Product, SourcingCost } from "@/types/sourcing"
import type { WarehouseCost } from "@/types/warehouse"

const STATUS_BADGE: Record<SisterProfileStatus, "info" | "success" | "danger"> = {
  active: "info", completed: "success", cancelled: "danger",
}

const STEP_TITLES: Record<PipelineStepKey, string> = {
  intake: "Sourcing Intake",
  sourcingCost: "Sourcing Cost",
  packingList: "Packing List",
  warehouseCost: "Warehouse Cost",
}

interface Row {
  profile: SisterProfile
  /** Same completion rules as the backend /pipeline/ endpoint. */
  steps: Record<PipelineStepKey, boolean>
  packingSkippedOver: boolean
}

/**
 * The Sourcing Pipeline landing page: one row per Sister Profile with its
 * four-step progress, computed client-side from the same bulk lists the
 * detail page's steps use — the per-order /pipeline/ endpoint is only hit on
 * the detail page, so this stays a fixed four queries regardless of order
 * count.
 */
export function PipelinePage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<SisterProfileStatus | "all">("all")

  const profilesQuery = useQuery({
    queryKey: ["sister-profiles", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 200 } })
      return data.results
    },
  })
  const productsQuery = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>("/products/", { params: { page_size: 500 } })
      return data.results
    },
  })
  const costsQuery = useQuery({
    queryKey: ["sourcing-costs", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SourcingCost>>("/sourcing-costs/", { params: { page_size: 500 } })
      return data.results
    },
  })
  const warehouseCostsQuery = useQuery({
    queryKey: ["warehouse-costs", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<WarehouseCost>>("/warehouse-costs/", { params: { page_size: 500 } })
      return data.results
    },
  })

  const rows: Row[] = useMemo(() => {
    const products = productsQuery.data ?? []
    const costs = costsQuery.data ?? []
    const wcs = warehouseCostsQuery.data ?? []
    return (profilesQuery.data ?? []).map((profile) => {
      const own = products.filter((p) => p.sisterProfile === profile.id)
      const steps: Record<PipelineStepKey, boolean> = {
        intake: own.length > 0,
        sourcingCost: costs.some((c) => c.sisterProfile === profile.id),
        packingList: own.length > 0 && own.every((p) => p.packingListExportedAt || p.packingListSkipped),
        warehouseCost: wcs.some((wc) => wc.sisterProfile === profile.id),
      }
      return {
        profile,
        steps,
        packingSkippedOver: steps.packingList && own.length > 0 && own.every((p) => !p.packingListExportedAt),
      }
    })
  }, [profilesQuery.data, productsQuery.data, costsQuery.data, warehouseCostsQuery.data])

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.profile.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        return row.profile.poReference.toLowerCase().includes(q) || row.profile.buyerProfileName.toLowerCase().includes(q)
      }
      return true
    })
  }, [rows, statusFilter, search])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Sourcing Pipeline</h1>
        <p className="text-sm text-slate-500">
          Every order (Sister Profile) through the four steps: Intake → Sourcing Cost → Packing List (optional) → Warehouse Cost.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="w-full pl-9 sm:w-64" placeholder="Search PO or buyer..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SisterProfileStatus | "all")}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {profilesQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {rows.length === 0 ? "No Sister Profiles yet — create one first (Sister Profiles page)." : "No orders match your search."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">PO Reference</th>
                    <th className="px-4 py-3 font-medium">Buyer</th>
                    <th className="px-4 py-3 font-medium">Order Status</th>
                    <th className="px-4 py-3 font-medium">Pipeline Progress</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(({ profile, steps, packingSkippedOver }) => {
                    const doneCount = PIPELINE_STEP_ORDER.filter((k) => steps[k]).length
                    return (
                      <tr key={profile.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/pipeline/${profile.id}`)}>
                        <td className="px-4 py-3 font-medium text-slate-900">{profile.poReference || profile.referenceCode}</td>
                        <td className="px-4 py-3 text-slate-500">{profile.buyerProfileName}</td>
                        <td className="px-4 py-3"><Badge variant={STATUS_BADGE[profile.status]}>{profile.status}</Badge></td>
                        <td className="px-4 py-3">
                          <span className="mr-3 inline-flex items-center gap-1.5">
                            {PIPELINE_STEP_ORDER.map((key) => (
                              <span
                                key={key}
                                title={`${STEP_TITLES[key]} — ${steps[key] ? "done" : "pending"}`}
                                className={`h-2.5 w-2.5 rounded-full ${
                                  steps[key] ? (key === "packingList" && packingSkippedOver ? "bg-amber-400" : "bg-emerald-500") : "bg-slate-200"
                                }`}
                              />
                            ))}
                          </span>
                          <span className="text-xs text-slate-500">{doneCount}/4</span>
                        </td>
                        <td className="px-4 py-3 text-right"><ChevronRight className="ml-auto h-4 w-4 text-slate-300" /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

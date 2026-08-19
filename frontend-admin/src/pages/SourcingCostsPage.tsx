import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Eye, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { extractErrorMessage } from "@/lib/errors"
import { COST_STATUS_BADGE_VARIANT, COST_STATUS_LABEL } from "@/lib/status"
import { useAuthStore } from "@/lib/auth-store"
import type { Paginated } from "@/types/api"
import type { SisterProfile, SourcingCost, SourcingCostCreateInput, SourcingCostItemInput, Product, CustomCostField } from "@/types/sourcing"

const CAN_CREATE_ROLES = ["admin", "company_rep"]
const CAN_MANAGE_ROLES = ["admin"]

export function SourcingCostsPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SourcingCost | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const costsQuery = useQuery({
    queryKey: ["sourcing-costs", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SourcingCost>>("/sourcing-costs/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/sourcing-costs/${id}/`) },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sourcing-costs"] }); setDeleteTarget(null); setDeleteError(null) },
    onError: (err: unknown) => setDeleteError(extractErrorMessage(err)),
  })

  const canCreate = !!user && CAN_CREATE_ROLES.includes(user.role)
  const canManage = !!user && CAN_MANAGE_ROLES.includes(user.role)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sourcing Costs</h1>
          <p className="text-sm text-slate-500">Track sourcing costs per Sister Profile with product references and custom cost fields.</p>
        </div>
        {canCreate && (<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New Cost</Button>)}
      </div>
      <Card><CardContent className="p-0">
        {costsQuery.isLoading ? (<div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>) : (costsQuery.data?.length ?? 0) === 0 ? (<p className="py-10 text-center text-sm text-slate-400">No sourcing costs yet.</p>) : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2.5 font-medium">Sister Profile</th>
            <th className="px-4 py-2.5 font-medium">PO Reference</th>
            <th className="px-4 py-2.5 font-medium">Items</th>
            <th className="px-4 py-2.5 font-medium">Total Amount</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Created</th>
            <th className="px-4 py-2.5 font-medium" />
          </tr></thead><tbody>
            {costsQuery.data!.map((t) => (
              <tr key={t.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" onClick={() => navigate(`/sourcing-costs/${t.id}`)}>
                <td className="px-4 py-2.5 font-medium text-slate-900">{t.sisterProfileName}</td>
                <td className="px-4 py-2.5 text-slate-500">{t.poReference}</td>
                <td className="px-4 py-2.5 text-slate-500">{t.items.length}</td>
                <td className="px-4 py-2.5 text-slate-500">{Number(t.totalAmount || 0).toLocaleString()}</td>
                <td className="px-4 py-2.5"><Badge variant={COST_STATUS_BADGE_VARIANT[t.status]}>{COST_STATUS_LABEL[t.status]}</Badge></td>
                <td className="px-4 py-2.5 text-slate-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-2.5"><div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" title="View" onClick={(e) => { e.stopPropagation(); navigate(`/sourcing-costs/${t.id}`) }}><Eye className="h-3.5 w-3.5" /></Button>
                  {canManage && t.status === "open" && (<Button size="sm" variant="ghost" title="Delete" onClick={(e) => { e.stopPropagation(); setDeleteTarget(t) }}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>)}
                </div></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </CardContent></Card>

      {deleteTarget && (
        <Dialog open onClose={() => { setDeleteTarget(null); setDeleteError(null) }} title="Delete Sourcing Cost">
          <div className="flex flex-col gap-3">
            {deleteError && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{deleteError}</div>}
            <p className="text-sm text-slate-600">Are you sure you want to delete this sourcing cost for <strong>{deleteTarget.poReference}</strong>? All items will be refunded from the buyer&apos;s wallet.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setDeleteTarget(null); setDeleteError(null) }}>Cancel</Button>
              <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteTarget.id)}>{deleteMutation.isPending ? "Deleting..." : "Delete"}</Button>
            </div>
          </div>
        </Dialog>
      )}

      {createOpen && <CreateCostDialog onClose={() => setCreateOpen(false)} />}
    </div>
  )
}

function productOptionLabel(p: Product) {
  return `${p.name} (${p.styleNumber}) — PO ${p.poNo} · Brand ${p.brandName}`
}

function CreateCostDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [sisterProfile, setSisterProfile] = useState("")
  const [items, setItems] = useState<SourcingCostItemInput[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)

  const sisterProfilesQuery = useQuery({
    queryKey: ["sister-profiles", "list"],
    queryFn: async () => { const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 500 } }); return data.results },
  })

  const productsQuery = useQuery({
    queryKey: ["products", "by-sister", sisterProfile],
    queryFn: async () => { const { data } = await api.get<Paginated<Product>>("/products/", { params: { sister_profile: sisterProfile, page_size: 500 } }); return data.results },
    enabled: !!sisterProfile,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: SourcingCostCreateInput = { sisterProfile, items: items.map((it) => ({ ...it, customCostFields: it.customCostFields.filter((cf) => cf.name.trim() !== ""), date: new Date(it.date).toISOString() })) }
      const { data } = await api.post<SourcingCost>("/sourcing-costs/", payload); return data
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sourcing-costs"] }); onClose() },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  const updateItem = (idx: number, patch: Partial<SourcingCostItemInput>) => setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  const removeItem = (idx: number) => setItems((rows) => rows.filter((_, i) => i !== idx))
  const updateCustomCost = (itemIdx: number, cfIdx: number, patch: Partial<CustomCostField>) => setItems((rows) => rows.map((r, i) => i === itemIdx ? { ...r, customCostFields: r.customCostFields.map((cf, j) => (j === cfIdx ? { ...cf, ...patch } : cf)) } : r))
  const addCustomCost = (itemIdx: number) => setItems((rows) => rows.map((r, i) => i === itemIdx ? { ...r, customCostFields: [...r.customCostFields, emptyCustomCost()] } : r))
  const removeCustomCost = (itemIdx: number, cfIdx: number) => setItems((rows) => rows.map((r, i) => i === itemIdx ? { ...r, customCostFields: r.customCostFields.filter((_, j) => j !== cfIdx) } : r))

  return (
    <Dialog open onClose={onClose} title="New Sourcing Cost">
      <form onSubmit={(e) => { e.preventDefault(); setError(null); if (!sisterProfile) { setError("Sister Profile is required."); return } if (items.length === 0) { setError("At least one item is required."); return } if (items.some((it) => !it.product || !it.locationName.trim())) { setError("Each item needs a product and a location."); return } createMutation.mutate() }} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">Sister Profile *</label>
          <Select className="h-9" value={sisterProfile} onChange={(e) => setSisterProfile(e.target.value)}>
            <option value="">Select sister profile...</option>
            {(sisterProfilesQuery.data ?? []).map((sp) => (<option key={sp.id} value={sp.id}>{sp.buyerProfileName} — {sp.poReference}</option>))}
          </Select>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between"><label className="text-xs font-medium text-slate-600">Items ({items.length})</label><Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={() => setItems((rows) => [...rows, emptyItem()])}><Plus className="h-3 w-3" />Add Item</Button></div>
          {items.map((item, idx) => (
            <div key={idx} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-700">Item {idx + 1}</span>{items.length > 1 && (<button type="button" onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>)}</div>
              <Select className="h-8 text-sm" value={item.product} onChange={(e) => updateItem(idx, { product: e.target.value })}>
                <option value="">Select product...</option>
                {(productsQuery.data ?? []).map((p) => (<option key={p.id} value={p.id}>{productOptionLabel(p)}</option>))}
              </Select>
              <div className="grid grid-cols-3 gap-2">
                <Input className="h-8 text-sm" placeholder="Location *" value={item.locationName} onChange={(e) => updateItem(idx, { locationName: e.target.value })} />
                <Input className="h-8 text-sm" type="number" min={0} placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                <Input className="h-8 text-sm" type="datetime-local" value={item.date} onChange={(e) => updateItem(idx, { date: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between"><span className="text-xs text-slate-500">Custom Costs</span><Button type="button" variant="outline" size="sm" className="h-5 px-1.5 text-[11px]" onClick={() => addCustomCost(idx)}><Plus className="h-2.5 w-2.5" />Add</Button></div>
                {item.customCostFields.map((cf, cfIdx) => (
                  <div key={cfIdx} className="flex gap-2">
                    <Input className="h-7 text-xs" placeholder="Cost name" value={cf.name} onChange={(e) => updateCustomCost(idx, cfIdx, { name: e.target.value })} />
                    <Input className="h-7 w-24 text-xs" type="number" min={0} step="0.01" value={cf.amount} onChange={(e) => updateCustomCost(idx, cfIdx, { amount: Number(e.target.value) })} />
                    {item.customCostFields.length > 1 && (<button type="button" onClick={() => removeCustomCost(idx, cfIdx)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Cost"}</Button></div>
      </form>
    </Dialog>
  )
}

function emptyCustomCost(): CustomCostField { return { name: "", amount: 0 } }

function emptyItem(): SourcingCostItemInput { return { product: "", locationName: "", quantity: 0, customCostFields: [emptyCustomCost()], date: new Date().toISOString().slice(0, 16) } }

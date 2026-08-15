import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react"
import { useState, type Dispatch, type SetStateAction } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { extractErrorMessage } from "@/lib/errors"
import { COST_STATUS_BADGE_VARIANT, COST_STATUS_LABEL } from "@/lib/status"
import type { Paginated } from "@/types/api"
import type { SourcingCost, SourcingCostItem, SourcingCostItemInput, Product, CustomCostField } from "@/types/sourcing"

const CAN_MANAGE_ROLES = ["admin", "company_rep"]

export function SourcingCostDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<SourcingCostItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SourcingCostItem | null>(null)
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)

  const costQuery = useQuery({
    queryKey: ["sourcing-costs", id],
    queryFn: async () => { const { data } = await api.get<SourcingCost>(`/sourcing-costs/${id}/`); return data },
    enabled: !!id,
  })

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => { await api.delete(`/sourcing-costs/${id}/items/${itemId}/`) },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sourcing-costs"] }); setDeleteTarget(null); setActionError(null) },
    onError: (err: unknown) => setActionError(extractErrorMessage(err)),
  })

  const closeMutation = useMutation({
    mutationFn: async () => { const { data } = await api.post<SourcingCost>(`/sourcing-costs/${id}/close/`); return data },
    onSuccess: (data) => { queryClient.setQueryData(["sourcing-costs", id], data); queryClient.invalidateQueries({ queryKey: ["sourcing-costs"] }); setActionError(null); setCloseConfirmOpen(false) },
    onError: (err: unknown) => setActionError(extractErrorMessage(err)),
  })

  if (costQuery.isLoading) return (<div className="flex justify-center py-16"><Spinner className="text-slate-400" /></div>)
  if (!costQuery.data) return <p className="py-16 text-center text-sm text-slate-400">Sourcing cost not found.</p>

  const cost = costQuery.data
  const canManage = !!user && CAN_MANAGE_ROLES.includes(user.role)
  const isOpen = cost.status === "open"
  const totalAmount = cost.items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/sourcing-costs")}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2"><h1 className="text-xl font-semibold text-slate-900">{cost.poReference}</h1><Badge variant={COST_STATUS_BADGE_VARIANT[cost.status]}>{COST_STATUS_LABEL[cost.status]}</Badge></div>
          <p className="text-sm text-slate-500">{cost.sisterProfileName} · Total: {totalAmount.toLocaleString()}</p>
          {cost.fullPaymentConfirmedAt && (<p className="text-sm text-slate-500">Confirmed {new Date(cost.fullPaymentConfirmedAt).toLocaleString()}</p>)}
        </div>
        {canManage && isOpen && (<><Button variant="outline" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />Add Item</Button><Button onClick={() => setCloseConfirmOpen(true)} disabled={closeMutation.isPending}>{closeMutation.isPending ? "Closing..." : "Close Cost"}</Button></>)}
      </div>
      {actionError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>}
      <Card><CardHeader><CardTitle>Items ({cost.items.length})</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead>
        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400"><th className="px-4 py-2 font-medium">Product</th><th className="px-4 py-2 font-medium">Location</th><th className="px-4 py-2 font-medium">Qty</th><th className="px-4 py-2 font-medium">Custom Costs</th><th className="px-4 py-2 font-medium">Total</th><th className="px-4 py-2 font-medium">Date</th>{canManage && isOpen && <th className="px-4 py-2 font-medium" />}</tr>
      </thead><tbody>
        {cost.items.map((item) => (
          <tr key={item.id} className="border-b border-slate-100 last:border-0">
            <td className="px-4 py-2"><div className="font-medium text-slate-900">{item.productName}</div><div className="text-xs text-slate-400">{item.styleNumber} · {item.poNo} · {item.brandName}</div></td>
            <td className="px-4 py-2 text-slate-500">{item.locationName}</td>
            <td className="px-4 py-2 text-slate-500">{item.quantity}</td>
            <td className="px-4 py-2"><div className="flex flex-wrap gap-1">{(item.customCostFields || []).map((cf, i) => (<Badge key={i} variant="info" className="text-xs">{cf.name}: {Number(cf.amount).toLocaleString()}</Badge>))}</div></td>
            <td className="px-4 py-2 font-medium text-slate-900">{Number(item.totalAmount || 0).toLocaleString()}</td>
            <td className="px-4 py-2 text-slate-500">{new Date(item.date).toLocaleDateString()}</td>
            {canManage && isOpen && (<td className="px-4 py-2"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" title="Edit item" onClick={() => setEditTarget(item)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" title="Delete item" onClick={() => setDeleteTarget(item)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button></div></td>)}
          </tr>
        ))}
      </tbody></table></div></CardContent></Card>

      {deleteTarget && (<Dialog open onClose={() => { setDeleteTarget(null); setActionError(null) }} title="Delete Item"><div className="flex flex-col gap-3">{actionError && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}<p className="text-sm text-slate-600">Delete <strong>{deleteTarget.productName}</strong> at {deleteTarget.locationName}? The wallet will be refunded.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setDeleteTarget(null); setActionError(null) }}>Cancel</Button><Button variant="destructive" disabled={deleteItemMutation.isPending} onClick={() => deleteItemMutation.mutate(deleteTarget.id)}>{deleteItemMutation.isPending ? "Deleting..." : "Delete"}</Button></div></div></Dialog>)}

      {closeConfirmOpen && (<Dialog open onClose={() => { setCloseConfirmOpen(false); setActionError(null) }} title="Close Sourcing Cost"><div className="flex flex-col gap-3">{actionError && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}<p className="text-sm text-slate-600">Close this sourcing cost for <strong>{cost.poReference}</strong>?</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setCloseConfirmOpen(false); setActionError(null) }}>Cancel</Button><Button disabled={closeMutation.isPending} onClick={() => closeMutation.mutate()}>{closeMutation.isPending ? "Closing..." : "Close Cost"}</Button></div></div></Dialog>)}

      {addOpen && <AddItemDialog costId={id!} onClose={() => setAddOpen(false)} />}
      {editTarget && <EditItemDialog costId={id!} item={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  )
}

function useCostProducts(costId: string) {
  const costQuery = useQuery({
    queryKey: ["sourcing-costs", costId],
    queryFn: async () => { const { data } = await api.get<SourcingCost>(`/sourcing-costs/${costId}/`); return data },
  })
  return useQuery({
    queryKey: ["products", "by-sister", costQuery.data?.sisterProfile ?? ""],
    queryFn: async () => { const { data } = await api.get<Paginated<Product>>("/products/", { params: { sister_profile: costQuery.data?.sisterProfile, page_size: 500 } }); return data.results },
    enabled: !!costQuery.data?.sisterProfile,
  })
}

function productOptionLabel(p: Product) {
  return `${p.name} (${p.styleNumber}) — PO ${p.poNo} · Brand ${p.brandName}`
}

function ItemFormFields({ form, setForm, products }: { form: SourcingCostItemInput; setForm: Dispatch<SetStateAction<SourcingCostItemInput>>; products?: Product[] }) {
  const updateCustomCost = (idx: number, patch: Partial<CustomCostField>) => setForm((f) => ({ ...f, customCostFields: f.customCostFields.map((cf, i) => (i === idx ? { ...cf, ...patch } : cf)) }))
  const addCustomCost = () => setForm((f) => ({ ...f, customCostFields: [...f.customCostFields, emptyCustomCost()] }))
  const removeCustomCost = (idx: number) => setForm((f) => ({ ...f, customCostFields: f.customCostFields.filter((_, i) => i !== idx) }))

  return (
    <>
      <div className="flex flex-col gap-1.5"><label className="text-xs font-medium text-slate-600">Product *</label><Select className="h-9" value={form.product} onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}><option value="">Select product...</option>{(products ?? []).map((p) => (<option key={p.id} value={p.id}>{productOptionLabel(p)}</option>))}</Select></div>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5"><label className="text-xs font-medium text-slate-600">Location *</label><Input value={form.locationName} onChange={(e) => setForm((f) => ({ ...f, locationName: e.target.value }))} required /></div>
        <div className="flex flex-col gap-1.5"><label className="text-xs font-medium text-slate-600">Quantity</label><Input type="number" min={0} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))} /></div>
        <div className="flex flex-col gap-1.5"><label className="text-xs font-medium text-slate-600">Date</label><Input type="datetime-local" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between"><label className="text-xs font-medium text-slate-600">Custom Cost Fields</label><Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={addCustomCost}><Plus className="h-3 w-3" />Add Cost</Button></div>
        <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-500"><th className="px-2 py-1.5 font-medium">Name</th><th className="px-2 py-1.5 font-medium">Amount</th><th className="w-8" /></tr></thead><tbody>
          {form.customCostFields.map((cf, idx) => (<tr key={idx} className="border-b border-slate-100 last:border-0"><td className="p-1"><Input className="h-7 text-xs" value={cf.name} onChange={(e) => updateCustomCost(idx, { name: e.target.value })} placeholder="e.g. Transport" /></td><td className="p-1"><Input className="h-7 w-24 text-xs" type="number" min={0} step="0.01" value={cf.amount} onChange={(e) => updateCustomCost(idx, { amount: Number(e.target.value) })} /></td><td className="p-1 text-center">{form.customCostFields.length > 1 && (<button type="button" onClick={() => removeCustomCost(idx)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>)}</td></tr>))}
        </tbody></table></div>
      </div>
    </>
  )
}

function AddItemDialog({ costId, onClose }: { costId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<SourcingCostItemInput>(emptyItemInput())
  const [error, setError] = useState<string | null>(null)
  const productsQuery = useCostProducts(costId)

  const addMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/sourcing-costs/${costId}/items/`, { ...form, customCostFields: form.customCostFields.filter((cf) => cf.name.trim() !== ""), date: new Date(form.date).toISOString() })
      return data
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sourcing-costs"] }); onClose() },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  return (
    <Dialog open onClose={onClose} title="Add Item">
      <form onSubmit={(e) => { e.preventDefault(); setError(null); if (!form.product) { setError("Product is required."); return } if (!form.locationName.trim()) { setError("Location name is required."); return } addMutation.mutate() }} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <ItemFormFields form={form} setForm={setForm} products={productsQuery.data} />
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={addMutation.isPending}>{addMutation.isPending ? "Adding..." : "Add Item"}</Button></div>
      </form>
    </Dialog>
  )
}

function EditItemDialog({ costId, item, onClose }: { costId: string; item: SourcingCostItem; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<SourcingCostItemInput>({
    product: item.product,
    locationName: item.locationName,
    quantity: item.quantity,
    customCostFields: (item.customCostFields || []).length > 0
      ? (item.customCostFields || []).map((cf) => ({ name: cf.name, amount: Number(cf.amount) }))
      : [emptyCustomCost()],
    date: toLocalDateTimeInput(item.date),
  })
  const [error, setError] = useState<string | null>(null)
  const productsQuery = useCostProducts(costId)

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.put(`/sourcing-costs/${costId}/items/${item.id}/`, { ...form, customCostFields: form.customCostFields.filter((cf) => cf.name.trim() !== ""), date: new Date(form.date).toISOString() })
      return data
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sourcing-costs"] }); onClose() },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  return (
    <Dialog open onClose={onClose} title="Edit Item">
      <form onSubmit={(e) => { e.preventDefault(); setError(null); if (!form.product) { setError("Product is required."); return } if (!form.locationName.trim()) { setError("Location name is required."); return } updateMutation.mutate() }} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <ItemFormFields form={form} setForm={setForm} products={productsQuery.data} />
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving..." : "Save Changes"}</Button></div>
      </form>
    </Dialog>
  )
}

function emptyCustomCost(): CustomCostField { return { name: "", amount: 0 } }

function emptyItemInput(): SourcingCostItemInput { return { product: "", locationName: "", quantity: 0, customCostFields: [emptyCustomCost()], date: new Date().toISOString().slice(0, 16) } }

function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

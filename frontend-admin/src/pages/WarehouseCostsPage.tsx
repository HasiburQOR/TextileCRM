import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Eye, Pencil, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { extractErrorMessage } from "@/lib/errors"
import type { Paginated } from "@/types/api"
import type { PackingList } from "@/types/packing"
import type { SisterProfile } from "@/types/sourcing"
import type { WarehouseCost, WarehouseCostCustomCost } from "@/types/warehouse"

const PACKAGING_ITEMS: { field: keyof typeof EMPTY_PACKAGING; label: string }[] = [
  { field: "labelsCost", label: "Labels" },
  { field: "htakeCost", label: "Hangtags" },
  { field: "stickersCost", label: "Stickers" },
  { field: "cartonsCost", label: "Cartons" },
  { field: "polyBagsCost", label: "Poly Bags" },
  { field: "gamtapeCost", label: "Gum Tape" },
]

const EMPTY_PACKAGING = {
  labelsCost: 0, htakeCost: 0, stickersCost: 0, cartonsCost: 0, polyBagsCost: 0, gamtapeCost: 0,
}

const CAN_CREATE_ROLES = ["admin", "warehouse"]
const CAN_MANAGE_ROLES = ["admin"]

export function WarehouseCostsPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [viewTarget, setViewTarget] = useState<WarehouseCost | null>(null)
  const [editTarget, setEditTarget] = useState<WarehouseCost | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WarehouseCost | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const costsQuery = useQuery({
    queryKey: ["warehouse-costs", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<WarehouseCost>>("/warehouse-costs/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/warehouse-costs/${id}/`) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-costs"] })
      queryClient.invalidateQueries({ queryKey: ["expenses"] })
      setDeleteTarget(null)
      setDeleteError(null)
    },
    onError: (err: unknown) => setDeleteError(extractErrorMessage(err)),
  })

  const canCreate = !!user && CAN_CREATE_ROLES.includes(user.role)
  const canManage = !!user && CAN_MANAGE_ROLES.includes(user.role)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Warehouse Costs</h1>
          <p className="text-sm text-slate-500">Loading, packaging, and extra costs per shipment — recorded against a Sister Profile and, optionally, one of its Packing Lists.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New Warehouse Cost</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {costsQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : !costsQuery.data?.length ? (
            <p className="py-10 text-center text-sm text-slate-400">No warehouse costs recorded yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Sister Profile</th>
                  <th className="px-4 py-3 font-medium">Packing List</th>
                  <th className="px-4 py-3 font-medium">Loader</th>
                  <th className="px-4 py-3 font-medium">Total Cost</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {costsQuery.data.map((wc) => (
                  <tr key={wc.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{wc.sisterProfilePoReference || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{wc.packingListReferenceCode || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{Number(wc.loaderCost).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{Number(wc.totalCost).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(wc.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" title="View" onClick={() => setViewTarget(wc)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canManage && (
                          <>
                            <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditTarget(wc)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm" variant="ghost" title="Delete" className="text-red-500 hover:text-red-700"
                              onClick={() => { setDeleteError(null); setDeleteTarget(wc) }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <WarehouseCostFormDialog
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["warehouse-costs"] }); queryClient.invalidateQueries({ queryKey: ["expenses"] }); setCreateOpen(false) }}
        />
      )}

      {editTarget && (
        <WarehouseCostFormDialog
          existing={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["warehouse-costs"] }); queryClient.invalidateQueries({ queryKey: ["expenses"] }); setEditTarget(null) }}
        />
      )}

      {viewTarget && (
        <Dialog open onClose={() => setViewTarget(null)} title={`Warehouse Cost — ${viewTarget.sisterProfilePoReference || viewTarget.id}`}>
          <div className="flex flex-col gap-3 text-sm">
            <Field label="Sister Profile" value={viewTarget.sisterProfilePoReference || "—"} />
            <Field label="Packing List" value={viewTarget.packingListReferenceCode || "—"} />
            <Field label="Loader Cost" value={Number(viewTarget.loaderCost).toLocaleString()} />
            <Field label="Extra Worker Cost" value={Number(viewTarget.extraWorkerCost).toLocaleString()} />
            {PACKAGING_ITEMS.filter((item) => Number(viewTarget[item.field]) > 0).map((item) => (
              <Field key={item.field} label={item.label} value={Number(viewTarget[item.field]).toLocaleString()} />
            ))}
            {viewTarget.customCosts.length > 0 && (
              <div>
                <span className="text-xs font-medium text-slate-500">Custom Cost Fields</span>
                <div className="mt-1 flex flex-col gap-1">
                  {viewTarget.customCosts.map((c, i) => (
                    <div key={i} className="text-slate-800">{c.fieldName}: {Number(c.amount).toLocaleString()} {c.remarks && <span className="text-slate-400">({c.remarks})</span>}</div>
                  ))}
                </div>
              </div>
            )}
            {Number(viewTarget.extraCost) > 0 && (
              <Field label="Extra Cost" value={`${Number(viewTarget.extraCost).toLocaleString()}${viewTarget.extraCostRemarks ? ` (${viewTarget.extraCostRemarks})` : ""}`} />
            )}
            <Field label="Total Cost" value={Number(viewTarget.totalCost).toLocaleString()} />
            <Field label="Created" value={new Date(viewTarget.createdAt).toLocaleString()} />
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setViewTarget(null)}>Close</Button>
            </div>
          </div>
        </Dialog>
      )}

      {deleteTarget && (
        <Dialog open onClose={() => setDeleteTarget(null)} title="Delete this warehouse cost?">
          <div className="flex flex-col gap-4">
            {deleteError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</div>}
            <p className="text-sm text-slate-600">
              This removes the warehouse cost and its lines from the Central Expense Table. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteTarget.id)}>
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-slate-800">{value}</span>
    </div>
  )
}

function WarehouseCostFormDialog({ existing, onClose, onSuccess }: {
  existing?: WarehouseCost; onClose: () => void; onSuccess: () => void
}) {
  const isEdit = !!existing
  const [sisterProfile, setSisterProfile] = useState(existing?.sisterProfile ?? "")
  const [packingList, setPackingList] = useState(existing?.packingList ?? "")
  const [loaderCost, setLoaderCost] = useState(Number(existing?.loaderCost ?? 0))
  const [extraWorkerCost, setExtraWorkerCost] = useState(Number(existing?.extraWorkerCost ?? 0))
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const item of PACKAGING_ITEMS) init[item.field] = Number(existing?.[item.field] ?? 0) > 0
    return init
  })
  const [amounts, setAmounts] = useState(() => {
    const init = { ...EMPTY_PACKAGING }
    for (const item of PACKAGING_ITEMS) init[item.field] = Number(existing?.[item.field] ?? 0)
    return init
  })
  const [customCosts, setCustomCosts] = useState<WarehouseCostCustomCost[]>(
    existing?.customCosts.map((c) => ({ fieldName: c.fieldName, amount: c.amount, remarks: c.remarks ?? "" })) ?? [],
  )
  const [extraCost, setExtraCost] = useState(Number(existing?.extraCost ?? 0))
  const [extraCostRemarks, setExtraCostRemarks] = useState(existing?.extraCostRemarks ?? "")
  const [error, setError] = useState<string | null>(null)

  const profilesQuery = useQuery({
    queryKey: ["sister-profiles", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 200 } }); return data.results },
    enabled: !isEdit,
  })
  const packingListsQuery = useQuery({
    queryKey: ["packing-lists", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<PackingList>>("/packing-lists/", { params: { page_size: 200 } }); return data.results },
    enabled: !isEdit,
  })
  const listsForProfile = useMemo(
    () => (packingListsQuery.data ?? []).filter((pl) => pl.sisterProfile === sisterProfile),
    [packingListsQuery.data, sisterProfile],
  )

  const packagingTotal = PACKAGING_ITEMS.reduce((sum, item) => sum + (checked[item.field] ? amounts[item.field] : 0), 0)
  const customTotal = customCosts.reduce((sum, c) => sum + (c.amount || 0), 0)
  const total = loaderCost + extraWorkerCost + packagingTotal + customTotal + extraCost

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { loaderCost, extraWorkerCost, extraCost, extraCostRemarks }
      if (!isEdit) {
        payload.sisterProfile = sisterProfile
        payload.packingList = packingList || null
      }
      for (const item of PACKAGING_ITEMS) payload[item.field] = checked[item.field] ? amounts[item.field] : 0
      payload.customCosts = customCosts.filter((c) => c.fieldName.trim()).map((c) => ({ fieldName: c.fieldName, amount: c.amount, remarks: c.remarks }))
      if (isEdit) {
        const { data } = await api.patch(`/warehouse-costs/${existing!.id}/`, payload)
        return data
      }
      const { data } = await api.post("/warehouse-costs/", payload)
      return data
    },
    onSuccess,
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isEdit && !sisterProfile) { setError("Select a Sister Profile."); return }
    setError(null)
    mutation.mutate()
  }

  function addCustomCost() {
    setCustomCosts((prev) => [...prev, { fieldName: "", amount: 0, remarks: "" }])
  }
  function updateCustomCost(i: number, patch: Partial<WarehouseCostCustomCost>) {
    setCustomCosts((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }
  function removeCustomCost(i: number) {
    setCustomCosts((prev) => prev.filter((_, idx) => idx !== i))
  }

  return (
    <Dialog open onClose={onClose} title={isEdit ? `Edit Warehouse Cost — ${existing!.sisterProfilePoReference || existing!.id}` : "New Warehouse Cost"} className="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {isEdit ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sister Profile" value={existing!.sisterProfilePoReference || "—"} />
            <Field label="Packing List" value={existing!.packingListReferenceCode || "—"} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Sister Profile *</label>
              <Select required value={sisterProfile} onChange={(e) => { setSisterProfile(e.target.value); setPackingList("") }}>
                <option value="">Select...</option>
                {profilesQuery.data?.map((sp) => (<option key={sp.id} value={sp.id}>{sp.poReference || sp.id} — {sp.buyerProfileName}</option>))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Packing List (optional)</label>
              <Select value={packingList} onChange={(e) => setPackingList(e.target.value)} disabled={!sisterProfile}>
                <option value="">None — against the Sister Profile generally</option>
                {listsForProfile.map((pl) => (
                  <option key={pl.id} value={pl.id}>{pl.referenceCode} — {pl.poNo || "no PO"} ({pl.brandName || "no brand"})</option>
                ))}
              </Select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Loader Cost *</label>
            <Input required type="number" min={0} step="0.01" value={loaderCost} onChange={(e) => setLoaderCost(Number(e.target.value))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Extra Worker Cost</label>
            <Input type="number" min={0} step="0.01" value={extraWorkerCost} onChange={(e) => setExtraWorkerCost(Number(e.target.value))} />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-slate-600">Packaging</label>
          <div className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
            {PACKAGING_ITEMS.map((item) => (
              <div key={item.field} className="flex items-center gap-3">
                <label className="flex w-32 items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!checked[item.field]}
                    onChange={(e) => setChecked((prev) => ({ ...prev, [item.field]: e.target.checked }))}
                  />
                  {item.label}
                </label>
                {checked[item.field] && (
                  <Input
                    className="h-8 w-32"
                    type="number" min={0} step="0.01"
                    value={amounts[item.field]}
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [item.field]: Number(e.target.value) }))}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-600">Custom Cost Fields</label>
            <Button type="button" size="sm" variant="outline" onClick={addCustomCost}><Plus className="h-3.5 w-3.5" /> Add Custom Cost Field</Button>
          </div>
          {customCosts.length > 0 && (
            <div className="flex flex-col gap-2">
              {customCosts.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input className="h-8" placeholder="Field name" value={c.fieldName} onChange={(e) => updateCustomCost(i, { fieldName: e.target.value })} />
                  <Input className="h-8 w-28" type="number" min={0} step="0.01" placeholder="Amount" value={c.amount} onChange={(e) => updateCustomCost(i, { amount: Number(e.target.value) })} />
                  <Input className="h-8" placeholder="Remarks (optional)" value={c.remarks} onChange={(e) => updateCustomCost(i, { remarks: e.target.value })} />
                  <button type="button" onClick={() => removeCustomCost(i)} className="shrink-0 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-slate-600">Extra Cost</label>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 p-3">
            <Input className="h-8 w-28" type="number" min={0} step="0.01" placeholder="Amount" value={extraCost} onChange={(e) => setExtraCost(Number(e.target.value))} />
            <Input className="h-8" placeholder="Remarks (optional)" value={extraCostRemarks} onChange={(e) => setExtraCostRemarks(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-600">Running Total</span>
          <span className="text-lg font-semibold text-slate-900">{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Submit Warehouse Cost"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Eye, Pencil, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
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
import type { Product } from "@/types/sourcing"

type TravelMode = "travelling_with_goods" | "travelling_individually"

interface QCReport {
  id: string; product: string; productName: string; reportId: string
  lunchCostFlag: boolean; lunchCost: string; goodsCarryingCost: string
  travelMode: TravelMode; extraCost: string; totalCost: string
  hasWarehouseCost: boolean; createdAt: string
}

const CAN_CREATE_ROLES = ["admin", "qc"]
const CAN_MANAGE_ROLES = ["admin"]

export function QCCostsPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [viewTarget, setViewTarget] = useState<QCReport | null>(null)
  const [editTarget, setEditTarget] = useState<QCReport | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<QCReport | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const reportsQuery = useQuery({
    queryKey: ["qc-reports", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<QCReport>>("/qc-reports/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/qc-reports/${id}/`) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qc-reports"] })
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
          <h1 className="text-xl font-semibold text-slate-900">QC Costs</h1>
          <p className="text-sm text-slate-500">Lunch, goods carrying, and travel cost reports for approved products.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New QC Report</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {reportsQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : !reportsQuery.data?.length ? (
            <p className="py-10 text-center text-sm text-slate-400">No QC reports yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Report ID</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Travel Mode</th>
                  <th className="px-4 py-3 font-medium">Total Cost</th>
                  <th className="px-4 py-3 font-medium">Warehouse Costs</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportsQuery.data.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.reportId}</td>
                    <td className="px-4 py-3 text-slate-500">{r.productName}</td>
                    <td className="px-4 py-3 text-slate-500">{r.travelMode === "travelling_individually" ? "Individually" : "With Goods"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{Number(r.totalCost).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Badge variant={r.hasWarehouseCost ? "success" : "warning"}>{r.hasWarehouseCost ? "Recorded" : "Pending"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" title="View" onClick={() => setViewTarget(r)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canManage && (
                          <>
                            <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditTarget(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm" variant="ghost" title="Delete" className="text-red-500 hover:text-red-700"
                              onClick={() => { setDeleteError(null); setDeleteTarget(r) }}
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
        <QCReportFormDialog
          existingReports={reportsQuery.data ?? []}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["qc-reports"] }); queryClient.invalidateQueries({ queryKey: ["expenses"] }); setCreateOpen(false) }}
        />
      )}

      {editTarget && (
        <QCReportFormDialog
          existing={editTarget}
          existingReports={reportsQuery.data ?? []}
          onClose={() => setEditTarget(null)}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["qc-reports"] }); queryClient.invalidateQueries({ queryKey: ["expenses"] }); setEditTarget(null) }}
        />
      )}

      {viewTarget && (
        <Dialog open onClose={() => setViewTarget(null)} title={`QC Report — ${viewTarget.reportId}`}>
          <div className="flex flex-col gap-3 text-sm">
            <Field label="Product" value={viewTarget.productName} />
            <Field label="Lunch Cost" value={viewTarget.lunchCostFlag ? Number(viewTarget.lunchCost).toLocaleString() : "Not applicable"} />
            <Field label="Goods Carrying Cost" value={Number(viewTarget.goodsCarryingCost).toLocaleString()} />
            <Field label="Travel Mode" value={viewTarget.travelMode === "travelling_individually" ? "Individually" : "With Goods"} />
            {viewTarget.travelMode === "travelling_individually" && (
              <Field label="Travel Extra Cost" value={Number(viewTarget.extraCost).toLocaleString()} />
            )}
            <Field label="Total Cost" value={Number(viewTarget.totalCost).toLocaleString()} />
            <Field label="Warehouse Costs" value={viewTarget.hasWarehouseCost ? "Recorded" : "Pending"} />
            <Field label="Created" value={new Date(viewTarget.createdAt).toLocaleString()} />
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setViewTarget(null)}>Close</Button>
            </div>
          </div>
        </Dialog>
      )}

      {deleteTarget && (
        <Dialog open onClose={() => setDeleteTarget(null)} title={`Delete "${deleteTarget.reportId}"?`}>
          <div className="flex flex-col gap-4">
            {deleteError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</div>}
            <p className="text-sm text-slate-600">
              This removes the report and its cost lines from the Central Expense Table. This cannot be undone.
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

function QCReportFormDialog({ existing, existingReports, onClose, onSuccess }: {
  existing?: QCReport; existingReports: QCReport[]; onClose: () => void; onSuccess: () => void
}) {
  const isEdit = !!existing
  const [product, setProduct] = useState(existing?.product ?? "")
  const [lunchCostFlag, setLunchCostFlag] = useState(existing?.lunchCostFlag ?? false)
  const [lunchCost, setLunchCost] = useState(Number(existing?.lunchCost ?? 0))
  const [goodsCarryingCost, setGoodsCarryingCost] = useState(Number(existing?.goodsCarryingCost ?? 0))
  const [travelMode, setTravelMode] = useState<TravelMode>(existing?.travelMode ?? "travelling_with_goods")
  const [extraCost, setExtraCost] = useState(Number(existing?.extraCost ?? 0))
  const [error, setError] = useState<string | null>(null)

  const productsQuery = useQuery({
    queryKey: ["products", "approved-for-qc"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>("/products/", { params: { status: "approved_for_qc", page_size: 200 } })
      return data.results
    },
    enabled: !isEdit,
  })

  const reportedProductIds = useMemo(() => new Set(existingReports.map((r) => r.product)), [existingReports])
  const eligibleProducts = useMemo(
    () => (productsQuery.data ?? []).filter((p) => !reportedProductIds.has(p.id)),
    [productsQuery.data, reportedProductIds],
  )

  const total = (lunchCostFlag ? lunchCost : 0) + goodsCarryingCost + (travelMode === "travelling_individually" ? extraCost : 0)

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = { product, lunchCostFlag, lunchCost, goodsCarryingCost, travelMode, extraCost }
      if (isEdit) {
        const { data } = await api.patch(`/qc-reports/${existing!.id}/`, payload)
        return data
      }
      const { data } = await api.post("/qc-reports/", payload)
      return data
    },
    onSuccess,
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isEdit && !product) { setError("Select a product."); return }
    setError(null)
    mutation.mutate()
  }

  return (
    <Dialog open onClose={onClose} title={isEdit ? `Edit QC Report — ${existing!.reportId}` : "New QC Report"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {isEdit ? (
          <Field label="Product" value={existing!.productName} />
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Product (Approved for QC) *</label>
            <Select required value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="">Select product...</option>
              {eligibleProducts.map((p) => (<option key={p.id} value={p.id}>{p.styleNumber} — {p.name}</option>))}
            </Select>
            {productsQuery.data && eligibleProducts.length === 0 && (
              <p className="mt-1 text-xs text-slate-400">No products awaiting a QC report.</p>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={lunchCostFlag} onChange={(e) => setLunchCostFlag(e.target.checked)} />
          Lunch Cost Applicable
        </label>
        {lunchCostFlag && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Lunch Cost Amount *</label>
            <Input required type="number" min={0} step="0.01" value={lunchCost} onChange={(e) => setLunchCost(Number(e.target.value))} />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Goods Carrying Cost *</label>
          <Input required type="number" min={0} step="0.01" value={goodsCarryingCost} onChange={(e) => setGoodsCarryingCost(Number(e.target.value))} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Travel Mode *</label>
          <Select value={travelMode} onChange={(e) => setTravelMode(e.target.value as TravelMode)}>
            <option value="travelling_with_goods">Travelling with Goods</option>
            <option value="travelling_individually">Travelling Individually</option>
          </Select>
        </div>
        {travelMode === "travelling_individually" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Travel Extra Cost *</label>
            <Input required type="number" min={0} step="0.01" value={extraCost} onChange={(e) => setExtraCost(Number(e.target.value))} />
          </div>
        )}

        <div className="flex items-center justify-between rounded-md bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-600">Report Total</span>
          <span className="text-lg font-semibold text-slate-900">{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Submit QC Report"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

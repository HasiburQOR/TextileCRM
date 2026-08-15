import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Eye, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
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
import type { CommissionType, ExchangeRate, Invoice, InvoiceLineItemInput, InvoiceStatus } from "@/types/invoicing"
import type { PackingCarton, PackingList } from "@/types/packing"
import type { SisterProfile } from "@/types/sourcing"

const STATUS_BADGE: Record<InvoiceStatus, "warning" | "success" | "danger" | "default"> = {
  pending_approval: "warning", issued: "success", rejected: "danger", void: "default",
}
const CAN_CREATE_ROLES = ["admin", "employee"]
const CAN_MANAGE_ROLES = ["admin"]
// BR-46: an Issued (or Void) invoice is never edited or hard-deleted — Void
// (with a required reason, on the detail page) is its only lifecycle exit.
// Pending/Rejected invoices never took effect, so those alone may be deleted.
const DELETABLE_STATUSES: InvoiceStatus[] = ["pending_approval", "rejected"]

export function InvoicesPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const invoicesQuery = useQuery({
    queryKey: ["invoices", "all", statusFilter],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Invoice>>("/invoices/", { params: { status: statusFilter, page_size: 200 } })
      return data.results
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/invoices/${id}/`) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
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
          <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500">Commercial invoices generated from approved packing lists.</p>
        </div>
        {canCreate && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New Invoice</Button>}
      </div>

      <Select className="w-52" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | "all")}>
        <option value="all">All Statuses</option>
        <option value="pending_approval">Pending Approval</option>
        <option value="issued">Issued</option>
        <option value="rejected">Rejected</option>
        <option value="void">Void</option>
      </Select>

      <Card>
        <CardContent className="p-0">
          {invoicesQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : !invoicesQuery.data?.length ? (
            <p className="py-10 text-center text-sm text-slate-400">No invoices match this filter.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Invoice No</th>
                  <th className="px-4 py-3 font-medium">Sister Profile</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Grand Total</th>
                  <th className="px-4 py-3 font-medium">Outstanding</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoicesQuery.data.map((inv) => {
                  const canDelete = canManage && DELETABLE_STATUSES.includes(inv.status)
                  return (
                    <tr key={inv.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/invoices/${inv.id}`)}>
                      <td className="px-4 py-3 font-medium text-slate-900">{inv.invoiceNo}</td>
                      <td className="px-4 py-3 text-slate-500">{inv.sisterProfilePoReference} · {inv.buyerName}</td>
                      <td className="px-4 py-3"><Badge variant={STATUS_BADGE[inv.status]}>{inv.status.replace(/_/g, " ")}</Badge></td>
                      <td className="px-4 py-3 font-medium text-slate-900">{Number(inv.grandTotal).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-500">{Number(inv.outstandingBalance).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-400">{new Date(inv.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="View" onClick={(e) => { e.stopPropagation(); navigate(`/invoices/${inv.id}`) }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canManage && (
                            <Button
                              size="sm" variant="ghost"
                              title={canDelete ? "Delete" : "Issued/Void invoices can't be deleted — use Void instead"}
                              className="text-red-500 hover:text-red-700 disabled:text-slate-300"
                              disabled={!canDelete}
                              onClick={(e) => { e.stopPropagation(); setDeleteError(null); setDeleteTarget(inv) }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <InvoiceBuilderDialog
          onClose={() => setCreateOpen(false)}
          onSuccess={(id) => { queryClient.invalidateQueries({ queryKey: ["invoices"] }); setCreateOpen(false); navigate(`/invoices/${id}`) }}
        />
      )}

      {deleteTarget && (
        <Dialog open onClose={() => setDeleteTarget(null)} title={`Delete "${deleteTarget.invoiceNo}"?`}>
          <div className="flex flex-col gap-4">
            {deleteError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</div>}
            <p className="text-sm text-slate-600">
              This permanently removes the invoice — it never took effect (no payments possible against a
              {" "}{deleteTarget.status.replace(/_/g, " ")} invoice). This cannot be undone.
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

interface LineDraft extends InvoiceLineItemInput {
  tempId: string
}

function cartonToLine(carton: PackingCarton): LineDraft {
  return {
    tempId: crypto.randomUUID(),
    packingCarton: carton.id,
    description: carton.productName || carton.styleNumber,
    brand: "",
    ctn: carton.noOfCartons,
    qtyPerCtn: carton.totalPcsPerCarton,
    totalQty: carton.shipQty,
    unitPrice: 0,
    amount: 0,
    netWeight: carton.totalNetWeight,
    grossWeight: carton.totalGrossWeight,
    cbm: carton.totalCbm,
    material: "",
    styleItemCode: carton.styleNumber,
    packingListRef: carton.packingListReferenceCode,
    remarks: "",
  }
}

function InvoiceBuilderDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (id: string) => void }) {
  const [sisterProfile, setSisterProfile] = useState("")
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set())
  const [lines, setLines] = useState<LineDraft[]>([])
  const [exchangeRate, setExchangeRate] = useState("")
  const [commissionType, setCommissionType] = useState<CommissionType>("none")
  const [commissionValue, setCommissionValue] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const profilesQuery = useQuery({
    queryKey: ["sister-profiles", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 200 } }); return data.results },
  })
  const packingListsQuery = useQuery({
    queryKey: ["packing-lists", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<PackingList>>("/packing-lists/", { params: { page_size: 200 } }); return data.results },
  })
  const ratesQuery = useQuery({
    queryKey: ["exchange-rates", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<ExchangeRate>>("/exchange-rates/", { params: { page_size: 200 } }); return data.results },
  })

  const listsForProfile = useMemo(
    () => (packingListsQuery.data ?? []).filter((pl) => pl.sisterProfile === sisterProfile),
    [packingListsQuery.data, sisterProfile],
  )

  function toggleList(pl: PackingList) {
    setSelectedLists((prev) => {
      const next = new Set(prev)
      if (next.has(pl.id)) {
        next.delete(pl.id)
        setLines((ls) => ls.filter((l) => !pl.cartons.some((c) => c.id === l.packingCarton)))
      } else {
        next.add(pl.id)
        setLines((ls) => [...ls, ...pl.cartons.map(cartonToLine)])
      }
      return next
    })
  }

  function updateLine(tempId: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => {
      if (l.tempId !== tempId) return l
      const merged = { ...l, ...patch }
      merged.amount = Number((merged.unitPrice * merged.totalQty).toFixed(2))
      return merged
    }))
  }
  function removeLine(tempId: string) {
    setLines((prev) => prev.filter((l) => l.tempId !== tempId))
  }

  const totalValue = lines.reduce((sum, l) => sum + l.amount, 0)
  const commissionAmount = commissionType === "percentage" ? (totalValue * commissionValue) / 100 : commissionType === "flat" ? commissionValue : 0
  const grandTotal = totalValue + commissionAmount

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        sisterProfile,
        exchangeRate: exchangeRate || null,
        commissionType,
        commissionValue,
        lineItems: lines.map(({ tempId: _tempId, ...rest }) => rest),
      }
      const { data } = await api.post<Invoice>("/invoices/", payload)
      return data
    },
    onSuccess: (data) => onSuccess(data.id),
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sisterProfile) { setError("Select a Sister Profile."); return }
    if (lines.length === 0) { setError("Select at least one Packing List to pull line items from."); return }
    setError(null)
    createMutation.mutate()
  }

  return (
    <Dialog open onClose={onClose} title="New Invoice" className="max-w-4xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Sister Profile *</label>
          <Select required value={sisterProfile} onChange={(e) => { setSisterProfile(e.target.value); setSelectedLists(new Set()); setLines([]) }}>
            <option value="">Select...</option>
            {profilesQuery.data?.map((sp) => (<option key={sp.id} value={sp.id}>{sp.poReference || sp.id} — {sp.buyerProfileName}</option>))}
          </Select>
        </div>

        {sisterProfile && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Source Packing List(s) *</label>
            {listsForProfile.length === 0 ? (
              <p className="text-xs text-slate-400">No packing lists exist yet for this Sister Profile.</p>
            ) : (
              <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 p-2">
                {listsForProfile.map((pl) => (
                  <label key={pl.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={selectedLists.has(pl.id)} onChange={() => toggleList(pl)} />
                    <code className="text-xs text-indigo-600">{pl.referenceCode}</code> {pl.poNo || pl.sisterProfilePoReference} — {pl.brandName || "no brand"} ({pl.cartons.length} cartons, {pl.totalCartonQty} CTNS)
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {lines.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <th className="px-2 py-1.5 font-medium">Description</th>
                <th className="px-2 py-1.5 font-medium">CTN</th>
                <th className="px-2 py-1.5 font-medium">Qty</th>
                <th className="px-2 py-1.5 font-medium">Unit Price</th>
                <th className="px-2 py-1.5 font-medium">Amount</th>
                <th className="px-2 py-1.5 font-medium">Remarks</th>
                <th className="w-8" />
              </tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.tempId} className="border-b border-slate-100 last:border-0">
                    <td className="p-1 text-slate-700">
                      {l.description} <span className="text-slate-400">({l.styleItemCode}{l.packingListRef ? ` / ${l.packingListRef}` : ""})</span>
                    </td>
                    <td className="p-1 text-center">{l.ctn}</td>
                    <td className="p-1 text-center">{l.totalQty}</td>
                    <td className="p-1"><Input className="h-7 w-24 text-xs" type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => updateLine(l.tempId, { unitPrice: Number(e.target.value) })} /></td>
                    <td className="p-1 text-center font-medium text-slate-700">{l.amount.toFixed(2)}</td>
                    <td className="p-1"><Input className="h-7 w-32 text-xs" value={l.remarks} onChange={(e) => updateLine(l.tempId, { remarks: e.target.value })} /></td>
                    <td className="p-1 text-center"><button type="button" onClick={() => removeLine(l.tempId)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Exchange Rate</label>
            <Select value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)}>
              <option value="">None</option>
              {ratesQuery.data?.map((r) => (<option key={r.id} value={r.id}>{r.sourceCurrency}→{r.targetCurrency} @ {r.rate}</option>))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Commission Type</label>
            <Select value={commissionType} onChange={(e) => setCommissionType(e.target.value as CommissionType)}>
              <option value="none">None</option>
              <option value="percentage">Percentage</option>
              <option value="flat">Flat</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Commission Value</label>
            <Input type="number" min={0} step="0.01" disabled={commissionType === "none"} value={commissionValue} onChange={(e) => setCommissionValue(Number(e.target.value))} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 rounded-md bg-slate-50 px-4 py-3 text-sm">
          <div><span className="text-slate-500">Line Total</span><div className="font-semibold text-slate-900">{totalValue.toFixed(2)}</div></div>
          <div><span className="text-slate-500">Commission</span><div className="font-semibold text-slate-900">{commissionAmount.toFixed(2)}</div></div>
          <div><span className="text-slate-500">Grand Total</span><div className="font-semibold text-slate-900">{grandTotal.toFixed(2)}</div></div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Submitting..." : "Submit for Approval"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

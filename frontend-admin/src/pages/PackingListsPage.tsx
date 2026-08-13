import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Eye, Pencil, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { ColorBreakdownInput, colorBreakdownToRows, colorRowsToBreakdown, emptyColorBreakdownRows, type ColorBreakdownRow } from "@/components/packing/ColorBreakdownInput"
import { SizeBreakdownInput } from "@/components/packing/SizeBreakdownInput"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Lightbox, type LightboxImage } from "@/components/ui/lightbox"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { extractErrorMessage } from "@/lib/errors"
import { resolveMediaUrl } from "@/lib/media"
import { nextStyleNo } from "@/lib/style-no"
import type { Paginated } from "@/types/api"
import { DEFAULT_SIZE_OPTIONS } from "@/types/packing"
import type { PackingCarton, PackingList, PackingListCreateInput, PackingRule } from "@/types/packing"
import type { Product, SisterProfile } from "@/types/sourcing"

const CAN_CREATE_ROLES = ["admin", "company_rep", "employee"]
const CAN_MANAGE_ROLES = ["admin"]

const SIZE_OPTIONS = DEFAULT_SIZE_OPTIONS

export interface CartonRowDraft {
  tempId: string; product: string; styleNo: string; cartonNoFrom: number; cartonNoTo: number
  colorRows: ColorBreakdownRow[]; patternNo: string; assortId: string
  sizeBreakdown: Record<string, number>; innerBundle: number; orderQty: number
  grossWeight: number; netWeight: number
  ctnLength: number; ctnWidth: number; ctnHeight: number
}

function emptyCartonRow(prevProduct?: string, prevStyleNo?: string): CartonRowDraft {
  return {
    tempId: crypto.randomUUID(),
    product: prevProduct ?? "",
    styleNo: prevStyleNo ?? nextStyleNo(),
    cartonNoFrom: 1, cartonNoTo: 1,
    colorRows: emptyColorBreakdownRows(), patternNo: "", assortId: "",
    sizeBreakdown: {}, innerBundle: 1, orderQty: 0,
    grossWeight: 0, netWeight: 0, ctnLength: 0, ctnWidth: 0, ctnHeight: 0,
  }
}

function cartonToDraft(c: PackingCarton): CartonRowDraft {
  return {
    tempId: crypto.randomUUID(),
    product: c.product,
    styleNo: c.styleNo,
    cartonNoFrom: c.cartonNoFrom,
    cartonNoTo: c.cartonNoTo,
    colorRows: colorBreakdownToRows(c.colorBreakdown),
    patternNo: c.patternNo,
    assortId: c.assortId,
    sizeBreakdown: { ...c.sizeBreakdown },
    innerBundle: c.innerBundle,
    orderQty: c.orderQty,
    grossWeight: c.grossWeight,
    netWeight: c.netWeight,
    ctnLength: c.ctnLength,
    ctnWidth: c.ctnWidth,
    ctnHeight: c.ctnHeight,
  }
}

/** Product's own Sourcing Intake color rows -> pre-filled carton row(s), so
 * packing detail already captured at intake doesn't get re-typed here.
 * One product variant (color) -> one carton row; a product with several
 * colors expands into several rows, all pointing at the same product. */
function rowsFromProduct(product: Product, baseRow: CartonRowDraft): CartonRowDraft[] {
  if (!product.variants.length) {
    return [{ ...baseRow, product: product.id }]
  }
  let cursor = baseRow.cartonNoFrom
  return product.variants.map((v, idx) => {
    const template = idx === 0 ? baseRow : emptyCartonRow(product.id, baseRow.styleNo)
    const cartonNoFrom = v.cartonNoFrom ?? cursor
    const cartonNoTo = v.cartonNoTo ?? cartonNoFrom
    cursor = cartonNoTo + 1
    return {
      ...template,
      product: product.id,
      colorRows: colorBreakdownToRows(v.colorBreakdown),
      patternNo: v.patternNo,
      sizeBreakdown: { ...v.sizeBreakdown },
      innerBundle: v.innerBundle || 1,
      orderQty: v.orderQty,
      cartonNoFrom, cartonNoTo,
      grossWeight: v.grossWeight ?? 0,
      netWeight: v.netWeight ?? 0,
      ctnLength: v.ctnLength ?? 0,
      ctnWidth: v.ctnWidth ?? 0,
      ctnHeight: v.ctnHeight ?? 0,
    }
  })
}

function computeRowDerived(row: CartonRowDraft) {
  const noOfCartons = row.cartonNoTo >= row.cartonNoFrom ? row.cartonNoTo - row.cartonNoFrom + 1 : 0
  const totalPcsPerCarton = Object.values(row.sizeBreakdown).reduce((a, b) => a + b, 0)
  const shipQty = noOfCartons * totalPcsPerCarton
  const shortExcessQty = row.orderQty - shipQty
  const shortExcessPct = row.orderQty > 0 ? (shortExcessQty / row.orderQty) * 100 : 0
  const totalGrossWeight = row.grossWeight * noOfCartons
  const totalNetWeight = row.netWeight * noOfCartons
  const cubicInches = row.ctnLength * row.ctnWidth * row.ctnHeight
  const ctnCbm = cubicInches > 0 ? cubicInches / 61023.7441 : 0
  const totalCbm = ctnCbm * noOfCartons
  return { noOfCartons, totalPcsPerCarton, shipQty, shortExcessQty, shortExcessPct, totalGrossWeight, totalNetWeight, ctnCbm, totalCbm }
}

function SummaryField({ label, value, unit, decimals = 0, warn }: { label: string; value: number; unit: string; decimals?: number; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-slate-500">{label}</span>
      <span className={warn ? "font-medium text-red-600" : "font-medium text-slate-700"}>
        {value.toFixed(decimals)} <span className="font-normal text-slate-400">{unit}</span>
      </span>
    </div>
  )
}

export function PackingListsPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [viewTarget, setViewTarget] = useState<PackingList | null>(null)
  const [editTarget, setEditTarget] = useState<PackingList | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PackingList | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const listsQuery = useQuery({
    queryKey: ["packing-lists"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<PackingList>>("/packing-lists/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/packing-lists/${id}/`) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packing-lists"] })
      setDeleteTarget(null)
      setDeleteError(null)
    },
    onError: (err: unknown) => setDeleteError(extractErrorMessage(err)),
  })

  const filtered = useMemo(() => {
    const rows = listsQuery.data ?? []
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter(
      (r) => r.poNo.toLowerCase().includes(q) || r.brandName.toLowerCase().includes(q) || r.sisterProfilePoReference.toLowerCase().includes(q),
    )
  }, [listsQuery.data, search])

  const canCreate = !!user && CAN_CREATE_ROLES.includes(user.role)
  const canManage = !!user && CAN_MANAGE_ROLES.includes(user.role)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Packing Lists</h1>
          <p className="text-sm text-slate-500">Build and manage packing lists with carton ranges, color x size breakdowns, weights, and CBM.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New Packing List</Button>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search by PO No, brand, or Sister Profile..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-72" />
      </div>
      {listsQuery.isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">{search ? "No packing lists match your search." : "No packing lists yet."}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((pl) => (
            <Card key={pl.id} className="cursor-pointer transition hover:shadow-md" onClick={() => setViewTarget(pl)}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{pl.brandName || pl.poNo || "--"}</span>
                  <Badge variant="default">{pl.totalCartonQty} CTNS</Badge>
                </div>
                <div className="text-xs text-slate-500 space-y-0.5">
                  <div>PO: {pl.poNo || "--"}</div>
                  <div>Sister Profile: {pl.sisterProfilePoReference || "--"}</div>
                  {pl.date && <div>Date: {pl.date}</div>}
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-xs">
                  <div><span className="text-slate-400">G.W</span><div className="font-medium text-slate-700">{Number(pl.totalGrossWeight).toFixed(2)}</div></div>
                  <div><span className="text-slate-400">N.W</span><div className="font-medium text-slate-700">{Number(pl.totalNetWeight).toFixed(2)}</div></div>
                  <div><span className="text-slate-400">CBM</span><div className="font-medium text-slate-700">{Number(pl.totalCbm).toFixed(4)}</div></div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-400">
                  <span>{pl.cartons.length} carton rows</span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" title="View" onClick={(e) => { e.stopPropagation(); setViewTarget(pl) }}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {canManage && (
                      <>
                        <Button size="sm" variant="ghost" title="Edit" onClick={(e) => { e.stopPropagation(); setEditTarget(pl) }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost" title="Delete" className="text-red-500 hover:text-red-700"
                          onClick={(e) => { e.stopPropagation(); setDeleteError(null); setDeleteTarget(pl) }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {createOpen && (
        <CreatePackingListDialog
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { setCreateOpen(false); queryClient.invalidateQueries({ queryKey: ["packing-lists"] }) }}
        />
      )}

      {viewTarget && <ViewPackingListDialog packingList={viewTarget} onClose={() => setViewTarget(null)} />}

      {editTarget && <EditPackingListDialog packingList={editTarget} onClose={() => setEditTarget(null)} />}

      {deleteTarget && (
        <Dialog open onClose={() => setDeleteTarget(null)} title={`Delete "${deleteTarget.poNo || deleteTarget.brandName || deleteTarget.id}"?`}>
          <div className="flex flex-col gap-4">
            {deleteError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</div>}
            <p className="text-sm text-slate-600">
              This permanently removes this packing list and its {deleteTarget.cartons.length} carton row(s). This cannot be undone.
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

interface PackingListFormState {
  sisterProfile: string; packingRule: string | null; poNo: string; brandName: string
  date: string | null; frontMark: string; sideMark: string
}

/** Shared by Create and Edit — Sister Profile/header fields + the full
 * carton-row grid (product photo, color breakdown, size breakdown, weights,
 * dimensions, computed CBM) + totals footer. */
function PackingListFormFields({ form, updateForm, rows, onRowsChange }: {
  form: PackingListFormState
  updateForm: (patch: Partial<PackingListFormState>) => void
  rows: CartonRowDraft[]
  onRowsChange: (rows: CartonRowDraft[]) => void
}) {
  const [photoLightbox, setPhotoLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null)

  const profilesQuery = useQuery({ queryKey: ["sister-profiles"], queryFn: async () => { const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 200 } }); return data.results } })
  const rulesQuery = useQuery({ queryKey: ["packing-rules"], queryFn: async () => { const { data } = await api.get<Paginated<PackingRule>>("/packing-rules/", { params: { page_size: 200 } }); return data.results } })
  const productsQuery = useQuery({
    queryKey: ["products", "by-sister-profile", form.sisterProfile],
    queryFn: async () => { const { data } = await api.get<Paginated<Product>>("/products/", { params: { sisterProfile: form.sisterProfile, page_size: 200 } }); return data.results },
    enabled: !!form.sisterProfile,
  })

  function updateRow(index: number, patch: Partial<CartonRowDraft>) { onRowsChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r))) }
  function removeRow(index: number) { onRowsChange(rows.filter((_, i) => i !== index)) }
  function addRow() {
    const lastRow = rows[rows.length - 1]
    const nextFrom = lastRow ? lastRow.cartonNoTo + 1 : 1
    const newRow = emptyCartonRow(lastRow?.product, lastRow?.styleNo)
    newRow.cartonNoFrom = nextFrom
    newRow.cartonNoTo = nextFrom
    onRowsChange([...rows, newRow])
  }

  const activeRule = rulesQuery.data?.find((r) => r.id === form.packingRule)
  const sizeKeys = activeRule ? Object.keys(activeRule.sizeRatio) : SIZE_OPTIONS
  const grandTotals = useMemo(() => {
    const d = rows.map(computeRowDerived)
    return { cartons: d.reduce((s, r) => s + r.noOfCartons, 0), pcs: d.reduce((s, r) => s + r.shipQty, 0), grossWeight: d.reduce((s, r) => s + r.totalGrossWeight, 0), netWeight: d.reduce((s, r) => s + r.totalNetWeight, 0), cbm: d.reduce((s, r) => s + r.totalCbm, 0), orderQty: rows.reduce((s, r) => s + r.orderQty, 0) }
  }, [rows])
  const summaryShipQty = grandTotals.pcs
  const summaryShortQty = grandTotals.orderQty - summaryShipQty
  const summaryShortPct = grandTotals.orderQty > 0 ? (summaryShortQty / grandTotals.orderQty) * 100 : 0

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Sister Profile *</label>
          <Select value={form.sisterProfile} onChange={(e) => updateForm({ sisterProfile: e.target.value })}>
            <option value="">Select...</option>
            {profilesQuery.data?.map((sp) => (<option key={sp.id} value={sp.id}>{sp.poReference || sp.id} — {sp.buyerProfileName}</option>))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Packing Rule (optional)</label>
          <Select value={form.packingRule ?? ""} onChange={(e) => updateForm({ packingRule: e.target.value || null })}>
            <option value="">None (manual)</option>
            {rulesQuery.data?.map((r) => (<option key={r.id} value={r.id}>{r.name || r.id} — {r.unitsPerCarton} pcs/ctn</option>))}
          </Select>
        </div>
        <div className="flex flex-col gap-1"><label className="text-xs font-medium text-slate-600">PO No</label><Input value={form.poNo} onChange={(e) => updateForm({ poNo: e.target.value })} /></div>
        <div className="flex flex-col gap-1"><label className="text-xs font-medium text-slate-600">Brand Name</label><Input value={form.brandName} onChange={(e) => updateForm({ brandName: e.target.value })} /></div>
        <div className="flex flex-col gap-1"><label className="text-xs font-medium text-slate-600">Date</label><Input type="date" value={form.date ?? ""} onChange={(e) => updateForm({ date: e.target.value || null })} /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1"><label className="text-xs font-medium text-slate-600">Front Mark</label><Textarea value={form.frontMark} onChange={(e) => updateForm({ frontMark: e.target.value })} rows={2} /></div>
        <div className="flex flex-col gap-1"><label className="text-xs font-medium text-slate-600">Side Mark</label><Textarea value={form.sideMark} onChange={(e) => updateForm({ sideMark: e.target.value })} rows={2} /></div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-600">Carton Rows (one per color/pattern)</label>
          <Button type="button" variant="outline" size="sm" onClick={addRow}><Plus className="h-3.5 w-3.5" />Add Fields</Button>
        </div>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <th className="px-2 py-1.5 font-medium">Style No</th>
            <th className="px-2 py-1.5 font-medium">Product</th>
            <th className="px-2 py-1.5 font-medium">Photo</th>
            <th className="px-2 py-1.5 font-medium">COLOR BREAKDOWN</th>
            <th className="px-2 py-1.5 font-medium">Pattern No</th>
            <th className="px-2 py-1.5 font-medium">CTN From</th>
            <th className="px-2 py-1.5 font-medium">CTN To</th>
            <th className="px-2 py-1.5 font-medium">CTNS</th>
            <th className="px-2 py-1.5 font-medium">Order Qty</th>
            <th className="px-2 py-1.5 font-medium">SIZE RANGE</th>
            <th className="px-2 py-1.5 font-medium">PC/CTN</th>
            <th className="px-2 py-1.5 font-medium">Inner Bdl</th>
            <th className="px-2 py-1.5 font-medium">TTL PCS</th>
            <th className="px-2 py-1.5 font-medium">G.W(kg)</th>
            <th className="px-2 py-1.5 font-medium">N.W(kg)</th>
            <th className="px-2 py-1.5 font-medium">TTL G.W</th>
            <th className="px-2 py-1.5 font-medium">TTL N.W</th>
            <th className="px-2 py-1.5 font-medium">L(in)</th>
            <th className="px-2 py-1.5 font-medium">W(in)</th>
            <th className="px-2 py-1.5 font-medium">H(in)</th>
            <th className="px-2 py-1.5 font-medium">CBM</th>
            <th className="px-2 py-1.5 font-medium">TTL CBM</th>
            <th className="w-8" /></tr></thead><tbody>
              {rows.map((row, i) => { const d = computeRowDerived(row); return (
                  <tr key={row.tempId} className="border-b border-slate-100 last:border-0">
                    <td className="p-1">
                      <div className="flex items-center gap-1">
                        <Input className="h-7 w-24 text-xs" placeholder="Style No" value={row.styleNo} onChange={(e) => updateRow(i, { styleNo: e.target.value })} />
                        <button type="button" title="Auto-generate Style No" onClick={() => updateRow(i, { styleNo: nextStyleNo() })} className="shrink-0 rounded border border-slate-200 p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600"><Plus className="h-3 w-3" /></button>
                      </div>
                    </td>
                    <td className="p-1">
                      <Select
                        className="h-7 w-36 text-xs" value={row.product} disabled={!form.sisterProfile}
                        onChange={(e) => {
                          const product = productsQuery.data?.find((p) => p.id === e.target.value)
                          const expanded = product ? rowsFromProduct(product, rows[i]) : [{ ...rows[i], product: e.target.value }]
                          onRowsChange([...rows.slice(0, i), ...expanded, ...rows.slice(i + 1)])
                        }}
                      >
                        <option value="">{form.sisterProfile ? "Select product..." : "Pick Sister Profile first"}</option>
                        {productsQuery.data?.map((p) => (<option key={p.id} value={p.id}>{p.styleNumber} — {p.name}</option>))}
                      </Select>
                      <p className="mt-0.5 text-[10px] text-slate-400">Auto-fills from Sourcing Intake</p>
                    </td>
                    <td className="p-1 text-center">
                      {(() => {
                        const product = productsQuery.data?.find((p) => p.id === row.product)
                        if (!product || product.images.length === 0) return <span className="text-slate-300">—</span>
                        return (
                          <button
                            type="button"
                            title="View photos"
                            onClick={() => setPhotoLightbox({
                              images: product.images.map((img) => ({ src: resolveMediaUrl(img.image), label: img.customLabelName || img.label })),
                              index: 0,
                            })}
                            className="h-9 w-9 overflow-hidden rounded border border-slate-200 hover:ring-2 hover:ring-slate-300"
                          >
                            <img src={resolveMediaUrl(product.images[0].image)} alt="" className="h-full w-full object-cover" />
                          </button>
                        )
                      })()}
                    </td>
                    <td className="p-1"><ColorBreakdownInput rows={row.colorRows} onChange={(cr) => updateRow(i, { colorRows: cr })} /></td>
                    <td className="p-1"><Input className="h-7 w-24 text-xs" placeholder="Pattern" value={row.patternNo} onChange={(e) => updateRow(i, { patternNo: e.target.value })} /></td>
                    <td className="p-1"><Input className="h-7 w-14 text-xs" type="number" min={1} value={row.cartonNoFrom} onChange={(e) => updateRow(i, { cartonNoFrom: Number(e.target.value) })} /></td>
                    <td className="p-1"><Input className="h-7 w-14 text-xs" type="number" min={1} value={row.cartonNoTo} onChange={(e) => updateRow(i, { cartonNoTo: Number(e.target.value) })} /></td>
                    <td className="p-1 text-center text-xs font-medium text-slate-600">{d.noOfCartons}</td>
                    <td className="p-1"><Input className="h-7 w-16 text-xs" type="number" min={0} value={row.orderQty} onChange={(e) => updateRow(i, { orderQty: Number(e.target.value) })} /></td>
                    <td className="p-1"><SizeBreakdownInput sizeKeys={sizeKeys} values={row.sizeBreakdown} onChange={(sb) => updateRow(i, { sizeBreakdown: sb })} /></td>
                    <td className="p-1 text-center text-xs font-medium text-slate-600">{d.totalPcsPerCarton}</td>
                    <td className="p-1"><Input className="h-7 w-14 text-xs" type="number" min={1} value={row.innerBundle} onChange={(e) => updateRow(i, { innerBundle: Number(e.target.value) })} /></td>
                    <td className="p-1 text-center text-xs font-medium text-slate-600">{d.shipQty}</td>
                    <td className="p-1"><Input className="h-7 w-14 text-xs" type="number" step="0.01" min={0} max={999999} value={row.grossWeight} onChange={(e) => updateRow(i, { grossWeight: Number(e.target.value) })} /></td>
                    <td className="p-1"><Input className="h-7 w-14 text-xs" type="number" step="0.01" min={0} max={999999} value={row.netWeight} onChange={(e) => updateRow(i, { netWeight: Number(e.target.value) })} /></td>
                    <td className="p-1 text-center text-xs font-medium text-slate-600">{d.totalGrossWeight.toFixed(2)}</td>
                    <td className="p-1 text-center text-xs font-medium text-slate-600">{d.totalNetWeight.toFixed(2)}</td>
                    <td className="p-1"><Input className="h-7 w-12 text-xs" type="number" step="0.01" min={0} max={999999} value={row.ctnLength} onChange={(e) => updateRow(i, { ctnLength: Number(e.target.value) })} /></td>
                    <td className="p-1"><Input className="h-7 w-12 text-xs" type="number" step="0.01" min={0} max={999999} value={row.ctnWidth} onChange={(e) => updateRow(i, { ctnWidth: Number(e.target.value) })} /></td>
                    <td className="p-1"><Input className="h-7 w-12 text-xs" type="number" step="0.01" min={0} max={999999} value={row.ctnHeight} onChange={(e) => updateRow(i, { ctnHeight: Number(e.target.value) })} /></td>
                    <td className="p-1 text-center text-xs font-medium text-slate-600">{d.ctnCbm.toFixed(4)}</td>
                    <td className="p-1 text-center text-xs font-medium text-slate-600">{d.totalCbm.toFixed(4)}</td>
                    <td className="p-1 text-center">{rows.length > 1 && (<button type="button" onClick={() => removeRow(i)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>)}</td>
                  </tr>) })}
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-xs text-slate-700">
                <td colSpan={7} className="px-2 py-1.5">G.TOTAL</td>
                <td className="px-2 py-1.5 text-center">{grandTotals.cartons}</td>
                <td className="px-2 py-1.5 text-center">{grandTotals.orderQty}</td>
                <td colSpan={3} /><td className="px-2 py-1.5 text-center">{grandTotals.pcs}</td>
                <td colSpan={2} /><td className="px-2 py-1.5 text-center">{grandTotals.grossWeight.toFixed(2)}</td>
                <td className="px-2 py-1.5 text-center">{grandTotals.netWeight.toFixed(2)}</td>
                <td colSpan={3} /><td className="px-2 py-1.5 text-center">{grandTotals.cbm.toFixed(4)}</td><td />
              </tr>
            </tbody></table>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-4">
        <SummaryField label="Total Order Quantity" value={grandTotals.orderQty} unit="PCS" />
        <SummaryField label="Total Ship Quantity" value={summaryShipQty} unit="PCS" />
        <SummaryField label="SHORT/EXCESS QTY" value={summaryShortQty} unit="PCS" warn={summaryShortQty > 0} />
        <SummaryField label="Percentage" value={summaryShortPct} unit="%" decimals={2} />
        <SummaryField label="Total Carton Qty" value={grandTotals.cartons} unit="CTNS" />
        <SummaryField label="Total Gross Weight" value={grandTotals.grossWeight} unit="KGS" decimals={2} />
        <SummaryField label="Total Net Weight" value={grandTotals.netWeight} unit="KGS" decimals={2} />
        <SummaryField label="Total CBM" value={grandTotals.cbm} unit="CBM" decimals={4} />
      </div>

      {photoLightbox && (
        <Lightbox images={photoLightbox.images} initialIndex={photoLightbox.index} onClose={() => setPhotoLightbox(null)} />
      )}
    </>
  )
}

function CreatePackingListDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (id: string) => void }) {
  const [form, setForm] = useState<PackingListFormState>({
    sisterProfile: "", packingRule: null, poNo: "", brandName: "", date: null, frontMark: "", sideMark: "",
  })
  const [rows, setRows] = useState<CartonRowDraft[]>([emptyCartonRow()])
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: async (payload: PackingListCreateInput) => { const { data } = await api.post<PackingList>("/packing-lists/", payload); return data },
    onSuccess: (data) => onSuccess(data.id),
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function updateForm(patch: Partial<PackingListFormState>) { setForm((prev) => ({ ...prev, ...patch })) }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    if (!form.sisterProfile) { setError("Sister Profile is required."); return }
    const cartons = rows
      .filter((r) => r.product && r.colorRows.some((c) => c.name.trim() || c.qty))
      .map(({ tempId: _, colorRows, ...rest }) => ({ ...rest, colorBreakdown: colorRowsToBreakdown(colorRows) }))
    if (cartons.length === 0) { setError("Add at least one carton row with a Product and at least one color."); return }
    createMutation.mutate({ ...form, cartons })
  }

  return (
    <Dialog open onClose={onClose} title="New Packing List" className="max-w-[95vw] xl:max-w-7xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && <p className="text-xs text-red-600">{error}</p>}
        <PackingListFormFields form={form} updateForm={updateForm} rows={rows} onRowsChange={setRows} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Packing List"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

function EditPackingListDialog({ packingList, onClose }: { packingList: PackingList; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<PackingListFormState>({
    sisterProfile: packingList.sisterProfile,
    packingRule: packingList.packingRule,
    poNo: packingList.poNo,
    brandName: packingList.brandName,
    date: packingList.date,
    frontMark: packingList.frontMark,
    sideMark: packingList.sideMark,
  })
  const [rows, setRows] = useState<CartonRowDraft[]>(
    packingList.cartons.length ? packingList.cartons.map(cartonToDraft) : [emptyCartonRow()],
  )
  const [error, setError] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: async () => {
      const cartons = rows
        .filter((r) => r.product && r.colorRows.some((c) => c.name.trim() || c.qty))
        .map(({ tempId: _, colorRows, ...rest }) => ({ ...rest, colorBreakdown: colorRowsToBreakdown(colorRows) }))
      const { data } = await api.patch<PackingList>(`/packing-lists/${packingList.id}/`, { ...form, cartons })
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["packing-lists", packingList.id], data)
      queryClient.invalidateQueries({ queryKey: ["packing-lists"] })
      onClose()
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function updateForm(patch: Partial<PackingListFormState>) { setForm((prev) => ({ ...prev, ...patch })) }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    if (!form.sisterProfile) { setError("Sister Profile is required."); return }
    updateMutation.mutate()
  }

  return (
    <Dialog open onClose={onClose} title="Edit Packing List" className="max-w-[95vw] xl:max-w-7xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && <p className="text-xs text-red-600">{error}</p>}
        <PackingListFormFields form={form} updateForm={updateForm} rows={rows} onRowsChange={setRows} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving..." : "Save Changes"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

function ViewPackingListDialog({ packingList, onClose }: { packingList: PackingList; onClose: () => void }) {
  const [photoLightbox, setPhotoLightbox] = useState<LightboxImage[] | null>(null)

  return (
    <Dialog open onClose={onClose} title="Packing List Details" className="max-w-[95vw] xl:max-w-7xl">
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <Field label="PO No" value={packingList.poNo || "—"} />
          <Field label="Sister Profile" value={packingList.sisterProfilePoReference || "—"} />
          <Field label="Brand Name" value={packingList.brandName || "—"} />
          <Field label="Date" value={packingList.date || "—"} />
          <Field label="Total Order Qty" value={String(packingList.totalOrderQty)} />
          <Field label="Total Ship Qty" value={String(packingList.totalShipQty)} />
          <Field label="Total Carton Qty" value={String(packingList.totalCartonQty)} />
          <Field label="Total CBM" value={Number(packingList.totalCbm).toFixed(4)} />
          {packingList.frontMark && <Field label="Front Mark" value={packingList.frontMark} />}
          {packingList.sideMark && <Field label="Side Mark" value={packingList.sideMark} />}
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <th className="px-2 py-1.5 font-medium">Style No</th>
                <th className="px-2 py-1.5 font-medium">Product</th>
                <th className="px-2 py-1.5 font-medium">Photo</th>
                <th className="px-2 py-1.5 font-medium">Color Breakdown</th>
                <th className="px-2 py-1.5 font-medium">Pattern No</th>
                <th className="px-2 py-1.5 font-medium">CTN From</th>
                <th className="px-2 py-1.5 font-medium">CTN To</th>
                <th className="px-2 py-1.5 font-medium">CTNS</th>
                <th className="px-2 py-1.5 font-medium">Order Qty</th>
                <th className="px-2 py-1.5 font-medium">Ship Qty</th>
                <th className="px-2 py-1.5 font-medium">TTL G.W</th>
                <th className="px-2 py-1.5 font-medium">TTL N.W</th>
                <th className="px-2 py-1.5 font-medium">CBM</th>
              </tr>
            </thead>
            <tbody>
              {packingList.cartons.length === 0 ? (
                <tr><td colSpan={13} className="px-2 py-6 text-center text-slate-400">No carton rows recorded.</td></tr>
              ) : (
                packingList.cartons.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-2 font-medium text-slate-900">{c.styleNo || c.styleNumber}</td>
                    <td className="px-2 py-2 text-slate-500">{c.productName}</td>
                    <td className="px-2 py-2">
                      <PackingListCartonPhoto carton={c} onOpen={setPhotoLightbox} />
                    </td>
                    <td className="px-2 py-2 text-slate-500">
                      {Object.entries(c.colorBreakdown).length === 0 ? "—" : Object.entries(c.colorBreakdown).map(([k, v]) => `${k}:${v}`).join(" / ")}
                    </td>
                    <td className="px-2 py-2 text-slate-500">{c.patternNo || "—"}</td>
                    <td className="px-2 py-2 text-slate-500">{c.cartonNoFrom}</td>
                    <td className="px-2 py-2 text-slate-500">{c.cartonNoTo}</td>
                    <td className="px-2 py-2 text-slate-500">{c.noOfCartons}</td>
                    <td className="px-2 py-2 text-slate-500">{c.orderQty}</td>
                    <td className="px-2 py-2 text-slate-500">{c.shipQty}</td>
                    <td className="px-2 py-2 text-slate-500">{Number(c.totalGrossWeight).toFixed(2)}</td>
                    <td className="px-2 py-2 text-slate-500">{Number(c.totalNetWeight).toFixed(2)}</td>
                    <td className="px-2 py-2 text-slate-500">{Number(c.totalCbm).toFixed(4)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>

      {photoLightbox && <Lightbox images={photoLightbox} initialIndex={0} onClose={() => setPhotoLightbox(null)} />}
    </Dialog>
  )
}

function PackingListCartonPhoto({ carton, onOpen }: { carton: PackingCarton; onOpen: (images: LightboxImage[]) => void }) {
  const productsQuery = useQuery({
    queryKey: ["products", carton.product],
    queryFn: async () => { const { data } = await api.get<Product>(`/products/${carton.product}/`); return data },
  })
  const images = productsQuery.data?.images ?? []
  if (images.length === 0) return <span className="text-slate-300">—</span>
  return (
    <button
      type="button"
      title="View photos"
      onClick={() => onOpen(images.map((img) => ({ src: resolveMediaUrl(img.image), label: img.customLabelName || img.label })))}
      className="h-9 w-9 overflow-hidden rounded border border-slate-200 hover:ring-2 hover:ring-slate-300"
    >
      <img src={resolveMediaUrl(images[0].image)} alt="" className="h-full w-full object-cover" />
    </button>
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

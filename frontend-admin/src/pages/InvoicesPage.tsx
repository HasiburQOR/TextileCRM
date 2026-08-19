import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Eye, Plus, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Lightbox, type LightboxImage } from "@/components/ui/lightbox"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { convertToBuyerCurrency } from "@/lib/currency"
import { extractErrorMessage } from "@/lib/errors"
import { pickProductImage, resolveMediaUrl } from "@/lib/media"
import type { Paginated } from "@/types/api"
import type { Invoice, InvoiceLineItemInput, InvoiceStatus } from "@/types/invoicing"
import type { PackingCarton, PackingList } from "@/types/packing"
import type { CostBreakdown, SisterProfile } from "@/types/buyers"
import { AGREEMENTS } from "@/types/buyers"
import type { Product } from "@/types/sourcing"
import type { WarehouseCost } from "@/types/warehouse"

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
                  <th className="px-4 py-3 font-medium">Total Value</th>
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

function cartonToLine(carton: PackingCarton, packingList?: PackingList): LineDraft {
  return {
    tempId: crypto.randomUUID(),
    packingCarton: carton.id,
    // Carried through so the invoice line knows which Product it came from.
    // Without it the document has no way back to the product's photo
    // gallery, and the Foto column renders empty for every line.
    product: carton.product,
    description: carton.productName || carton.styleNumber,
    brand: packingList?.brandName ?? "",
    ctn: carton.noOfCartons,
    qtyPerCtn: carton.totalPcsPerCarton,
    totalQty: carton.shipQty,
    // Priced at Packing - one price per carton (color) row, pre-filled from
    // the product variant at intake. The amount mirrors the carton's own
    // totalAmount (shipQty x unitPrice) and stays editable per line here.
    // Number(...) on every decimal: DRF serializes DecimalField as a STRING
    // ("265.00"), so these arrive as strings however the TS types read. An
    // un-coerced `amount` crashes the line table outright (`amount.toFixed`
    // is not a function) and makes the Line Total a concatenation rather
    // than a sum — and it only bites once a carton actually carries a
    // price, so an unpriced packing list hides it.
    unitPrice: Number(carton.unitPrice ?? 0),
    amount: Number(carton.totalAmount ?? 0),
    netWeight: Number(carton.totalNetWeight ?? 0),
    grossWeight: Number(carton.totalGrossWeight ?? 0),
    cbm: Number(carton.totalCbm ?? 0),
    // Captured at Sourcing Intake (Product.material) - a starting point the
    // invoice editor can still override per line.
    material: carton.productMaterial ?? "",
    styleItemCode: carton.styleNumber,
    packingListRef: carton.packingListReferenceCode,
    remarks: "",
    // Commercial Invoice / Packing List columns. Carton dimensions are
    // stored in inches here and converted to cm server-side — hence
    // dimensionsInCm: false, which is what makes the printed L×W×H and the
    // CBM derived from it come out in the units the buyer expects.
    colorSizeNote: [carton.colorName, carton.assortId].filter(Boolean).join(", "),
    markRef: packingList?.frontMark?.split("\n")[0] ?? "",
    hsCode: "",
    netWeightPerCtn: Number(carton.netWeight ?? 0),
    grossWeightPerCtn: Number(carton.grossWeight ?? 0),
    cbmPerCtn: Number(carton.ctnCbm ?? 0),
    ctnLengthCm: Number(carton.ctnLength ?? 0),
    ctnWidthCm: Number(carton.ctnWidth ?? 0),
    ctnHeightCm: Number(carton.ctnHeight ?? 0),
    dimensionsInCm: false,
  }
}

function warehouseCostToLine(wc: WarehouseCost): LineDraft {
  // One pickable row per recorded Warehouse Cost, same flow as a Packing
  // Carton — it becomes a single line item on the invoice, not a product
  // line. `unitPrice`/`amount` start pre-filled from the cost itself
  // (unlike a carton line, which is priced by hand) since there's no
  // separate "quantity" to multiply here.
  //
  // ctn/qty are deliberately ZERO, not 1: this line is a cost, not goods.
  // A carton count of 1 here lands in the document's TOTAL CTNS and TOTAL
  // QTY, so a 1,000 pc / 28 ctn shipment printed as 1,001 pcs in 29
  // cartons — a figure a customs broker reads off the packing list and
  // one that contradicts the Packing List it was generated from.
  const label = wc.packingListReferenceCode || wc.sisterProfilePoReference || "Warehouse Cost"
  const total = Number(wc.totalCost)
  return {
    tempId: crypto.randomUUID(),
    warehouseCost: wc.id,
    product: null,
    description: `Warehouse Cost — ${label}`,
    brand: "",
    ctn: 0,
    qtyPerCtn: 0,
    totalQty: 0,
    unitPrice: total,
    amount: total,
    netWeight: 0,
    grossWeight: 0,
    cbm: 0,
    material: "",
    styleItemCode: "",
    packingListRef: wc.packingListReferenceCode || "",
    remarks: "",
    colorSizeNote: "",
    markRef: "",
    hsCode: "",
    netWeightPerCtn: 0,
    grossWeightPerCtn: 0,
    cbmPerCtn: 0,
    ctnLengthCm: 0,
    ctnWidthCm: 0,
    ctnHeightCm: 0,
    dimensionsInCm: true,
  }
}

function InvoiceBuilderDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (id: string) => void }) {
  const [sisterProfile, setSisterProfile] = useState("")
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set())
  const [selectedWarehouseCosts, setSelectedWarehouseCosts] = useState<Set<string>>(new Set())
  const [lines, setLines] = useState<LineDraft[]>([])
  // The agreement type decides HOW this rate applies (percentage of the line
  // value, per piece, or percentage of the reimbursed costs); the operator
  // types the number per invoice. The currency pair and exchange rate are
  // NOT entered here — they are snapshotted from the Sister Profile.
  const [commissionRate, setCommissionRate] = useState("")
  const [pullExpenses, setPullExpenses] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Per-invoice buyer/consignee details — entered at creation time,
  // positioned top-left on the printed document after the company banner.
  const [buyerCompanyName, setBuyerCompanyName] = useState("")
  const [buyerIdNumber, setBuyerIdNumber] = useState("")
  const [buyerAddress, setBuyerAddress] = useState("")
  const [buyerCityCountry, setBuyerCityCountry] = useState("")
  const [buyerContactPerson, setBuyerContactPerson] = useState("")
  const [buyerPhone, setBuyerPhone] = useState("")
  const [buyerCustomFields, setBuyerCustomFields] = useState<{ label: string; value: string }[]>([])
  const [photoLightbox, setPhotoLightbox] = useState<LightboxImage[] | null>(null)

  const profilesQuery = useQuery({
    queryKey: ["sister-profiles", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 200 } }); return data.results },
  })
  const packingListsQuery = useQuery({
    queryKey: ["packing-lists", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<PackingList>>("/packing-lists/", { params: { page_size: 200 } }); return data.results },
  })
  const warehouseCostsQuery = useQuery({
    queryKey: ["warehouse-costs", "for-sister-profile", sisterProfile],
    queryFn: async () => {
      const { data } = await api.get<Paginated<WarehouseCost>>("/warehouse-costs/", { params: { sisterProfile, page_size: 200 } })
      return data.results
    },
    enabled: !!sisterProfile,
  })
  const breakdownQuery = useQuery({
    queryKey: ["sister-profiles", sisterProfile, "cost-breakdown"],
    queryFn: async () => {
      const { data } = await api.get<CostBreakdown>(`/sister-profiles/${sisterProfile}/cost-breakdown/`)
      return data
    },
    enabled: !!sisterProfile,
  })
  const breakdown = breakdownQuery.data

  // For the line table's Photo column — same per-color image lookup used on
  // the Packing List, so a line shows the color it's actually shipping, not
  // just the product's first uploaded photo.
  const productsQuery = useQuery({
    queryKey: ["sister-profiles", sisterProfile, "products", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<Product>>("/products/", { params: { sisterProfile, page_size: 200 } }); return data.results },
    enabled: !!sisterProfile,
  })

  const selectedProfile = useMemo(
    () => profilesQuery.data?.find((sp) => sp.id === sisterProfile),
    [profilesQuery.data, sisterProfile],
  )
  const agreement = selectedProfile ? AGREEMENTS[selectedProfile.agreementType] : undefined
  // Snapshotted server-side from the profile at generation; shown here so
  // the preview matches what will actually be locked onto the document.
  const sourceCurrency = selectedProfile?.supplierCurrency ?? ""
  const targetCurrency = selectedProfile?.buyerCurrency ?? ""

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
        // Explicit arrow, not a bare reference: Array.map passes the index
        // as the second argument, which would land in `packingList`.
        setLines((ls) => [...ls, ...pl.cartons.map((carton) => cartonToLine(carton, pl))])
      }
      return next
    })
  }

  function toggleWarehouseCost(wc: WarehouseCost) {
    setSelectedWarehouseCosts((prev) => {
      const next = new Set(prev)
      if (next.has(wc.id)) {
        next.delete(wc.id)
        setLines((ls) => ls.filter((l) => l.warehouseCost !== wc.id))
      } else {
        next.add(wc.id)
        setLines((ls) => [...ls, warehouseCostToLine(wc)])
      }
      return next
    })
  }

  function updateLine(tempId: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => {
      if (l.tempId !== tempId) return l
      const merged = { ...l, ...patch }
      // A cost line (warehouse cost) carries no quantity — its price IS its
      // amount. Multiplying by a zero qty would silently wipe it the moment
      // someone corrected the figure.
      const price = Number(merged.unitPrice) || 0
      merged.amount = merged.totalQty > 0
        ? Number((price * merged.totalQty).toFixed(2))
        : Number(price.toFixed(2))
      return merged
    }))
  }
  function removeLine(tempId: string) {
    setLines((prev) => prev.filter((l) => l.tempId !== tempId))
  }

  const totalValue = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0)
  const totalQty = lines.reduce((sum, l) => sum + (Number(l.totalQty) || 0), 0)

  // Mirrors create_invoice()'s own arithmetic. Preview only — the server
  // recomputes and locks the real figures at generation time.
  const commissionAmount = useMemo(() => {
    const rate = Number(commissionRate) || 0
    if (!selectedProfile || rate <= 0) return 0
    if (selectedProfile.agreementType === "2") return rate * totalQty
    // Type 3 charges its percentage on the reimbursed costs, not the goods.
    const base = selectedProfile.agreementType === "3" && pullExpenses
      ? Number(breakdown?.total.amount ?? 0)
      : totalValue
    return (base * rate) / 100
  }, [selectedProfile, commissionRate, totalQty, totalValue, pullExpenses, breakdown])

  const grandTotal = totalValue + commissionAmount

  // Conversions DIVIDE by the profile's rate, which reads "1 buyer = X supplier".
  const convertedTotal = useMemo(() => {
    const rate = Number(selectedProfile?.exchangeRate ?? 0)
    return rate > 0 ? grandTotal / rate : null
  }, [selectedProfile, grandTotal])

  const createMutation = useMutation({
    mutationFn: async () => {
      const hasBuyerDetails = buyerCompanyName || buyerIdNumber || buyerAddress || buyerCityCountry || buyerContactPerson || buyerPhone || buyerCustomFields.length > 0
      const payload = {
        sisterProfile,
        commissionRate,
        pullExpenses,
        lineItems: lines.map(({ tempId: _tempId, ...rest }) => rest),
        ...(hasBuyerDetails ? {
          buyerDetails: {
            companyName: buyerCompanyName,
            idNumber: buyerIdNumber,
            address: buyerAddress,
            cityCountry: buyerCityCountry,
            contactPerson: buyerContactPerson,
            phone: buyerPhone,
            customFields: buyerCustomFields.filter(f => f.label || f.value),
          },
        } : {}),
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
    if (lines.length === 0 && !pullExpenses) {
      setError("Select at least one Packing List or Warehouse Cost to pull line items from.")
      return
    }
    if (!(Number(commissionRate) > 0)) {
      setError(`Enter the ${agreement?.rateLabel.toLowerCase() ?? "agreement rate"} for this invoice.`)
      return
    }
    setError(null)
    createMutation.mutate()
  }

  return (
    <Dialog open onClose={onClose} title="New Invoice" className="max-w-4xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Sister Profile *</label>
          <Select
            required value={sisterProfile}
            onChange={(e) => { setSisterProfile(e.target.value); setSelectedLists(new Set()); setSelectedWarehouseCosts(new Set()); setLines([]) }}
          >
            <option value="">Select...</option>
            {profilesQuery.data?.map((sp) => (<option key={sp.id} value={sp.id}>{sp.poReference || sp.id} — {sp.buyerProfileName}</option>))}
          </Select>
        </div>

        {/* ── Buyer Details (printed top-left, after company banner) ─── */}
        <div className="rounded-md border border-slate-200 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Buyer / Consignee Details</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Company Name</label>
              <Input placeholder='e.g. LTD "LOXY"' value={buyerCompanyName} onChange={(e) => setBuyerCompanyName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">I/D No</label>
              <Input placeholder="e.g. 404853592" value={buyerIdNumber} onChange={(e) => setBuyerIdNumber(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Address</label>
              <Input placeholder="e.g. 2 PEKINI STREET" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">City / Country</label>
              <Input placeholder="e.g. TBILISI, GEORGIA" value={buyerCityCountry} onChange={(e) => setBuyerCityCountry(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Contact Person</label>
              <Input placeholder="e.g. Maka Tsartsidze" value={buyerContactPerson} onChange={(e) => setBuyerContactPerson(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
              <Input placeholder="e.g. +995 322363350" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
            </div>
          </div>

          {/* Custom fields */}
          {buyerCustomFields.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {buyerCustomFields.map((field, idx) => (
                <div key={idx} className="col-span-2 grid grid-cols-2 gap-2">
                  <Input placeholder="Custom label" value={field.label} onChange={(e) => {
                    const next = [...buyerCustomFields]; next[idx] = { ...next[idx], label: e.target.value }; setBuyerCustomFields(next)
                  }} />
                  <div className="flex gap-1">
                    <Input className="flex-1" placeholder="Custom value" value={field.value} onChange={(e) => {
                      const next = [...buyerCustomFields]; next[idx] = { ...next[idx], value: e.target.value }; setBuyerCustomFields(next)
                    }} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setBuyerCustomFields(buyerCustomFields.filter((_, i) => i !== idx))}>
                      <X className="h-3.5 w-3.5 text-slate-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button" variant="outline" size="sm" className="mt-2"
            onClick={() => setBuyerCustomFields([...buyerCustomFields, { label: "", value: "" }])}
          >
            <Plus className="h-3 w-3 mr-1" /> Add Custom Field
          </Button>
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

        {sisterProfile && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Warehouse Costs (optional)</label>
            {warehouseCostsQuery.isLoading ? (
              <p className="text-xs text-slate-400">Loading...</p>
            ) : !warehouseCostsQuery.data?.length ? (
              <p className="text-xs text-slate-400">No warehouse costs recorded yet for this Sister Profile.</p>
            ) : (
              <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 p-2">
                {warehouseCostsQuery.data.map((wc) => (
                  <label key={wc.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={selectedWarehouseCosts.has(wc.id)} onChange={() => toggleWarehouseCost(wc)} />
                    {wc.packingListReferenceCode ? (
                      <code className="text-xs text-indigo-600">{wc.packingListReferenceCode}</code>
                    ) : (
                      <span className="text-xs text-slate-400">(no packing list)</span>
                    )}
                    {" "}Total {Number(wc.totalCost).toLocaleString()}
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
                <th className="px-2 py-1.5 font-medium">Photo</th>
                <th className="px-2 py-1.5 font-medium">Description</th>
                <th className="px-2 py-1.5 font-medium">CTN</th>
                <th className="px-2 py-1.5 font-medium">Qty</th>
                <th className="px-2 py-1.5 font-medium">Unit Price ({sourceCurrency || "Supplier"})</th>
                <th className="px-2 py-1.5 font-medium">Amount ({sourceCurrency || "Supplier"})</th>
                <th className="px-2 py-1.5 font-medium text-indigo-600">Unit Price ({targetCurrency || "Buyer"})</th>
                <th className="px-2 py-1.5 font-medium text-indigo-600">Amount ({targetCurrency || "Buyer"})</th>
                <th className="px-2 py-1.5 font-medium">Remarks</th>
                <th className="w-8" />
              </tr></thead>
              <tbody>
                {lines.map((l) => {
                  const product = productsQuery.data?.find((p) => p.id === l.product)
                  const colorName = l.colorSizeNote.split(",")[0]?.trim()
                  const coverImage = product && product.images.length > 0 ? pickProductImage(product.images, colorName) : undefined
                  return (
                  <tr key={l.tempId} className="border-b border-slate-100 last:border-0">
                    <td className="p-1 text-center">
                      {coverImage && product ? (
                        <button
                          type="button"
                          title="View photos"
                          onClick={() => {
                            const ordered = [coverImage, ...product.images.filter((img) => img !== coverImage)]
                            setPhotoLightbox(ordered.map((img) => ({ src: resolveMediaUrl(img.image), label: img.customLabelName || img.label })))
                          }}
                          className="h-9 w-9 overflow-hidden rounded border border-slate-200 hover:ring-2 hover:ring-slate-300"
                        >
                          <img src={resolveMediaUrl(coverImage.image)} alt="" className="h-full w-full object-cover" />
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="p-1 text-slate-700">
                      {l.description} <span className="text-slate-400">({l.styleItemCode}{l.packingListRef ? ` / ${l.packingListRef}` : ""})</span>
                    </td>
                    <td className="p-1 text-center">{l.ctn}</td>
                    <td className="p-1 text-center">{l.totalQty}</td>
                    <td className="p-1"><Input className="h-7 w-24 text-xs" type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => updateLine(l.tempId, { unitPrice: Number(e.target.value) })} /></td>
                    <td className="p-1 text-center font-medium text-slate-700">{(Number(l.amount) || 0).toFixed(2)}</td>
                    <td className="p-1 text-center font-medium text-indigo-600">
                      {(() => {
                        const v = convertToBuyerCurrency(Number(l.unitPrice) || 0, selectedProfile?.exchangeRate)
                        return v === null ? "—" : v.toFixed(2)
                      })()}
                    </td>
                    <td className="p-1 text-center font-medium text-indigo-600">
                      {(() => {
                        const v = convertToBuyerCurrency(Number(l.amount) || 0, selectedProfile?.exchangeRate)
                        return v === null ? "—" : v.toFixed(2)
                      })()}
                    </td>
                    <td className="p-1"><Input className="h-7 w-32 text-xs" value={l.remarks} onChange={(e) => updateLine(l.tempId, { remarks: e.target.value })} /></td>
                    <td className="p-1 text-center"><button type="button" onClick={() => removeLine(l.tempId)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {photoLightbox && <Lightbox images={photoLightbox} initialIndex={0} onClose={() => setPhotoLightbox(null)} />}

        {/* ── Agreement charge + the costs behind it ──────────────────── */}
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-slate-200 p-3">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Agreement charge</h3>
              {agreement ? (
                <>
                  <p className="mb-3 text-xs leading-relaxed text-slate-500">{agreement.explanation}</p>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{agreement.rateLabel} *</label>
                  <div className="relative w-48">
                    <Input
                      required type="number" min={0} step="0.01" value={commissionRate}
                      onChange={(e) => setCommissionRate(e.target.value)}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                      {agreement.rateSuffix}
                    </span>
                  </div>
                  {selectedProfile?.agreementType === "3" && (
                    <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox" className="mt-0.5 h-3.5 w-3.5"
                        checked={pullExpenses} onChange={(e) => setPullExpenses(e.target.checked)}
                      />
                      <span>
                        Add every recorded cost on this order as a reimbursement line, and base the commission on
                        that cost total. Nothing marks a cost as already billed — check the lines before submitting
                        if you have invoiced this order before.
                      </span>
                    </label>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-400">Select a Sister Profile to see its agreement.</p>
              )}
            </div>

            <div className="grid grid-cols-4 gap-4 rounded-md bg-slate-50 px-4 py-3 text-sm">
              <div>
                <span className="text-slate-500">Line Total</span>
                <div className="font-semibold text-slate-900">{totalValue.toFixed(2)} {sourceCurrency}</div>
              </div>
              <div>
                <span className="text-slate-500">Agreement charge</span>
                <div className="font-semibold text-slate-900">{commissionAmount.toFixed(2)} {sourceCurrency}</div>
              </div>
              <div>
                <span className="text-slate-500">Total Value ({sourceCurrency || "Supplier"})</span>
                <div className="font-semibold text-slate-900">{grandTotal.toFixed(2)} {sourceCurrency}</div>
              </div>
              <div>
                <span className="text-slate-500">Total Value ({targetCurrency || "Buyer"})</span>
                <div className="font-semibold text-indigo-600">
                  {convertedTotal === null ? "—" : `${convertedTotal.toFixed(2)} ${targetCurrency}`}
                </div>
              </div>
            </div>
          </div>

          {/* Where this order's money has already gone — the figures behind
              the charge, so the operator can sanity-check it before issuing. */}
          <aside className="rounded-md border border-slate-200 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recorded costs</h3>
            {!sisterProfile ? (
              <p className="text-xs text-slate-400">Select a Sister Profile.</p>
            ) : breakdownQuery.isLoading ? (
              <div className="flex justify-center py-4"><Spinner className="text-slate-400" /></div>
            ) : !breakdown ? (
              <p className="text-xs text-slate-400">No costs recorded yet.</p>
            ) : (
              <dl className="flex flex-col gap-2 text-xs">
                {(["sourcing", "warehouse", "qc", "other"] as const).map((group) => (
                  <div key={group} className="flex items-baseline justify-between gap-2">
                    <dt className="capitalize text-slate-500">{group}</dt>
                    <dd className="text-right">
                      <div className="font-medium text-slate-900">
                        {Number(breakdown.groups[group].amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        {breakdown.supplierCurrency}
                      </div>
                      <div className="text-slate-400">
                        {Number(breakdown.groups[group].amountBuyer).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        {breakdown.buyerCurrency}
                      </div>
                    </dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-2">
                  <dt className="font-medium text-slate-700">Total</dt>
                  <dd className="text-right">
                    <div className="font-semibold text-slate-900">
                      {Number(breakdown.total.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                      {breakdown.supplierCurrency}
                    </div>
                    <div className="text-slate-400">
                      {Number(breakdown.total.amountBuyer).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                      {breakdown.buyerCurrency}
                    </div>
                  </dd>
                </div>
                {!!breakdown.units.totalOrderQty && (
                  <div className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-2">
                    <dt className="text-slate-500">Per piece</dt>
                    <dd className="text-right text-slate-900">
                      {breakdown.units.unitCost == null
                        ? "—"
                        : `${Number(breakdown.units.unitCost).toFixed(2)} ${breakdown.supplierCurrency}`}
                      <span className="block text-slate-400">{breakdown.units.totalOrderQty.toLocaleString()} pcs</span>
                    </dd>
                  </div>
                )}
                {breakdown.rateLabel && (
                  <p className="border-t border-slate-100 pt-2 text-slate-400">{breakdown.rateLabel}</p>
                )}
              </dl>
            )}
          </aside>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Submitting..." : "Submit for Approval"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

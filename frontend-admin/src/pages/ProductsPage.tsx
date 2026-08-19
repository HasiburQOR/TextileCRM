import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Camera, Eye, FileImage, Pencil, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AddColumnDialog, ColumnCellInput, blankValuesForColumns, columnsFromTemplateFields, getCellValue, setCellValue } from "@/components/sourcing/GridColumns"
import { SizeBreakdownInput, emptySizeBreakdownRows, sizeRowsClean, sizeRowsTotalQty } from "@/components/packing/SizeBreakdownInput"
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
import { resolveMediaUrl } from "@/lib/media"
import { PRODUCT_STATUS_BADGE_VARIANT, PRODUCT_STATUS_LABEL } from "@/lib/status"
import { nextStyleNo } from "@/lib/style-no"
import type { Paginated } from "@/types/api"
import type { Product, ProductCreateInput, ProductStatus, ProductVariantInput, SisterProfile } from "@/types/sourcing"
import type { ProductTemplate, ProductTemplateFieldEntry } from "@/types/templates"

const CUBIC_INCHES_PER_CBM = 61023.7441

type VariantRowDraft = ProductVariantInput & { tempId: string; imageFile: File | null }

function computeVariantDerived(row: VariantRowDraft) {
  const pcsPerCarton = sizeRowsTotalQty(row.sizeBreakdown)
  const noOfCartons =
    row.cartonNoFrom != null && row.cartonNoTo != null && row.cartonNoTo >= row.cartonNoFrom
      ? row.cartonNoTo - row.cartonNoFrom + 1
      : 0
  const totalPcs = pcsPerCarton * noOfCartons
  // Buy price is per piece, flat across the color's sizes — Amount is
  // always TTL PCS x Unit Price (mirrors compute_variant_derived).
  const totalAmount = totalPcs * (row.unitPrice ?? 0)
  const totalGrossWeight = (row.grossWeight ?? 0) * noOfCartons
  const totalNetWeight = (row.netWeight ?? 0) * noOfCartons
  const cubicInches = (row.ctnLength ?? 0) * (row.ctnWidth ?? 0) * (row.ctnHeight ?? 0)
  const cbm = cubicInches > 0 ? cubicInches / CUBIC_INCHES_PER_CBM : 0
  const totalCbm = cbm * noOfCartons
  return { pcsPerCarton, noOfCartons, totalPcs, totalAmount, totalGrossWeight, totalNetWeight, cbm, totalCbm }
}

const STATUS_FILTER_OPTIONS: { value: ProductStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "sourcing_trip_open", label: PRODUCT_STATUS_LABEL.sourcing_trip_open },
  { value: "pending_admin_approval", label: PRODUCT_STATUS_LABEL.pending_admin_approval },
  { value: "rejected", label: PRODUCT_STATUS_LABEL.rejected },
  { value: "approved_for_qc", label: PRODUCT_STATUS_LABEL.approved_for_qc },
  { value: "in_warehouse", label: PRODUCT_STATUS_LABEL.in_warehouse },
  { value: "ready_for_final_qc", label: PRODUCT_STATUS_LABEL.ready_for_final_qc },
  { value: "completed", label: PRODUCT_STATUS_LABEL.completed },
]

const CAN_CREATE_ROLES = ["admin", "company_rep"]

function emptyVariant(prevCartonTo: number | null | undefined, columns: ProductTemplateFieldEntry[]): VariantRowDraft {
  const nextFrom = prevCartonTo != null ? prevCartonTo + 1 : 1
  return {
    tempId: crypto.randomUUID(),
    colorName: "", patternNo: "", orderQty: 0, sizeBreakdown: emptySizeBreakdownRows(),
    customFieldValues: blankValuesForColumns(columns),
    innerBundle: 1,
    cartonNoFrom: nextFrom, cartonNoTo: nextFrom,
    unitPrice: null,
    grossWeight: null, netWeight: null, ctnLength: null, ctnWidth: null, ctnHeight: null,
    imageFile: null,
  }
}

function variantToDraft(v: Product["variants"][number]): VariantRowDraft {
  return {
    tempId: crypto.randomUUID(),
    colorName: v.colorName,
    patternNo: v.patternNo,
    orderQty: v.orderQty,
    sizeBreakdown: v.sizeBreakdown.map((e) => ({ ...e })),
    customFieldValues: v.customFieldValues.map((e) => ({ ...e })),
    innerBundle: v.innerBundle,
    cartonNoFrom: v.cartonNoFrom,
    cartonNoTo: v.cartonNoTo,
    unitPrice: v.unitPrice != null ? Number(v.unitPrice) : null,
    grossWeight: v.grossWeight,
    netWeight: v.netWeight,
    ctnLength: v.ctnLength,
    ctnWidth: v.ctnWidth,
    ctnHeight: v.ctnHeight,
    imageFile: null,
  }
}

const DEFAULT_VARIANT_ROWS = 1

export function ProductsPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<ProductStatus | "all">("all")
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [viewTarget, setViewTarget] = useState<Product | null>(null)
  const [editTarget, setEditTarget] = useState<Product | null>(null)

  const productsQuery = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>("/products/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/products/${id}/`) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      setDeleteTarget(null)
      setDeleteError(null)
    },
    onError: (err: unknown) => setDeleteError(extractErrorMessage(err)),
  })

  const filtered = useMemo(() => {
    const rows = productsQuery.data ?? []
    return rows.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        return p.name.toLowerCase().includes(q) || p.styleNumber.toLowerCase().includes(q) || p.brandName.toLowerCase().includes(q)
      }
      return true
    })
  }, [productsQuery.data, statusFilter, search])

  const canCreate = !!user && CAN_CREATE_ROLES.includes(user.role)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sourcing Intake</h1>
          <p className="text-sm text-slate-500">Every sourcing request, its color/size breakdown, and current status.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Product
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search name, style #, brand…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProductStatus | "all")} className="max-w-56">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {productsQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner className="text-slate-400" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No sourcing requests match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Style #</th>
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">Brand</th>
                    <th className="px-4 py-2.5 font-medium">Sister Profile PO</th>
                    <th className="px-4 py-2.5 font-medium">Order Qty</th>
                    <th className="px-4 py-2.5 font-medium">Packing List</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Created</th>
                    <th className="px-4 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                      onClick={() => navigate(`/products/${p.id}`)}
                    >
                      <td className="px-4 py-2.5">
                        <code className="text-xs text-slate-500">{p.styleNumber}</code>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{p.name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.brandName}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.sisterProfilePoReference}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.totalOrderQty}</td>
                      <td className="px-4 py-2.5">
                        {p.packingCartonCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600" title={`${p.packingCartonCount} carton row(s) in the Packing List module`}>
                            <FileImage className="h-4 w-4" /> {p.packingCartonCount}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={PRODUCT_STATUS_BADGE_VARIANT[p.status]}>{PRODUCT_STATUS_LABEL[p.status]}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm" variant="ghost" title="View"
                            onClick={(e) => { e.stopPropagation(); setViewTarget(p) }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {user?.role === "admin" && (
                            <>
                              <Button
                                size="sm" variant="ghost" title="Edit"
                                onClick={(e) => { e.stopPropagation(); setEditTarget(p) }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm" variant="ghost" title="Delete"
                                className="text-red-500 hover:text-red-700"
                                onClick={(e) => { e.stopPropagation(); setDeleteError(null); setDeleteTarget(p) }}
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
            </div>
          )}
        </CardContent>
      </Card>

      {createOpen && <CreateProductDialog onClose={() => setCreateOpen(false)} />}

      {viewTarget && <ViewProductDialog product={viewTarget} onClose={() => setViewTarget(null)} />}

      {editTarget && <EditProductDialog product={editTarget} onClose={() => setEditTarget(null)} />}

      {deleteTarget && (
        <Dialog open onClose={() => setDeleteTarget(null)} title={`Delete "${deleteTarget.name}"?`}>
          <div className="flex flex-col gap-4">
            {deleteError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</div>}
            <p className="text-sm text-slate-600">
              This permanently removes <code className="text-xs">{deleteTarget.styleNumber}</code> and cannot be undone.
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

function CreateProductDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const sisterProfilesQuery = useQuery({
    queryKey: ["sister-profiles", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const templatesQuery = useQuery({
    queryKey: ["product-templates", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ProductTemplate>>("/product-templates/", { params: { page_size: 200, isActive: true } })
      return data.results
    },
  })

  const [styleNumber, setStyleNumber] = useState(nextStyleNo)
  const [sisterProfile, setSisterProfile] = useState("")
  const [name, setName] = useState("")
  const [brandName, setBrandName] = useState("")
  const [material, setMaterial] = useState("")
  const [poNo, setPoNo] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [columns, setColumns] = useState<ProductTemplateFieldEntry[]>([])
  const [variants, setVariants] = useState<VariantRowDraft[]>(
    Array.from({ length: DEFAULT_VARIANT_ROWS }, () => emptyVariant(null, [])),
  )
  const [error, setError] = useState<string | null>(null)

  function handleTemplateChange(id: string) {
    setTemplateId(id)
    const template = templatesQuery.data?.find((t) => t.id === id)
    // Choosing a template reshapes the grid itself: its fields become real
    // columns (one value per color row), replacing whatever columns were
    // active before — matches "mix and match, create a template and reuse it."
    const newColumns = template ? columnsFromTemplateFields(template.fields) : []
    setColumns(newColumns)
    setVariants((prev) => prev.map((v) => ({ ...v, customFieldValues: blankValuesForColumns(newColumns) })))
  }

  function addColumn(column: ProductTemplateFieldEntry) {
    setColumns((prev) => [...prev, column])
    setVariants((prev) => prev.map((v) => ({ ...v, customFieldValues: setCellValue(v.customFieldValues, column, "") })))
  }

  const createMutation = useMutation({
    mutationFn: async (payload: ProductCreateInput) => {
      const { data: product } = await api.post<Product>("/products/", payload)
      for (const v of variants) {
        if (v.imageFile) {
          const imgForm = new FormData()
          imgForm.append("image", v.imageFile)
          imgForm.append("label", "custom")
          imgForm.append("customLabelName", v.colorName.trim() || `Color ${variants.indexOf(v) + 1}`)
          await api.post(`/products/${product.id}/upload_image/`, imgForm, {
            headers: { "Content-Type": "multipart/form-data" },
          })
        }
      }
      return product
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      onClose()
      navigate(`/products/${product.id}`)
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const cleanVariants = variants
      .filter((v) => v.colorName.trim())
      .map(({ tempId: _tempId, imageFile: _imageFile, sizeBreakdown, ...rest }) => ({
        ...rest,
        sizeBreakdown: sizeRowsClean(sizeBreakdown),
      }))
    if (!sisterProfile) {
      setError("Sister Profile is required.")
      return
    }
    if (cleanVariants.length === 0) {
      setError("Add at least one row with a color name.")
      return
    }
    createMutation.mutate({
      sisterProfile,
      styleNumber,
      name,
      brandName: brandName || "NA",
      poNo,
      material,
      template: templateId || null,
      resolvedTemplateFields: columns,
      variants: cleanVariants,
    })
  }

  return (
    <Dialog open onClose={onClose} title="New Sourcing Request" className="max-w-[98vw] xl:max-w-[92vw] xl:max-h-[95vh]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

        <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-3">
          <label className="text-xs font-medium text-slate-600">Product Template</label>
          <Select value={templateId} onChange={(e) => handleTemplateChange(e.target.value)} className="max-w-sm">
            <option value="">Custom (no template — core fields only)</option>
            {templatesQuery.data?.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </Select>
          <p className="text-[11px] text-slate-400">
            Choosing a template adds its fields as real columns in the grid below — one value per color row. You can
            still add one-off columns with "Add Column" either way, and reuse this template on future products.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label className="text-xs font-medium text-slate-600">Style No *</label>
            <div className="flex items-center gap-2">
              <Input className="flex-1" value={styleNumber} onChange={(e) => setStyleNumber(e.target.value)} required />
              <Button type="button" variant="outline" size="sm" onClick={() => setStyleNumber(nextStyleNo())}>
                Regenerate
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label className="text-xs font-medium text-slate-600">Sister Profile *</label>
            <Select value={sisterProfile} onChange={(e) => setSisterProfile(e.target.value)} required>
              <option value="">Select…</option>
              {sisterProfilesQuery.data?.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.buyerProfileName} — {sp.poReference}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">PO No</label>
            <Input value={poNo} onChange={(e) => setPoNo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label className="text-xs font-medium text-slate-600">Product Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label className="text-xs font-medium text-slate-600">Brand Name</label>
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="NA" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">Material</label>
            <Input
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder="e.g. 100% Cotton"
              title="Goods composition - pre-fills the Material column on invoices generated from this product."
            />
          </div>
        </div>


        <VariantRowsEditor
          variants={variants}
          columns={columns}
          onChange={setVariants}
          onAddColumn={addColumn}
          onAddRow={() => setVariants((prev) => [...prev, emptyVariant(prev[prev.length - 1]?.cartonNoTo, columns)])}
          sisterProfile={sisterProfilesQuery.data?.find((sp) => sp.id === sisterProfile)}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create Product"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function VariantRowsEditor({ variants, columns, onChange, onAddColumn, onAddRow, sisterProfile }: {
  variants: VariantRowDraft[]
  columns: ProductTemplateFieldEntry[]
  onChange: (rows: VariantRowDraft[]) => void
  onAddColumn: (column: ProductTemplateFieldEntry) => void
  onAddRow: () => void
  sisterProfile?: SisterProfile
}) {
  const [addColumnOpen, setAddColumnOpen] = useState(false)

  function updateVariant(index: number, patch: Partial<VariantRowDraft>) {
    onChange(variants.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  function removeVariant(index: number) {
    onChange(variants.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-slate-600">Per-Color Packing Detail (one row per color)</label>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setAddColumnOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add Column
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onAddRow}>
            <Plus className="h-3.5 w-3.5" />
            Add Row
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Each row is exactly one color — upload an image per color for reference. It has its own Order Qty, size breakdown, weights, and carton range, so it's always
        clear how much of which color is packed how. Weights, carton dimensions, and carton numbers can be left blank
        now and completed later in the Packing List module.
      </p>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <th className="px-3 py-2 font-medium">Color</th>
              <th className="px-3 py-2 font-medium">Pattern No</th>
              <th className="px-3 py-2 font-medium">Order Qty</th>
              <th className="px-3 py-2 font-medium">Color Image</th>
              <th className="px-3 py-2 font-medium">Size Breakdown (per carton)</th>
              <th className="px-3 py-2 font-medium">PC/CTN</th>
              <th className="px-3 py-2 font-medium">Inner Bdl</th>
              <th className="px-3 py-2 font-medium">CTN From</th>
              <th className="px-3 py-2 font-medium">CTN To</th>
              <th className="px-3 py-2 font-medium">CTNS</th>
              <th className="px-3 py-2 font-medium">TTL PCS</th>
              <th className="px-3 py-2 font-medium">Unit Price ({sisterProfile?.supplierCurrency || "Supplier"})</th>
              <th className="px-3 py-2 font-medium">Amount ({sisterProfile?.supplierCurrency || "Supplier"})</th>
              <th className="px-3 py-2 font-medium text-indigo-600">Unit Price ({sisterProfile?.buyerCurrency || "Buyer"})</th>
              <th className="px-3 py-2 font-medium text-indigo-600">Amount ({sisterProfile?.buyerCurrency || "Buyer"})</th>
              <th className="px-3 py-2 font-medium">G.W(kg)</th>
              <th className="px-3 py-2 font-medium">N.W(kg)</th>
              <th className="px-3 py-2 font-medium">TTL G.W</th>
              <th className="px-3 py-2 font-medium">TTL N.W</th>
              <th className="px-3 py-2 font-medium">L(in)</th>
              <th className="px-3 py-2 font-medium">W(in)</th>
              <th className="px-3 py-2 font-medium">H(in)</th>
              <th className="px-3 py-2 font-medium">CBM</th>
              <th className="px-3 py-2 font-medium">TTL CBM</th>
              {columns.map((c) => (
                <th key={c.id} className="px-3 py-2 font-medium text-indigo-600">{c.label}</th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {variants.map((row, i) => {
              const d = computeVariantDerived(row)
              return (
                <tr key={row.tempId} className="border-b border-slate-100 last:border-0">
                  <td className="p-1.5">
                    <Input
                      className="h-9 w-32 text-sm" placeholder="Color name"
                      value={row.colorName} onChange={(e) => updateVariant(i, { colorName: e.target.value })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Input className="h-9 w-28 text-sm" value={row.patternNo} onChange={(e) => updateVariant(i, { patternNo: e.target.value })} />
                  </td>
                  <td className="p-1.5">
                    <Input className="h-9 w-20 text-sm" type="number" min={0} value={row.orderQty || ""} onChange={(e) => updateVariant(i, { orderQty: Number(e.target.value) || 0 })} />
                  </td>
                  <td className="p-1.5">
                    {row.imageFile ? (
                      <div className="relative group">
                        <img src={URL.createObjectURL(row.imageFile)} alt={row.colorName || "Color"} className="h-10 w-14 rounded object-cover border border-slate-200" />
                        <button
                          type="button"
                          onClick={() => updateVariant(i, { imageFile: null })}
                          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label className="flex h-10 w-14 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors">
                        <Camera className="h-4 w-4" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) updateVariant(i, { imageFile: file })
                          }}
                        />
                      </label>
                    )}
                  </td>
                  <td className="p-1.5">
                    <SizeBreakdownInput rows={row.sizeBreakdown} onChange={(sb) => updateVariant(i, { sizeBreakdown: sb })} />
                  </td>
                  <td className="p-1.5 text-center text-sm font-medium text-slate-600">{d.pcsPerCarton}</td>
                  <td className="p-1.5">
                    <Input className="h-9 w-20 text-sm" type="number" min={1} value={row.innerBundle} onChange={(e) => updateVariant(i, { innerBundle: Number(e.target.value) || 1 })} />
                  </td>
                  <td className="p-1.5">
                    <Input className="h-9 w-20 text-sm" type="number" min={1} value={row.cartonNoFrom ?? ""} onChange={(e) => updateVariant(i, { cartonNoFrom: e.target.value ? Number(e.target.value) : null })} />
                  </td>
                  <td className="p-1.5">
                    <Input className="h-9 w-20 text-sm" type="number" min={1} value={row.cartonNoTo ?? ""} onChange={(e) => updateVariant(i, { cartonNoTo: e.target.value ? Number(e.target.value) : null })} />
                  </td>
                  <td className="p-1.5 text-center text-sm font-medium text-slate-600">{d.noOfCartons}</td>
                  <td className="p-1.5 text-center text-sm font-medium text-slate-600">{d.totalPcs}</td>
                  <td className="p-1.5">
                    <Input
                      className="h-9 w-24 text-sm" type="number" step="0.01" min={0} max={99999999}
                      placeholder="—"
                      title="Buy unit price per piece — same for every size in this color. Amount = TTL PCS × Unit Price."
                      value={row.unitPrice ?? ""}
                      onChange={(e) => updateVariant(i, { unitPrice: e.target.value ? Number(e.target.value) : null })}
                    />
                  </td>
                  <td className="p-1.5 text-center text-sm font-medium text-slate-600">{d.totalAmount.toFixed(2)}</td>
                  <td className="p-1.5 text-center text-sm font-medium text-indigo-600">
                    {(() => {
                      const v = convertToBuyerCurrency(row.unitPrice, sisterProfile?.exchangeRate)
                      return v === null ? "—" : v.toFixed(2)
                    })()}
                  </td>
                  <td className="p-1.5 text-center text-sm font-medium text-indigo-600">
                    {(() => {
                      const v = convertToBuyerCurrency(d.totalAmount, sisterProfile?.exchangeRate)
                      return v === null ? "—" : v.toFixed(2)
                    })()}
                  </td>
                  <td className="p-1.5">
                    <Input className="h-9 w-20 text-sm" type="number" step="0.01" min={0} max={999999} value={row.grossWeight ?? ""} onChange={(e) => updateVariant(i, { grossWeight: e.target.value ? Number(e.target.value) : null })} />
                  </td>
                  <td className="p-1.5">
                    <Input className="h-9 w-20 text-sm" type="number" step="0.01" min={0} max={999999} value={row.netWeight ?? ""} onChange={(e) => updateVariant(i, { netWeight: e.target.value ? Number(e.target.value) : null })} />
                  </td>
                  <td className="p-1.5 text-center text-sm font-medium text-slate-600">{d.totalGrossWeight.toFixed(2)}</td>
                  <td className="p-1.5 text-center text-sm font-medium text-slate-600">{d.totalNetWeight.toFixed(2)}</td>
                  <td className="p-1.5">
                    <Input className="h-9 w-16 text-sm" type="number" step="0.01" min={0} max={999999} value={row.ctnLength ?? ""} onChange={(e) => updateVariant(i, { ctnLength: e.target.value ? Number(e.target.value) : null })} />
                  </td>
                  <td className="p-1.5">
                    <Input className="h-9 w-16 text-sm" type="number" step="0.01" min={0} max={999999} value={row.ctnWidth ?? ""} onChange={(e) => updateVariant(i, { ctnWidth: e.target.value ? Number(e.target.value) : null })} />
                  </td>
                  <td className="p-1.5">
                    <Input className="h-9 w-16 text-sm" type="number" step="0.01" min={0} max={999999} value={row.ctnHeight ?? ""} onChange={(e) => updateVariant(i, { ctnHeight: e.target.value ? Number(e.target.value) : null })} />
                  </td>
                  <td className="p-1.5 text-center text-sm font-medium text-slate-600">{d.cbm.toFixed(4)}</td>
                  <td className="p-1.5 text-center text-sm font-medium text-slate-600">{d.totalCbm.toFixed(4)}</td>
                  {columns.map((c) => (
                    <td key={c.id} className="p-1">
                      <ColumnCellInput
                        column={c}
                        value={getCellValue(row.customFieldValues, c)}
                        onChange={(v) => updateVariant(i, { customFieldValues: setCellValue(row.customFieldValues, c, v) })}
                      />
                    </td>
                  ))}
                  <td className="p-1 text-center">
                    {variants.length > 1 && (
                      <button type="button" onClick={() => removeVariant(i)} className="text-slate-400 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
        <span>Total Order Qty: <strong>{variants.reduce((s, v) => s + v.orderQty, 0)}</strong></span>
        <span>Total Cartons: <strong>{variants.reduce((s, v) => s + computeVariantDerived(v).noOfCartons, 0)}</strong></span>
        <span>Total CBM: <strong>{variants.reduce((s, v) => s + computeVariantDerived(v).totalCbm, 0).toFixed(4)}</strong></span>
        <span>Total Amount: <strong>{variants.reduce((s, v) => s + computeVariantDerived(v).totalAmount, 0).toFixed(2)} {sisterProfile?.supplierCurrency}</strong></span>
        {(() => {
          const total = convertToBuyerCurrency(variants.reduce((s, v) => s + computeVariantDerived(v).totalAmount, 0), sisterProfile?.exchangeRate)
          return total === null ? null : (
            <span>Total Amount ({sisterProfile?.buyerCurrency}): <strong className="text-indigo-600">{total.toFixed(2)}</strong></span>
          )
        })()}
      </div>
      {addColumnOpen && (
        <AddColumnDialog
          onClose={() => setAddColumnOpen(false)}
          onAdd={(column) => { onAddColumn(column); setAddColumnOpen(false) }}
        />
      )}
    </div>
  )
}

function ViewProductDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const isPackingListImage = product.factoryPackingList ? /\.(png|jpe?g|gif|webp)$/i.test(product.factoryPackingList) : false
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const galleryImages: LightboxImage[] = [
    ...(product.factoryPackingList && isPackingListImage
      ? [{ src: resolveMediaUrl(product.factoryPackingList), label: "Factory Packing List" }]
      : []),
    ...product.images.map((img) => ({ src: resolveMediaUrl(img.image), label: img.customLabelName || img.label })),
  ]
  const packingListLightboxIndex = product.factoryPackingList && isPackingListImage ? 0 : null
  const galleryStartIndex = packingListLightboxIndex !== null ? 1 : 0
  const columns = product.resolvedTemplateFields

  return (
    <Dialog open onClose={onClose} title="Product Details" className="max-w-[95vw] xl:max-w-6xl">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold text-slate-900">{product.name}</h3>
          <Badge variant={PRODUCT_STATUS_BADGE_VARIANT[product.status]}>{PRODUCT_STATUS_LABEL[product.status]}</Badge>
        </div>

        {product.status === "rejected" && product.rejectionReason && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="font-medium">Rejected:</span> {product.rejectionReason}
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Style No" value={product.styleNumber} />
          <Field label="Sister Profile PO" value={product.sisterProfilePoReference} />
          <Field label="Brand Name" value={product.brandName} />
          <Field label="PO No" value={product.poNo || "—"} />
          <Field label="Material" value={product.material || "—"} />
          <Field label="Goods Name" value={product.goodsName || "—"} />
          <Field label="Fabric Details" value={product.fabricDetails || "—"} />
          <Field label="Final Price" value={product.finalPrice ?? "—"} />
          <Field label="Total Order Qty" value={String(product.totalOrderQty)} />
          <Field label="Created By" value={product.createdByName || "—"} />
          <Field label="Created" value={new Date(product.createdAt).toLocaleString()} />
          <Field label="Template" value={product.templateName || "Custom (no template)"} />
          {product.reviewedByName && (
            <Field
              label="Reviewed By"
              value={`${product.reviewedByName}${product.reviewedAt ? ` on ${new Date(product.reviewedAt).toLocaleString()}` : ""}`}
            />
          )}
        </div>

        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Per-Color Packing Detail ({product.totalOrderQty} pcs total)
          </h4>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-medium">Color</th>
                  <th className="px-3 py-2 font-medium">Pattern No</th>
                  <th className="px-3 py-2 font-medium">Order Qty</th>
                  <th className="px-3 py-2 font-medium">Size Breakdown</th>
                  <th className="px-3 py-2 font-medium">PC/CTN</th>
                  <th className="px-3 py-2 font-medium">Cartons</th>
                  <th className="px-3 py-2 font-medium">TTL PCS</th>
                  <th className="px-3 py-2 font-medium">Unit Price</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">TTL G.W</th>
                  <th className="px-3 py-2 font-medium">TTL N.W</th>
                  <th className="px-3 py-2 font-medium">CBM</th>
                  {columns.map((c) => (
                    <th key={c.id} className="px-3 py-2 font-medium text-indigo-500">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {product.variants.length === 0 ? (
                  <tr>
                    <td colSpan={12 + columns.length} className="px-3 py-6 text-center text-sm text-slate-400">
                      No color rows recorded.
                    </td>
                  </tr>
                ) : (
                  product.variants.map((v) => (
                    <tr key={v.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-medium text-slate-900">{v.colorName || "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{v.patternNo || "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{v.orderQty}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {v.sizeBreakdown.length === 0
                          ? "—"
                          : v.sizeBreakdown.map((e) => `${e.size_label}:${e.quantity}`).join(" / ")}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{v.pcsPerCarton}</td>
                      <td className="px-3 py-2 text-slate-500">{v.noOfCartons}</td>
                      <td className="px-3 py-2 text-slate-500">{v.totalPcs}</td>
                      <td className="px-3 py-2 text-slate-500">{v.unitPrice != null ? Number(v.unitPrice).toFixed(2) : "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{Number(v.totalAmount).toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-500">{Number(v.totalGrossWeight).toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-500">{Number(v.totalNetWeight).toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-500">{Number(v.totalCbm).toFixed(4)}</td>
                      {columns.map((c) => (
                        <td key={c.id} className="px-3 py-2 text-slate-500">{getCellValue(v.customFieldValues, c) || "—"}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Factory Packing List</h4>
            {product.factoryPackingList ? (
              isPackingListImage ? (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(packingListLightboxIndex)}
                  className="block w-full overflow-hidden rounded-md border border-slate-200"
                >
                  <img src={resolveMediaUrl(product.factoryPackingList)} alt="Factory packing list" className="h-40 w-full object-cover" />
                </button>
              ) : (
                <a
                  href={resolveMediaUrl(product.factoryPackingList)}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-md border border-slate-200"
                >
                  <div className="flex h-40 w-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400">
                    <FileImage className="h-8 w-8" />
                    <span className="text-xs">View file</span>
                  </div>
                </a>
              )
            ) : (
              <div className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 text-slate-400">
                <FileImage className="h-8 w-8" />
                <span className="text-xs">Not attached yet</span>
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Photo Gallery</h4>
            {product.images.length === 0 ? (
              <p className="text-sm text-slate-400">No photos uploaded yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {product.images.map((img, i) => (
                  <button
                    type="button"
                    key={img.id}
                    onClick={() => setLightboxIndex(galleryStartIndex + i)}
                    className="overflow-hidden rounded-md border border-slate-200"
                  >
                    <img src={resolveMediaUrl(img.image)} alt={img.customLabelName || img.label} className="h-20 w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {lightboxIndex !== null && (
        <Lightbox images={galleryImages} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </Dialog>
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

function EditProductDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const queryClient = useQueryClient()

  const sisterProfilesQuery = useQuery({
    queryKey: ["sister-profiles", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const [form, setForm] = useState({
    sisterProfile: product.sisterProfile,
    styleNumber: product.styleNumber,
    name: product.name,
    brandName: product.brandName,
    poNo: product.poNo,
    material: product.material,
  })
  const [columns, setColumns] = useState<ProductTemplateFieldEntry[]>(product.resolvedTemplateFields)
  const [variants, setVariants] = useState<VariantRowDraft[]>(
    product.variants.length ? product.variants.map(variantToDraft) : [emptyVariant(null, product.resolvedTemplateFields)],
  )
  const [error, setError] = useState<string | null>(null)

  function addColumn(column: ProductTemplateFieldEntry) {
    setColumns((prev) => [...prev, column])
    setVariants((prev) => prev.map((v) => ({ ...v, customFieldValues: setCellValue(v.customFieldValues, column, "") })))
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      const cleanVariants = variants
        .filter((v) => v.colorName.trim())
        .map(({ tempId: _tempId, imageFile: _imageFile, sizeBreakdown, ...rest }) => ({
          ...rest,
          sizeBreakdown: sizeRowsClean(sizeBreakdown),
        }))
      const { data } = await api.patch<Product>(`/products/${product.id}/`, {
        ...form,
        resolvedTemplateFields: columns,
        variants: cleanVariants,
      })
      // Upload any new per-color images
      for (const v of variants) {
        if (v.imageFile) {
          const imgForm = new FormData()
          imgForm.append("image", v.imageFile)
          imgForm.append("label", "custom")
          imgForm.append("customLabelName", v.colorName.trim() || `Color ${variants.indexOf(v) + 1}`)
          await api.post(`/products/${product.id}/upload_image/`, imgForm, {
            headers: { "Content-Type": "multipart/form-data" },
          })
        }
      }
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["products", product.id], data)
      queryClient.invalidateQueries({ queryKey: ["products", "all"] })
      onClose()
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    updateMutation.mutate()
  }

  return (
    <Dialog open onClose={onClose} title="Edit Product" className="max-w-[95vw] xl:max-w-7xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label className="text-xs font-medium text-slate-600">Style No *</label>
            <Input value={form.styleNumber} onChange={(e) => setForm({ ...form, styleNumber: e.target.value })} required />
          </div>
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label className="text-xs font-medium text-slate-600">Sister Profile *</label>
            <Select value={form.sisterProfile} onChange={(e) => setForm({ ...form, sisterProfile: e.target.value })} required>
              <option value="">Select…</option>
              {sisterProfilesQuery.data?.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.buyerProfileName} — {sp.poReference}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">PO No</label>
            <Input value={form.poNo} onChange={(e) => setForm({ ...form, poNo: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label className="text-xs font-medium text-slate-600">Product Name *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label className="text-xs font-medium text-slate-600">Brand Name</label>
            <Input value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} placeholder="NA" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">Material</label>
            <Input value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} placeholder="e.g. 100% Cotton" />
          </div>
        </div>

        {product.templateName && (
          <p className="text-xs text-slate-400">Template: <span className="font-medium text-slate-600">{product.templateName}</span></p>
        )}

        <VariantRowsEditor
          variants={variants}
          columns={columns}
          onChange={setVariants}
          onAddColumn={addColumn}
          onAddRow={() => setVariants((prev) => [...prev, emptyVariant(prev[prev.length - 1]?.cartonNoTo, columns)])}
          sisterProfile={sisterProfilesQuery.data?.find((sp) => sp.id === form.sisterProfile)}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

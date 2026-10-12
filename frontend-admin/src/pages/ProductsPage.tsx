import { VariantCodeCell } from "@/components/VariantCodeCell"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Camera, Copy, Eye, FileImage, Info, Pencil, Plus, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
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
import { SearchableSisterProfileSelect } from "@/components/SearchableSisterProfileSelect"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { convertToBuyerCurrency } from "@/lib/currency"
import { extractErrorMessage } from "@/lib/errors"
import { resolveMediaUrl } from "@/lib/media"
import { PRODUCT_STATUS_BADGE_VARIANT, PRODUCT_STATUS_LABEL } from "@/lib/status"
import { cn } from "@/lib/utils"
import type { Paginated } from "@/types/api"
import type { Product, ProductCreateInput, ProductStatus, ProductVariantInput, SisterProfile } from "@/types/sourcing"
import type { ProductTemplate, ProductTemplateFieldEntry } from "@/types/templates"

// Dimensions entered at Sourcing Intake in centimetres. CBM = cm³ / 1,000,000.
// (PackingRule defaults stay in inches and are converted to cm when a rule
// pre-fills rows — see apps.packing.services.generate_variant_rows_from_rule.)
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
  // Dimensions entered in cm — CBM = cubic_cm / 1,000,000
  const cubicCm = (row.ctnLength ?? 0) * (row.ctnWidth ?? 0) * (row.ctnHeight ?? 0)
  const cbm = cubicCm > 0 ? cubicCm / 1_000_000 : 0
  const totalCbm = cbm * noOfCartons
  return { pcsPerCarton, noOfCartons, totalPcs, totalAmount, totalGrossWeight, totalNetWeight, cbm, totalCbm }
}

/** A row nobody has typed into — only its auto-suggested carton numbers are
 * set. Skipped on save and left out of the footer totals. */
function isBlankRow(row: VariantRowDraft): boolean {
  const texts = [row.colorName, row.variantStyleNo, row.description, row.material, row.patternNo, row.remarks]
  const numbers = [row.unitPrice, row.grossWeight, row.netWeight, row.ctnLength, row.ctnWidth, row.ctnHeight]
  return (
    texts.every((t) => !t.trim()) &&
    numbers.every((n) => n == null) &&
    !row.orderQty &&
    sizeRowsClean(row.sizeBreakdown).length === 0 &&
    row.customFieldValues.every((v) => !String(v.value ?? "").trim()) &&
    !row.imageFile
  )
}

/** Color is what identifies a row, so a row with data but no Color can't be
 * saved. It used to be dropped silently on save; now the save is blocked and
 * the row is flagged (see `needsColor` in VariantRowsEditor). */
function rowNeedsColor(row: VariantRowDraft): boolean {
  return !row.colorName.trim() && !isBlankRow(row)
}

function prepareVariantsForSave(variants: VariantRowDraft[]): { rows: ProductVariantInput[]; error: string | null } {
  const missing = variants.flatMap((v, i) => (rowNeedsColor(v) ? [i + 1] : []))
  if (missing.length) {
    return {
      rows: [],
      error: `Enter a Color on row ${missing.join(", ")} — every row needs one, or delete the row.`,
    }
  }
  const rows = variants
    .filter((v) => !isBlankRow(v))
    .map(({ tempId: _tempId, imageFile: _imageFile, sizeBreakdown, ...rest }) => ({
      ...rest,
      sizeBreakdown: sizeRowsClean(sizeBreakdown),
    }))
  if (rows.length === 0) return { rows, error: "Add at least one row with a color name." }
  return { rows, error: null }
}

/** Uploads each row's color photo. Never throws: the product already exists
 * by the time this runs, so a failed photo must not surface as a failed save
 * (on Create that invited a second click — and a duplicate product). Returns
 * the rows whose photo didn't upload. */
async function uploadColorImages(productId: string, variants: VariantRowDraft[]): Promise<VariantRowDraft[]> {
  const failed: VariantRowDraft[] = []
  for (const v of variants) {
    if (!v.imageFile) continue
    const imgForm = new FormData()
    imgForm.append("image", v.imageFile)
    imgForm.append("label", "custom")
    imgForm.append("customLabelName", v.colorName.trim())
    try {
      await api.post(`/products/${productId}/upload_image/`, imgForm, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    } catch {
      failed.push(v)
    }
  }
  return failed
}

const STATUS_FILTER_OPTIONS: { value: ProductStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "sourcing_trip_open", label: PRODUCT_STATUS_LABEL.sourcing_trip_open },
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
    colorName: "", patternNo: "", poNo: "", assortId: "", ctnSl: "", orderQty: 0, sizeBreakdown: emptySizeBreakdownRows(),
    customFieldValues: blankValuesForColumns(columns),
    innerBundle: 1,
    cartonNoFrom: nextFrom, cartonNoTo: nextFrom,
    unitPrice: null,
    grossWeight: null, netWeight: null, ctnLength: null, ctnWidth: null, ctnHeight: null,
    variantStyleNo: "", material: "", description: "", remarks: "",
    imageFile: null,
  }
}

function variantToDraft(v: Product["variants"][number]): VariantRowDraft {
  return {
    tempId: crypto.randomUUID(),
    colorName: v.colorName,
    patternNo: v.patternNo,
    poNo: v.poNo ?? "",
    assortId: v.assortId ?? "",
    ctnSl: v.ctnSl ?? "",
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
    variantStyleNo: v.variantStyleNo ?? "",
    material: v.material ?? "",
    description: v.description ?? "",
    remarks: v.remarks ?? "",
    imageFile: null,
  }
}

const DEFAULT_VARIANT_ROWS = 1

// `sisterProfileId` scopes the list to one Sister Profile and pre-selects
// it in the New Product dialog — used by the Sourcing Pipeline step 1, which
// renders this page with `embedded` (no page heading) inside its panel.
export function ProductsPage({ sisterProfileId, embedded = false }: { sisterProfileId?: string; embedded?: boolean } = {}) {
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

  // Scoped to the order server-side when embedded in the pipeline, so an
  // order's products never fall off the end of a global, size-capped page.
  const productsQuery = useQuery({
    queryKey: sisterProfileId ? ["products", "by-sister", sisterProfileId] : ["products", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>("/products/", {
        params: sisterProfileId ? { sisterProfile: sisterProfileId, page_size: 500 } : { page_size: 500 },
      })
      return data.results
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/products/${id}/`) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({ queryKey: ["pipeline"] })
      setDeleteTarget(null)
      setDeleteError(null)
    },
    onError: (err: unknown) => setDeleteError(extractErrorMessage(err)),
  })

  // Rows scoped to the pipeline's Sister Profile (if any) — both the visible
  // list and the status-filter counts come from this, never global data.
  const profileRows = useMemo(
    () => (sisterProfileId ? (productsQuery.data ?? []).filter((p) => p.sisterProfile === sisterProfileId) : (productsQuery.data ?? [])),
    [productsQuery.data, sisterProfileId],
  )

  const filtered = useMemo(() => {
    return profileRows.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const haystack = [
          p.name, p.styleNumber, p.brandName, p.poNo, p.sisterProfilePoReference,
          ...p.variants.flatMap((v) => [v.colorName, v.patternNo, v.variantStyleNo]),
        ]
        return haystack.some((s) => (s ?? "").toLowerCase().includes(q))
      }
      return true
    })
  }, [profileRows, statusFilter, search])

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<ProductStatus | "all", number>> = { all: profileRows.length }
    for (const p of profileRows) counts[p.status] = (counts[p.status] ?? 0) + 1
    return counts
  }, [profileRows])

  const canCreate = !!user && CAN_CREATE_ROLES.includes(user.role)

  return (
    <div className="flex flex-col gap-6">
      <div className={`flex flex-wrap items-center gap-3 ${embedded ? "justify-end" : "justify-between"}`}>
        {!embedded && (
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Sourcing Intake</h1>
            <p className="text-sm text-slate-500">Every sourcing request, its color/size breakdown, and current status.</p>
          </div>
        )}
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Product
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search name, style #, PO, brand, colour…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProductStatus | "all")} className="w-60">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label} ({statusCounts[opt.value] ?? 0})
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
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-slate-500">
                {profileRows.length === 0 ? "No products yet." : "No products match your search or filter."}
              </p>
              {(search || statusFilter !== "all") && profileRows.length > 0 ? (
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter("all") }}>Clear search &amp; filter</Button>
              ) : canCreate && profileRows.length === 0 ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add the first product</Button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
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
                        {p.totalCartons > 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600" title={`${p.totalCartons} carton(s) packed at intake — download the packing list from the product page`}>
                            <FileImage className="h-4 w-4" /> {p.totalCartons}
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

      {createOpen && <CreateProductDialog onClose={() => setCreateOpen(false)} defaultSisterProfile={sisterProfileId} stayOnCreate={embedded} />}

      {viewTarget && <ViewProductDialog product={viewTarget} onClose={() => setViewTarget(null)} />}

      {editTarget && <EditProductDialog product={editTarget} onClose={() => setEditTarget(null)} />}

      {deleteTarget && (
        <Dialog open onClose={() => setDeleteTarget(null)} title={`Delete "${deleteTarget.name}"?`}>
          <div className="flex flex-col gap-4">
            {deleteError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</div>}
            <p className="text-sm text-slate-600">
              This permanently removes <code className="text-xs">{deleteTarget.styleNumber}</code> and cannot be undone.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
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

// `stayOnCreate` (pipeline step 1): after saving, close and stay on the
// pipeline instead of jumping to the product's own page — that jump left the
// user away from the stepper, with step 2 nowhere in sight.
function CreateProductDialog({ onClose, defaultSisterProfile, stayOnCreate = false }: {
  onClose: () => void; defaultSisterProfile?: string; stayOnCreate?: boolean
}) {
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

  const [sisterProfile, setSisterProfile] = useState(defaultSisterProfile ?? "")
  const [name, setName] = useState("")
  const [brandName, setBrandName] = useState("")
  const [poNo, setPoNo] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [columns, setColumns] = useState<ProductTemplateFieldEntry[]>([])
  const [variants, setVariants] = useState<VariantRowDraft[]>(
    Array.from({ length: DEFAULT_VARIANT_ROWS }, () => emptyVariant(null, [])),
  )
  const [error, setError] = useState<string | null>(null)

  function handleTemplateChange(id: string) {
    const hasExtraValues = variants.some((v) => v.customFieldValues.some((c) => String(c.value ?? "").trim()))
    if (hasExtraValues && !window.confirm("Changing the template clears what you typed in its extra columns. Continue?")) return
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

  const [showRowErrors, setShowRowErrors] = useState(false)

  const createMutation = useMutation({
    mutationFn: async (payload: ProductCreateInput) => {
      const { data: product } = await api.post<Product>("/products/", payload)
      // Once the product exists this mutation must succeed: photo failures
      // are reported on the product page instead of re-enabling "Create".
      const failedPhotos = await uploadColorImages(product.id, variants)
      return { product, failedPhotoColors: failedPhotos.map((v) => v.colorName.trim()) }
    },
    onSuccess: ({ product, failedPhotoColors }) => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({ queryKey: ["pipeline"] })
      onClose()
      // A failed photo is reported (and fixed) on the product page, so that
      // case still goes there even from the pipeline.
      if (stayOnCreate && failedPhotoColors.length === 0) return
      navigate(`/products/${product.id}`, failedPhotoColors.length ? { state: { failedPhotoColors } } : undefined)
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!sisterProfile) {
      setError("Sister Profile is required.")
      return
    }
    const { rows: cleanVariants, error: rowsError } = prepareVariantsForSave(variants)
    if (rowsError) {
      setShowRowErrors(true)
      setError(rowsError)
      return
    }
    createMutation.mutate({
      sisterProfile,
      name,
      brandName: brandName || "NA",
      poNo,
      material: cleanVariants[0]?.material || "",
      template: templateId || null,
      resolvedTemplateFields: columns,
      variants: cleanVariants,
    })
  }

  const isDirty =
    !!(sisterProfile || name.trim() || brandName.trim() || poNo.trim() || templateId) || variants.some((v) => !isBlankRow(v))

  // Escape, a stray click on the backdrop and Cancel all land here — a
  // 30-column form is a lot to lose to one misclick.
  function requestClose() {
    if (createMutation.isPending) return
    if (!isDirty || window.confirm("Discard this new product? Everything you typed will be lost.")) onClose()
  }

  return (
    <Dialog open onClose={requestClose} title="New Sourcing Request" className="max-w-[98vw] xl:max-w-[92vw] xl:max-h-[95vh]">
      <form onSubmit={handleSubmit} onKeyDown={preventEnterSubmit} className="flex flex-col gap-5">
        {error && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <FormSection step={1} title="Product" hint="Which order it belongs to and what it is. The Style # is created automatically when you save.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Sister Profile (order)" required hint="Sets the price currencies." className="lg:col-span-2">
              <SearchableSisterProfileSelect required options={sisterProfilesQuery.data ?? []} value={sisterProfile} onChange={(v) => setSisterProfile(v)} placeholder="Search by PO or buyer…" />
            </FormField>
            <FormField label="Product Name" required className="lg:col-span-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Men's Crew-neck T-Shirt" />
            </FormField>
            <FormField label="Brand Name" hint='Left blank, it is saved as "NA".'>
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="NA" />
            </FormField>
            <FormField label="PO No" hint="Becomes the default PO on this product's packing-list rows.">
              <Input value={poNo} onChange={(e) => setPoNo(e.target.value)} />
            </FormField>
            <FormField label="Product Template" hint="Adds the template's extra columns to the colour grid." className="lg:col-span-2">
              <Select value={templateId} onChange={(e) => handleTemplateChange(e.target.value)}>
                <option value="">None — standard columns only</option>
                {templatesQuery.data?.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </Select>
            </FormField>
          </div>
        </FormSection>

        <FormSection
          step={2}
          title="Colours"
          hint="One row per colour. Only Colour is required — weights, carton sizes and carton numbers can be finished later on the Packing List."
        >
          <VariantRowsEditor
            variants={variants}
            columns={columns}
            onChange={setVariants}
            onAddColumn={addColumn}
            onAddRow={() => setVariants((prev) => [...prev, emptyVariant(prev[prev.length - 1]?.cartonNoTo, columns)])}
            sisterProfile={sisterProfilesQuery.data?.find((sp) => sp.id === sisterProfile)}
            showRowErrors={showRowErrors}
          />
        </FormSection>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <span className="mr-auto text-xs text-slate-400">Next: after saving, record this product's costs in step 2 (Sourcing Cost).</span>
          <Button type="button" variant="outline" onClick={requestClose}>
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

/** Enter in a grid cell would otherwise submit the whole form mid-typing. */
function preventEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
  const target = e.target as HTMLElement
  if (e.key === "Enter" && target.tagName === "INPUT") e.preventDefault()
}

function FormSection({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">{step}</span>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function FormField({ label, required, hint, className, children }: {
  label: string
  required?: boolean
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

/** Plain-language help for every grid column, shown on hover. Kept next to
 * the grid so the wording and the columns can't drift apart. */
const COLUMN_HELP = {
  color: "One row = one colour. Required — a row with anything typed in it needs a colour before it can be saved.",
  styleNo: "The factory's style code for this colour (e.g. MRF25). Printed as the barcode text. Leave blank to use the system Style #.",
  description: "Short description of this colour. Copied to the Packing List.",
  material: "Fabric, e.g. 100% Cotton. Printed in the invoice's Material column. Row 1's material also becomes the product's material.",
  patternNo: "The factory's pattern number for this colour. Copied to the Packing List.",
  photo: "One photo of this colour. Saved to the Photo Gallery under the colour's name, and shown next to this colour on packing lists and invoices.",
  orderQty: "How many pieces of this colour the buyer ordered.",
  sizes: "How many pieces of EACH size go into ONE carton — not the whole order.",
  pcCtn: "Calculated: pieces in one carton (the sizes added up).",
  ctnFrom: "First carton number for this colour. A new row starts right after the previous row's last carton.",
  ctnTo: "Last carton number for this colour.",
  ctns: "Calculated: number of cartons (To − From + 1). Pieces, weights and CBM are all multiplied by this.",
  ttlPcs: "Calculated: pieces packed = PC/CTN × CTNS. Compared with Order Qty underneath.",
  unitPrice: "Buy price per piece — the same for every size of this colour.",
  amount: "Calculated: TTL PCS × Unit Price.",
  buyer: "Calculated with the Sister Profile's exchange rate. For reference only — not saved.",
  gw: "Gross weight of ONE carton, in kg.",
  nw: "Net weight of ONE carton, in kg.",
  ttlWeight: "Calculated: weight of one carton × CTNS.",
  dim: "Size of ONE carton, in centimetres.",
  cbm: "Calculated: L × W × H ÷ 1,000,000 — the volume of one carton in m³.",
  ttlCbm: "Calculated: CBM × CTNS.",
  remarks: "Any note for this colour. Shown on the Packing List screen.",
  extra: "Extra column from the product template, or added with \"Add column\".",
}

function GridTh({ label, help, calc, className }: { label: string; help: string; calc?: boolean; className?: string }) {
  return (
    <th title={help} className={cn("whitespace-nowrap px-2 py-2 text-left font-medium", calc && "bg-slate-100 text-slate-500", className)}>
      <span className="cursor-help border-b border-dotted border-slate-300">{label}</span>
    </th>
  )
}

function CalcCell({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <td title={title} className={cn("bg-slate-100/70 px-2 py-1.5 text-center text-sm font-medium tabular-nums text-slate-700", className)}>
      {children}
    </td>
  )
}

/** Order Qty vs pieces actually packed, shown under TTL PCS — the first place
 * the two are compared, instead of only on the Packing List later. */
function PackedVsOrdered({ orderQty, totalPcs }: { orderQty: number; totalPcs: number }) {
  if (!orderQty || !totalPcs) return null
  const diff = totalPcs - orderQty
  if (diff === 0) return <div className="text-[10px] font-normal text-emerald-600">matches order</div>
  return (
    <div className="text-[10px] font-normal text-amber-600" title={`Order Qty is ${orderQty}; the cartons hold ${totalPcs}.`}>
      {diff < 0 ? `${-diff} short` : `${diff} over`}
    </div>
  )
}

/** Thumbnail for a colour photo picked on this form (not yet uploaded). The
 * object URL is created once per file and released again, rather than a new
 * one leaking on every render. */
function ColorPhotoCell({ file, colorName, onChange }: { file: File | null; colorName: string; onChange: (file: File | null) => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) { setUrl(null); return }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])

  if (file && url) {
    return (
      <div className="group relative w-fit">
        <img src={url} alt={colorName || "Colour photo"} className="h-10 w-14 rounded border border-slate-200 object-cover" />
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Remove photo"
          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        >
          ×
        </button>
      </div>
    )
  }
  return (
    <label
      title="Add a photo of this colour"
      className="flex h-10 w-14 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-500"
    >
      <Camera className="h-4 w-4" />
      <input
        type="file"
        accept=".jpg,.jpeg,.png,.gif,.webp"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0]
          if (picked) onChange(picked)
          e.target.value = ""
        }}
      />
    </label>
  )
}

/** Where the price columns get their currencies from, said out loud — and a
 * warning when the buyer-currency columns will stay empty. */
function CurrencyNote({ sisterProfile }: { sisterProfile?: SisterProfile }) {
  if (!sisterProfile) {
    return <p className="text-xs text-slate-500">Pick a Sister Profile above — it sets the price currencies.</p>
  }
  const rate = Number(sisterProfile.exchangeRate)
  if (!rate) {
    return (
      <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
        Prices are in {sisterProfile.supplierCurrency}. This order has no exchange rate yet, so the{" "}
        {sisterProfile.buyerCurrency} columns stay empty — set it on the Sister Profile.
      </p>
    )
  }
  return (
    <p className="text-xs text-slate-500">
      Prices are in <strong className="font-medium text-slate-700">{sisterProfile.supplierCurrency}</strong>. The{" "}
      <span className="text-indigo-600">{sisterProfile.buyerCurrency}</span> columns use 1 {sisterProfile.buyerCurrency} ={" "}
      {rate} {sisterProfile.supplierCurrency} from the Sister Profile.
    </p>
  )
}

function SummaryStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "ok" | "buyer" }) {
  return (
    <div className="flex min-w-[7.5rem] flex-col rounded-md border border-slate-200 bg-white px-3 py-2">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className={cn("text-base font-semibold tabular-nums text-slate-900", tone === "buyer" && "text-indigo-600")}>{value}</span>
      {sub && (
        <span className={cn("text-[11px]", tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "text-slate-400")}>{sub}</span>
      )}
    </div>
  )
}

function VariantRowsEditor({ variants, columns, onChange, onAddColumn, onAddRow, sisterProfile, showRowErrors = false }: {
  variants: VariantRowDraft[]
  columns: ProductTemplateFieldEntry[]
  onChange: (rows: VariantRowDraft[]) => void
  onAddColumn: (column: ProductTemplateFieldEntry) => void
  onAddRow: () => void
  sisterProfile?: SisterProfile
  /** Set after a save was blocked — flags every row still missing a Color. */
  showRowErrors?: boolean
}) {
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  // Footer totals cover exactly the rows that will be saved: untouched blank
  // rows are skipped on save, so they're skipped here too.
  const countedRows = variants.filter((v) => !isBlankRow(v))
  const derived = countedRows.map(computeVariantDerived)
  const sum = (pick: (d: ReturnType<typeof computeVariantDerived>) => number) => derived.reduce((s, d) => s + pick(d), 0)
  const totalOrderQty = countedRows.reduce((s, v) => s + v.orderQty, 0)
  const totalPcs = sum((d) => d.totalPcs)
  const totalAmount = sum((d) => d.totalAmount)
  const totalAmountBuyer = convertToBuyerCurrency(totalAmount, sisterProfile?.exchangeRate)
  const supplierCur = sisterProfile?.supplierCurrency || "Supplier"
  const buyerCur = sisterProfile?.buyerCurrency || "Buyer"
  const packedDiff = totalOrderQty && totalPcs ? totalPcs - totalOrderQty : null

  function updateVariant(index: number, patch: Partial<VariantRowDraft>) {
    onChange(variants.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  function removeVariant(index: number) {
    const row = variants[index]
    if (!isBlankRow(row) && !window.confirm(`Delete row ${index + 1}${row.colorName ? ` (${row.colorName})` : ""}?`)) return
    onChange(variants.filter((_, i) => i !== index))
  }
  /** Most colours of a style share sizes, carton size, weights and price —
   * copy them, leave the colour and photo blank, and continue the carton
   * numbers after the last row with the same number of cartons. */
  function duplicateVariant(index: number) {
    const src = variants[index]
    const count = computeVariantDerived(src).noOfCartons || 1
    const from = (variants[variants.length - 1]?.cartonNoTo ?? 0) + 1
    onChange([
      ...variants,
      {
        ...src,
        tempId: crypto.randomUUID(),
        colorName: "",
        imageFile: null,
        sizeBreakdown: src.sizeBreakdown.map((e) => ({ ...e })),
        customFieldValues: src.customFieldValues.map((e) => ({ ...e })),
        cartonNoFrom: from,
        cartonNoTo: from + count - 1,
      },
    ])
  }

  const numberInput = (value: number | null, set: (v: number | null) => void, width: string, props: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <Input
      className={cn("h-9 text-sm", width)} type="number" step="0.01" min={0} max={999999}
      value={value ?? ""} onChange={(e) => set(e.target.value ? Number(e.target.value) : null)}
      {...props}
    />
  )
  const group = "border-l border-slate-200"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-slate-300 bg-white" /> you type
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-slate-200 bg-slate-100/70" /> calculated for you
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Info className="h-3 w-3" /> hover a column name for help
          </span>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setAddColumnOpen(true)} title="Add an extra column for this product only">
            <Plus className="h-3.5 w-3.5" />
            Add column
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onAddRow}>
            <Plus className="h-3.5 w-3.5" />
            Add colour
          </Button>
        </div>
      </div>

      <CurrencyNote sisterProfile={sisterProfile} />

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
              <th className="sticky left-0 z-20 bg-slate-50 px-2 py-1.5 font-semibold shadow-[1px_0_0_0_#e2e8f0]">Colour</th>
              <th colSpan={6} className={cn(group, "px-2 py-1.5 font-semibold")}>Details</th>
              <th colSpan={3} className={cn(group, "px-2 py-1.5 font-semibold")}>Quantity</th>
              <th colSpan={4} className={cn(group, "px-2 py-1.5 font-semibold")}>Cartons</th>
              <th colSpan={4} className={cn(group, "px-2 py-1.5 font-semibold")}>Price</th>
              <th colSpan={4} className={cn(group, "px-2 py-1.5 font-semibold")}>Weight · per carton (kg)</th>
              <th colSpan={5} className={cn(group, "px-2 py-1.5 font-semibold")}>Carton size (cm)</th>
              <th className={cn(group, "px-2 py-1.5 font-semibold")}>Notes</th>
              {columns.length > 0 && (
                <th colSpan={columns.length} className={cn(group, "px-2 py-1.5 font-semibold text-indigo-500")}>Extra columns</th>
              )}
              <th />
            </tr>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th title={COLUMN_HELP.color} className="sticky left-0 z-20 bg-slate-50 px-2 py-2 text-left font-medium shadow-[1px_0_0_0_#e2e8f0]">
                <span className="cursor-help border-b border-dotted border-slate-300">Color *</span>
              </th>
              <GridTh label="Style No" help={COLUMN_HELP.styleNo} className={group} />
              <GridTh label="Description" help={COLUMN_HELP.description} />
              <GridTh label="Material" help={COLUMN_HELP.material} />
              <GridTh label="Pattern No" help={COLUMN_HELP.patternNo} />
              <GridTh label="Photo" help={COLUMN_HELP.photo} />
              <GridTh label="Order Qty" help={COLUMN_HELP.orderQty} className={group} />
              <GridTh label="Sizes in 1 carton" help={COLUMN_HELP.sizes} />
              <GridTh label="PC/CTN" help={COLUMN_HELP.pcCtn} calc />
              <GridTh label="From" help={COLUMN_HELP.ctnFrom} className={group} />
              <GridTh label="To" help={COLUMN_HELP.ctnTo} />
              <GridTh label="CTNS" help={COLUMN_HELP.ctns} calc />
              <GridTh label="TTL PCS" help={COLUMN_HELP.ttlPcs} calc />
              <GridTh label={`Unit (${supplierCur})`} help={COLUMN_HELP.unitPrice} className={group} />
              <GridTh label={`Amount (${supplierCur})`} help={COLUMN_HELP.amount} calc />
              <GridTh label={`Unit (${buyerCur})`} help={COLUMN_HELP.buyer} calc className="text-indigo-600" />
              <GridTh label={`Amount (${buyerCur})`} help={COLUMN_HELP.buyer} calc className="text-indigo-600" />
              <GridTh label="G.W" help={COLUMN_HELP.gw} className={group} />
              <GridTh label="TTL G.W" help={COLUMN_HELP.ttlWeight} calc />
              <GridTh label="N.W" help={COLUMN_HELP.nw} />
              <GridTh label="TTL N.W" help={COLUMN_HELP.ttlWeight} calc />
              <GridTh label="L" help={COLUMN_HELP.dim} className={group} />
              <GridTh label="W" help={COLUMN_HELP.dim} />
              <GridTh label="H" help={COLUMN_HELP.dim} />
              <GridTh label="CBM" help={COLUMN_HELP.cbm} calc />
              <GridTh label="TTL CBM" help={COLUMN_HELP.ttlCbm} calc />
              <GridTh label="Remarks" help={COLUMN_HELP.remarks} className={group} />
              {columns.map((c, ci) => (
                <GridTh key={c.id} label={c.label} help={COLUMN_HELP.extra} className={cn("text-indigo-600", ci === 0 && group)} />
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {variants.map((row, i) => {
              const d = computeVariantDerived(row)
              const needsColor = showRowErrors && rowNeedsColor(row)
              const unitBuyer = convertToBuyerCurrency(row.unitPrice, sisterProfile?.exchangeRate)
              const amountBuyer = convertToBuyerCurrency(d.totalAmount, sisterProfile?.exchangeRate)
              return (
                <tr key={row.tempId} className="group/row border-b border-slate-100 align-top last:border-0">
                  <td className="sticky left-0 z-10 bg-white p-1.5 shadow-[1px_0_0_0_#e2e8f0]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 text-right text-[11px] tabular-nums text-slate-400">{i + 1}</span>
                      <Input
                        className={cn("h-9 w-32 text-sm", needsColor && "border-red-400 bg-red-50 placeholder:text-red-400")}
                        placeholder={needsColor ? "Colour required" : "e.g. Navy"}
                        aria-label={`Row ${i + 1} colour`}
                        aria-invalid={needsColor || undefined}
                        value={row.colorName} onChange={(e) => updateVariant(i, { colorName: e.target.value })}
                      />
                    </div>
                  </td>
                  <td className={cn(group, "p-1.5")}>
                    <Input className="h-9 w-28 text-sm" placeholder="e.g. MRF25" value={row.variantStyleNo} onChange={(e) => updateVariant(i, { variantStyleNo: e.target.value })} />
                  </td>
                  <td className="p-1.5">
                    <Input className="h-9 w-36 text-sm" value={row.description} onChange={(e) => updateVariant(i, { description: e.target.value })} />
                  </td>
                  <td className="p-1.5">
                    <Input className="h-9 w-36 text-sm" placeholder="e.g. 100% Cotton" value={row.material} onChange={(e) => updateVariant(i, { material: e.target.value })} />
                  </td>
                  <td className="p-1.5">
                    <Input className="h-9 w-28 text-sm" value={row.patternNo} onChange={(e) => updateVariant(i, { patternNo: e.target.value })} />
                  </td>
                  <td className="p-1.5">
                    <ColorPhotoCell file={row.imageFile} colorName={row.colorName} onChange={(imageFile) => updateVariant(i, { imageFile })} />
                  </td>
                  <td className={cn(group, "p-1.5")}>
                    <Input className="h-9 w-20 text-sm" type="number" min={0} value={row.orderQty || ""} onChange={(e) => updateVariant(i, { orderQty: Number(e.target.value) || 0 })} />
                  </td>
                  <td className="p-1.5">
                    <SizeBreakdownInput rows={row.sizeBreakdown} onChange={(sb) => updateVariant(i, { sizeBreakdown: sb })} />
                  </td>
                  <CalcCell>{d.pcsPerCarton}</CalcCell>
                  <td className={cn(group, "p-1.5")}>
                    <Input className="h-9 w-16 text-sm" type="number" min={1} value={row.cartonNoFrom ?? ""} onChange={(e) => updateVariant(i, { cartonNoFrom: e.target.value ? Number(e.target.value) : null })} />
                  </td>
                  <td className="p-1.5">
                    <Input
                      className={cn("h-9 w-16 text-sm", row.cartonNoFrom != null && row.cartonNoTo != null && row.cartonNoTo < row.cartonNoFrom && "border-amber-400 bg-amber-50")}
                      title={row.cartonNoFrom != null && row.cartonNoTo != null && row.cartonNoTo < row.cartonNoFrom ? "'To' is smaller than 'From' — this row has 0 cartons." : undefined}
                      type="number" min={1} value={row.cartonNoTo ?? ""} onChange={(e) => updateVariant(i, { cartonNoTo: e.target.value ? Number(e.target.value) : null })}
                    />
                  </td>
                  <CalcCell>{d.noOfCartons}</CalcCell>
                  <CalcCell>
                    {d.totalPcs}
                    <PackedVsOrdered orderQty={row.orderQty} totalPcs={d.totalPcs} />
                  </CalcCell>
                  <td className={cn(group, "p-1.5")}>
                    {numberInput(row.unitPrice, (unitPrice) => updateVariant(i, { unitPrice }), "w-24", { max: 99999999, placeholder: "—" })}
                  </td>
                  <CalcCell>{d.totalAmount.toFixed(2)}</CalcCell>
                  <CalcCell className="text-indigo-600">{unitBuyer === null ? "—" : unitBuyer.toFixed(2)}</CalcCell>
                  <CalcCell className="text-indigo-600">{amountBuyer === null ? "—" : amountBuyer.toFixed(2)}</CalcCell>
                  <td className={cn(group, "p-1.5")}>{numberInput(row.grossWeight, (grossWeight) => updateVariant(i, { grossWeight }), "w-20")}</td>
                  <CalcCell>{d.totalGrossWeight.toFixed(2)}</CalcCell>
                  <td className="p-1.5">
                    {numberInput(row.netWeight, (netWeight) => updateVariant(i, { netWeight }), "w-20",
                      row.netWeight != null && row.grossWeight != null && row.netWeight > row.grossWeight
                        ? { className: "h-9 w-20 border-amber-400 bg-amber-50 text-sm", title: "Net weight is more than gross weight — check the numbers." }
                        : {})}
                  </td>
                  <CalcCell>{d.totalNetWeight.toFixed(2)}</CalcCell>
                  <td className={cn(group, "p-1.5")}>{numberInput(row.ctnLength, (ctnLength) => updateVariant(i, { ctnLength }), "w-16")}</td>
                  <td className="p-1.5">{numberInput(row.ctnWidth, (ctnWidth) => updateVariant(i, { ctnWidth }), "w-16")}</td>
                  <td className="p-1.5">{numberInput(row.ctnHeight, (ctnHeight) => updateVariant(i, { ctnHeight }), "w-16")}</td>
                  <CalcCell>{d.cbm.toFixed(4)}</CalcCell>
                  <CalcCell>{d.totalCbm.toFixed(4)}</CalcCell>
                  <td className={cn(group, "p-1.5")}>
                    <Input className="h-9 w-36 text-sm" value={row.remarks} onChange={(e) => updateVariant(i, { remarks: e.target.value })} />
                  </td>
                  {columns.map((c, ci) => (
                    <td key={c.id} className={cn("p-1.5", ci === 0 && group)}>
                      <ColumnCellInput
                        column={c}
                        value={getCellValue(row.customFieldValues, c)}
                        onChange={(v) => updateVariant(i, { customFieldValues: setCellValue(row.customFieldValues, c, v) })}
                      />
                    </td>
                  ))}
                  <td className="p-1.5">
                    <div className="flex flex-col items-center gap-2 pt-1.5">
                      <button type="button" onClick={() => duplicateVariant(i)} className="text-slate-400 hover:text-slate-800" title="Copy this row as a new colour (sizes, cartons, weights, price)">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {variants.length > 1 && (
                        <button type="button" onClick={() => removeVariant(i)} className="text-slate-400 hover:text-red-600" title="Delete this row">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex">
        <Button type="button" variant="ghost" size="sm" onClick={onAddRow} className="text-slate-600">
          <Plus className="h-3.5 w-3.5" />
          Add another colour
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
        <SummaryStat label="Colours" value={String(countedRows.length)} />
        <SummaryStat label="Order Qty" value={totalOrderQty.toLocaleString()} />
        <SummaryStat
          label="Packed pcs"
          value={totalPcs.toLocaleString()}
          sub={packedDiff === null ? undefined : packedDiff === 0 ? "matches order" : packedDiff < 0 ? `${(-packedDiff).toLocaleString()} short of order` : `${packedDiff.toLocaleString()} over order`}
          tone={packedDiff === null ? undefined : packedDiff === 0 ? "ok" : "warn"}
        />
        <SummaryStat label="Cartons" value={sum((d) => d.noOfCartons).toLocaleString()} />
        <SummaryStat label="Gross weight" value={`${sum((d) => d.totalGrossWeight).toFixed(2)} kg`} />
        <SummaryStat label="Volume" value={`${sum((d) => d.totalCbm).toFixed(4)} CBM`} />
        <SummaryStat label={`Amount (${supplierCur})`} value={totalAmount.toFixed(2)} />
        {totalAmountBuyer !== null && (
          <SummaryStat label={`Amount (${buyerCur})`} value={totalAmountBuyer.toFixed(2)} tone="buyer" />
        )}
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
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-medium">Style No</th>
                  <th className="px-3 py-2 font-medium">Color</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">Material</th>
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
                  <th className="px-3 py-2 font-medium">Remarks</th>
                  {columns.map((c) => (
                    <th key={c.id} className="px-3 py-2 font-medium text-indigo-500">{c.label}</th>
                  ))}
                  <th className="px-3 py-2 font-medium">Barcode / QR</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.length === 0 ? (
                  <tr>
                    <td colSpan={17 + columns.length} className="px-3 py-6 text-center text-sm text-slate-400">
                      No color rows recorded.
                    </td>
                  </tr>
                ) : (
                  product.variants.map((v) => (
                    <tr key={v.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-slate-500">{v.variantStyleNo || "—"}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{v.colorName || "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{v.description || "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{v.material || "—"}</td>
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
                      <td className="px-3 py-2 text-slate-500">{v.remarks || "—"}</td>
                      {columns.map((c) => (
                        <td key={c.id} className="px-3 py-2 text-slate-500">{getCellValue(v.customFieldValues, c) || "—"}</td>
                      ))}
                      <VariantCodeCell product={product} variant={v} templateColumns={columns} />
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

export function EditProductDialog({ product, onClose }: { product: Product; onClose: () => void }) {
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

  const [showRowErrors, setShowRowErrors] = useState(false)

  const updateMutation = useMutation({
    mutationFn: async (cleanVariants: ProductVariantInput[]) => {
      const { data } = await api.patch<Product>(`/products/${product.id}/`, {
        ...form,
        material: cleanVariants[0]?.material || product.material || "",
        resolvedTemplateFields: columns,
        variants: cleanVariants,
      })
      // Upload any new per-color images. The edit itself is already saved
      // at this point, so failures are reported, not thrown.
      const failedPhotos = await uploadColorImages(product.id, variants)
      return { data, failedPhotoIds: new Set(failedPhotos.map((v) => v.tempId)) }
    },
    onSuccess: ({ data, failedPhotoIds }) => {
      queryClient.setQueryData(["products", product.id], data)
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({ queryKey: ["pipeline"] })
      if (failedPhotoIds.size === 0) {
        onClose()
        return
      }
      // Keep only the photos that failed attached, so "Save" retries just
      // those instead of uploading the successful ones a second time.
      setVariants((prev) => prev.map((v) => (failedPhotoIds.has(v.tempId) ? v : { ...v, imageFile: null })))
      const colors = variants.filter((v) => failedPhotoIds.has(v.tempId)).map((v) => v.colorName.trim())
      setError(`Changes saved, but the photo for ${colors.join(", ")} didn't upload. Click Save Changes to retry, or Cancel.`)
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const { rows, error: rowsError } = prepareVariantsForSave(variants)
    if (rowsError) {
      setShowRowErrors(true)
      setError(rowsError)
      return
    }
    updateMutation.mutate(rows)
  }

  // Snapshot of the form as opened, so closing only asks for confirmation
  // when something actually changed.
  const [initialSnapshot] = useState(() => JSON.stringify({ form, columns, variants }))
  const isDirty = JSON.stringify({ form, columns, variants }) !== initialSnapshot

  function requestClose() {
    if (updateMutation.isPending) return
    if (!isDirty || window.confirm("Discard your changes to this product?")) onClose()
  }

  return (
    <Dialog open onClose={requestClose} title={`Edit — ${product.name}`} className="max-w-[98vw] xl:max-w-[92vw]">
      <form onSubmit={handleSubmit} onKeyDown={preventEnterSubmit} className="flex flex-col gap-5">
        {error && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <FormSection step={1} title="Product" hint={product.templateName ? `Template: ${product.templateName}` : undefined}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Sister Profile (order)" required hint="Moving a product to another order doesn't move costs already booked." className="lg:col-span-2">
              <SearchableSisterProfileSelect required options={sisterProfilesQuery.data ?? []} value={form.sisterProfile} onChange={(v) => setForm({ ...form, sisterProfile: v })} placeholder="Search by PO or buyer…" />
            </FormField>
            <FormField label="Product Name" required className="lg:col-span-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </FormField>
            <FormField label="Style # (system code)" required hint="Packing lists that already exist keep the old code until they're re-saved.">
              <Input value={form.styleNumber} onChange={(e) => setForm({ ...form, styleNumber: e.target.value })} required />
            </FormField>
            <FormField label="Brand Name" hint='Left blank, it is saved as "NA".'>
              <Input value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} placeholder="NA" />
            </FormField>
            <FormField label="PO No" className="lg:col-span-2">
              <Input value={form.poNo} onChange={(e) => setForm({ ...form, poNo: e.target.value })} />
            </FormField>
          </div>
        </FormSection>

        <FormSection step={2} title="Colours" hint="One row per colour. Photos already on the product are in its Photo Gallery; a photo added here is added to it.">
          <VariantRowsEditor
            variants={variants}
            columns={columns}
            onChange={setVariants}
            onAddColumn={addColumn}
            onAddRow={() => setVariants((prev) => [...prev, emptyVariant(prev[prev.length - 1]?.cartonNoTo, columns)])}
            sisterProfile={sisterProfilesQuery.data?.find((sp) => sp.id === form.sisterProfile)}
            showRowErrors={showRowErrors}
          />
        </FormSection>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" onClick={requestClose}>
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

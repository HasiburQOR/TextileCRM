import { VariantCodeCell } from "@/components/VariantCodeCell"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, FileImage, ImagePlus, Pencil, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ProductProgress } from "@/components/sourcing/ProductProgress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Lightbox } from "@/components/ui/lightbox"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { extractErrorMessage } from "@/lib/errors"
import { resolveMediaUrl } from "@/lib/media"
import { PRODUCT_STATUS_BADGE_VARIANT, PRODUCT_STATUS_LABEL } from "@/lib/status"
import { EditProductDialog } from "@/pages/ProductsPage"
import type { Product, ProductImage } from "@/types/sourcing"

const CAN_MANAGE_ROLES = ["admin", "company_rep"]

const IMAGE_LABEL_OPTIONS: { value: ProductImage["label"]; label: string }[] = [
  { value: "front_label", label: "Front Label" },
  { value: "back_label", label: "Back Label" },
  { value: "product_overall", label: "Product Overall" },
  { value: "fabric_closeup", label: "Fabric Close-up" },
  { value: "custom", label: "Custom" },
]

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  // One Edit for the whole product — the same dialog as the list page's
  // pencil, colour rows included (this page used to edit only 4 header fields).
  const [editOpen, setEditOpen] = useState(false)
  const autoOpenedRef = useRef(false)
  const location = useLocation()
  // Set by the Create dialog when the product saved but one or more color
  // photos didn't upload (see ProductsPage.uploadColorImages).
  const [failedPhotoColors, setFailedPhotoColors] = useState<string[]>(
    () => (location.state as { failedPhotoColors?: string[] } | null)?.failedPhotoColors ?? [],
  )

  useEffect(() => {
    // Drop the one-time notice from history so a reload doesn't show it again.
    if (location.state) navigate(location.pathname + location.search, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const productQuery = useQuery({
    queryKey: ["products", id],
    queryFn: async () => {
      const { data } = await api.get<Product>(`/products/${id}/`)
      return data
    },
    enabled: !!id,
  })

  useEffect(() => {
    if (productQuery.data && searchParams.get("edit") === "1" && !autoOpenedRef.current) {
      autoOpenedRef.current = true
      setEditOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productQuery.data])

  function closeEdit() {
    setEditOpen(false)
    if (searchParams.get("edit")) {
      searchParams.delete("edit")
      setSearchParams(searchParams, { replace: true })
    }
  }

  const readyForFinalQcMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Product>(`/products/${id}/mark-ready-for-final-qc/`)
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["products", id], data)
      queryClient.invalidateQueries({ queryKey: ["products"] })
      setActionError(null)
    },
    onError: (err: unknown) => setActionError(extractErrorMessage(err)),
  })

  if (productQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="text-slate-400" />
      </div>
    )
  }

  if (!productQuery.data) {
    return <p className="py-16 text-center text-sm text-slate-400">Product not found.</p>
  }

  const product = productQuery.data
  const canManage = !!user && CAN_MANAGE_ROLES.includes(user.role)
  const canEdit = user?.role === "admin"
  const canMarkReady = user?.role === "admin" || user?.role === "warehouse"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pipeline")} title="Back to Sourcing Pipeline">
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{product.name}</h1>
            <Badge variant={PRODUCT_STATUS_BADGE_VARIANT[product.status]}>{PRODUCT_STATUS_LABEL[product.status]}</Badge>
          </div>
            <p className="text-sm text-slate-500">
              <code className="text-xs">{product.styleNumber}</code> · {product.brandName} · PO {product.poNo || "—"} · {product.sisterProfilePoReference}
            </p>
          </div>

        {canEdit && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}
        {canMarkReady && product.status === "in_warehouse" && (
          <Button onClick={() => readyForFinalQcMutation.mutate()} disabled={readyForFinalQcMutation.isPending}>
            {readyForFinalQcMutation.isPending ? "Saving…" : "Mark Ready for Final QC"}
          </Button>
        )}
      </div>

      <ProductProgress status={product.status} />

      {failedPhotoColors.length > 0 && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            Product saved, but the photo for <span className="font-medium">{failedPhotoColors.join(", ")}</span> didn't
            upload. Add it in the Photo Gallery below (label: Custom, name: the color).
          </span>
          <button type="button" onClick={() => setFailedPhotoColors([])} className="shrink-0 text-amber-600 hover:text-amber-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {actionError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>}

      {product.status === "rejected" && product.rejectionReason && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-medium">Rejected:</span> {product.rejectionReason}
        </div>
      )}

      {product.reviewedByName && (
        <p className="text-xs text-slate-400">
          Reviewed by {product.reviewedByName}
          {product.reviewedAt && ` on ${new Date(product.reviewedAt).toLocaleString()}`}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Per-Color Packing Detail ({product.totalOrderQty} pcs total)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-medium">Style No</th>
                    <th className="px-4 py-2 font-medium">Color</th>
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 font-medium">Material</th>
                    <th className="px-4 py-2 font-medium">Pattern No</th>
                    <th className="px-4 py-2 font-medium">Order Qty</th>
                    <th className="px-4 py-2 font-medium">Size Breakdown</th>
                    <th className="px-4 py-2 font-medium">PC/CTN</th>
                    <th className="px-4 py-2 font-medium">Cartons</th>
                    <th className="px-4 py-2 font-medium">TTL PCS</th>
                    <th className="px-4 py-2 font-medium">TTL G.W</th>
                    <th className="px-4 py-2 font-medium">TTL N.W</th>
                    <th className="px-4 py-2 font-medium">CBM</th>
                    <th className="px-4 py-2 font-medium">Remarks</th>
                    <th className="px-4 py-2 font-medium">Barcode / QR</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="px-4 py-6 text-center text-sm text-slate-400">
                        No color rows recorded.
                      </td>
                    </tr>
                  ) : (
                    product.variants.map((v) => (
                      <tr key={v.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2 text-slate-500">{v.variantStyleNo || "—"}</td>
                        <td className="px-4 py-2 font-medium text-slate-900">{v.colorName || "—"}</td>
                        <td className="px-4 py-2 text-slate-500">{v.description || "—"}</td>
                        <td className="px-4 py-2 text-slate-500">{v.material || "—"}</td>
                        <td className="px-4 py-2 text-slate-500">{v.patternNo || "—"}</td>
                        <td className="px-4 py-2 text-slate-500">{v.orderQty}</td>
                        <td className="px-4 py-2 text-slate-500">
                          {v.sizeBreakdown.length === 0
                            ? "—"
                            : v.sizeBreakdown.map((e) => `${e.size_label}:${e.quantity}`).join(" / ")}
                        </td>
                        <td className="px-4 py-2 text-slate-500">{v.pcsPerCarton}</td>
                        <td className="px-4 py-2 text-slate-500">{v.noOfCartons}</td>
                        <td className="px-4 py-2 text-slate-500">{v.totalPcs}</td>
                        <td className="px-4 py-2 text-slate-500">{Number(v.totalGrossWeight).toFixed(2)}</td>
                        <td className="px-4 py-2 text-slate-500">{Number(v.totalNetWeight).toFixed(2)}</td>
                        <td className="px-4 py-2 text-slate-500">{Number(v.totalCbm).toFixed(4)}</td>
                        <td className="px-4 py-2 text-slate-500">{v.remarks || "—"}</td>
                        {/* Same columns as the list's View dialog, so a row's
                            QR is identical whichever screen it's downloaded from. */}
                        <VariantCodeCell product={product} variant={v} templateColumns={product.resolvedTemplateFields} />
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Factory Packing List</CardTitle>
          </CardHeader>
          <CardContent>
            <FactoryPackingListPanel productId={product.id} file={product.factoryPackingList} canUpload={canManage} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Photo Gallery</CardTitle>
        </CardHeader>
        <CardContent>
          <ImageGallery productId={product.id} images={product.images} canUpload={canManage} />
        </CardContent>
      </Card>

      {editOpen && <EditProductDialog product={product} onClose={closeEdit} />}
    </div>
  )
}

function FactoryPackingListPanel({
  productId,
  file,
  canUpload,
}: {
  productId: string
  file: string | null
  canUpload: boolean
}) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const uploadMutation = useMutation({
    mutationFn: async (selected: File) => {
      const form = new FormData()
      form.append("factoryPackingList", selected)
      const { data } = await api.post<Product>(`/products/${productId}/upload_factory_packing_list/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["products", productId], data)
      setError(null)
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) uploadMutation.mutate(selected)
  }

  const isImage = file ? /\.(png|jpe?g|gif|webp)$/i.test(file) : false
  const [lightboxOpen, setLightboxOpen] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {file ? (
        isImage ? (
          <button type="button" onClick={() => setLightboxOpen(true)} className="block overflow-hidden rounded-md border border-slate-200">
            <img src={resolveMediaUrl(file)} alt="Factory packing list" className="h-40 w-full object-cover" />
          </button>
        ) : (
          <a href={resolveMediaUrl(file)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-slate-200">
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
      {canUpload && (
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
          {uploadMutation.isPending ? "Uploading…" : file ? "Replace File" : "Upload File"}
        </Button>
      )}
      <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf" className="hidden" onChange={handleFileChange} />

      {lightboxOpen && file && isImage && (
        <Lightbox
          images={[{ src: resolveMediaUrl(file), label: "Factory packing list" }]}
          initialIndex={0}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  )
}

function ImageGallery({ productId, images, canUpload }: { productId: string; images: ProductImage[]; canUpload: boolean }) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [label, setLabel] = useState<ProductImage["label"]>("product_overall")
  const [customLabelName, setCustomLabelName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append("image", file)
      form.append("label", label)
      if (label === "custom") form.append("customLabelName", customLabelName)
      const { data } = await api.post<ProductImage>(`/products/${productId}/upload_image/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", productId] })
      setError(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (label === "custom" && !customLabelName.trim()) {
      setError("Custom label name is required.")
      return
    }
    uploadMutation.mutate(file)
  }

  return (
    <div className="flex flex-col gap-4">
      {canUpload && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Label</label>
            <Select value={label} onChange={(e) => setLabel(e.target.value as ProductImage["label"])} className="w-44">
              {IMAGE_LABEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          {label === "custom" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Custom Label</label>
              <input
                className="h-9 rounded-md border border-slate-300 px-2 text-sm"
                value={customLabelName}
                onChange={(e) => setCustomLabelName(e.target.value)}
              />
            </div>
          )}
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
            <ImagePlus className="h-4 w-4" />
            {uploadMutation.isPending ? "Uploading…" : "Add Photo"}
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {images.length === 0 ? (
        <p className="text-sm text-slate-400">No photos uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img, i) => (
            <button
              type="button"
              key={img.id}
              onClick={() => setLightboxIndex(i)}
              className="overflow-hidden rounded-md border border-slate-200 text-left"
            >
              <img src={resolveMediaUrl(img.image)} alt={img.customLabelName || img.label} className="h-32 w-full object-cover" />
              <div className="px-2 py-1.5 text-xs text-slate-500">{img.customLabelName || IMAGE_LABEL_OPTIONS.find((o) => o.value === img.label)?.label}</div>
            </button>
          ))}
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          images={images.map((img) => ({
            src: resolveMediaUrl(img.image),
            label: img.customLabelName || IMAGE_LABEL_OPTIONS.find((o) => o.value === img.label)?.label,
          }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}

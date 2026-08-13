import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, QrCode } from "lucide-react"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { extractErrorMessage } from "@/lib/errors"
import { PRODUCT_STATUS_BADGE_VARIANT, PRODUCT_STATUS_LABEL } from "@/lib/status"
import type { Paginated } from "@/types/api"
import type { PackingList } from "@/types/packing"
import type { Product } from "@/types/sourcing"

const CAN_MANAGE_ROLES = ["admin", "qc"]
type FilterValue = "ready_for_final_qc" | "completed" | "all"

export function FinalQCPage() {
  const user = useAuthStore((s) => s.user)
  const [statusFilter, setStatusFilter] = useState<FilterValue>("ready_for_final_qc")
  const [detailTarget, setDetailTarget] = useState<Product | null>(null)

  const productsQuery = useQuery({
    queryKey: ["products", "final-qc", statusFilter],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>("/products/", {
        params: { page_size: 200, ...(statusFilter !== "all" ? { status: statusFilter } : {}) },
      })
      return data.results
    },
  })

  const canManage = !!user && CAN_MANAGE_ROLES.includes(user.role)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Final QC & QR</h1>
        <p className="text-sm text-slate-500">Final goods verification and dual QR generation — gates the "Completed" status.</p>
      </div>

      <Select className="w-56" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as FilterValue)}>
        <option value="ready_for_final_qc">Ready for Final QC</option>
        <option value="completed">Completed</option>
        <option value="all">All</option>
      </Select>

      <Card>
        <CardContent className="p-0">
          {productsQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : !productsQuery.data?.length ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {statusFilter === "ready_for_final_qc" ? "Nothing waiting on Final QC." : "No products match this filter."}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Style #</th>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Sister Profile PO</th>
                  <th className="px-4 py-2.5 font-medium">Product QR</th>
                  <th className="px-4 py-2.5 font-medium">Carton QR</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {productsQuery.data.map((p) => (
                  <tr key={p.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" onClick={() => setDetailTarget(p)}>
                    <td className="px-4 py-2.5"><code className="text-xs text-slate-500">{p.styleNumber}</code></td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{p.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{p.sisterProfilePoReference}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={p.productQrGenerated ? "success" : "default"}>{p.productQrGenerated ? "Generated" : "Pending"}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={p.cartonQrGenerated ? "success" : "default"}>{p.cartonQrGenerated ? "Generated" : "Pending"}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={PRODUCT_STATUS_BADGE_VARIANT[p.status]}>{PRODUCT_STATUS_LABEL[p.status]}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setDetailTarget(p) }}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {detailTarget && <FinalQCDialog productId={detailTarget.id} canManage={canManage} onClose={() => setDetailTarget(null)} />}
    </div>
  )
}

function QRImage({ url, alt, downloadName }: { url: string; alt: string; downloadName: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    setSrc(null)
    setError(false)
    api.get(url, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(res.data as Blob)
        setSrc(objectUrl)
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  if (error) return <p className="text-xs text-red-600">Could not load this QR image.</p>
  if (!src) return <div className="flex h-36 w-36 items-center justify-center"><Spinner className="text-slate-400" /></div>
  return (
    <div className="flex flex-col items-center gap-2">
      <img src={src} alt={alt} className="h-36 w-36 rounded-md border border-slate-200 bg-white p-1" />
      <a href={src} download={downloadName} className="text-xs text-sky-600 hover:underline">Download</a>
    </div>
  )
}

function FinalQCDialog({ productId, canManage, onClose }: { productId: string; canManage: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const productQuery = useQuery({
    queryKey: ["products", productId],
    queryFn: async () => { const { data } = await api.get<Product>(`/products/${productId}/`); return data },
  })

  const packingListsQuery = useQuery({
    queryKey: ["packing-lists", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<PackingList>>("/packing-lists/", { params: { page_size: 200 } }); return data.results },
  })

  const [goodsName, setGoodsName] = useState("")
  const [finalPrice, setFinalPrice] = useState<number | "">("")
  const [fabricDetails, setFabricDetails] = useState("")
  const [initialized, setInitialized] = useState(false)

  const product = productQuery.data
  if (product && !initialized) {
    setGoodsName(product.goodsName)
    setFinalPrice(product.finalPrice ? Number(product.finalPrice) : "")
    setFabricDetails(product.fabricDetails)
    setInitialized(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch<Product>(`/products/${productId}/final-qc/`, {
        goodsName, finalPrice: finalPrice === "" ? null : finalPrice, fabricDetails,
      })
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["products", productId], data)
      queryClient.invalidateQueries({ queryKey: ["products", "final-qc"] })
      setError(null)
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  const productQrMutation = useMutation({
    mutationFn: async () => { const { data } = await api.post<Product>(`/products/${productId}/generate-product-qr/`); return data },
    onSuccess: (data) => {
      queryClient.setQueryData(["products", productId], data)
      queryClient.invalidateQueries({ queryKey: ["products", "final-qc"] })
      setError(null)
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  const cartonQrMutation = useMutation({
    mutationFn: async () => { const { data } = await api.post<Product>(`/products/${productId}/generate-carton-qr/`); return data },
    onSuccess: (data) => {
      queryClient.setQueryData(["products", productId], data)
      queryClient.invalidateQueries({ queryKey: ["products", "final-qc"] })
      setError(null)
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  if (productQuery.isLoading || !product) {
    return (
      <Dialog open onClose={onClose} title="Final QC & QR">
        <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
      </Dialog>
    )
  }

  const cartons = (packingListsQuery.data ?? []).flatMap((pl) => pl.cartons.filter((c) => c.product === productId))
  const finalDataSaved = !!(product.goodsName && product.finalPrice !== null && product.fabricDetails)
  const isCompleted = product.status === "completed"

  return (
    <Dialog open onClose={onClose} title={`Final QC & QR — ${product.name}`} className="max-w-3xl">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <code className="text-xs text-slate-500">{product.styleNumber}</code>
          <Badge variant={PRODUCT_STATUS_BADGE_VARIANT[product.status]}>{PRODUCT_STATUS_LABEL[product.status]}</Badge>
        </div>

        {isCompleted && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Both QR codes are generated — this product is marked Completed.
          </div>
        )}
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Final Verified Data</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Final Goods Name *</label>
              <Input value={goodsName} onChange={(e) => setGoodsName(e.target.value)} disabled={!canManage} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Final Price *</label>
              <Input
                type="number" min={0} step="0.01" value={finalPrice}
                onChange={(e) => setFinalPrice(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={!canManage}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Fabric Details *</label>
            <Textarea rows={2} value={fabricDetails} onChange={(e) => setFabricDetails(e.target.value)} disabled={!canManage} />
          </div>
          {canManage && (
            <div className="flex justify-end">
              <Button size="sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? "Saving..." : "Save Final QC Data"}
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-md border border-slate-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Packing List Summary (read-only)</p>
          {packingListsQuery.isLoading ? (
            <Spinner className="text-slate-400" />
          ) : cartons.length === 0 ? (
            <p className="text-sm text-slate-400">No packing list rows for this product yet.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-slate-200 text-slate-400">
                <th className="py-1 pr-3 font-medium">Colors</th>
                <th className="py-1 pr-3 font-medium">Cartons</th>
                <th className="py-1 pr-3 font-medium">Ship Qty</th>
                <th className="py-1 pr-3 font-medium">G.W</th>
                <th className="py-1 pr-3 font-medium">N.W</th>
                <th className="py-1 font-medium">CBM</th>
              </tr></thead>
              <tbody>
                {cartons.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-1 pr-3 text-slate-700">{Object.keys(c.colorBreakdown).join(", ") || "—"}</td>
                    <td className="py-1 pr-3 text-slate-500">{c.noOfCartons}</td>
                    <td className="py-1 pr-3 text-slate-500">{c.shipQty}</td>
                    <td className="py-1 pr-3 text-slate-500">{Number(c.totalGrossWeight).toFixed(2)}</td>
                    <td className="py-1 pr-3 text-slate-500">{Number(c.totalNetWeight).toFixed(2)}</td>
                    <td className="py-1 text-slate-500">{Number(c.totalCbm).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col items-center gap-3 rounded-md border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Product QR</p>
            {product.productQrGenerated ? (
              <QRImage url={`/products/${productId}/product-qr-image/`} alt="Product QR" downloadName={`${product.styleNumber}-product-qr.png`} />
            ) : (
              <>
                <QrCode className="h-10 w-10 text-slate-300" />
                {canManage && (
                  <Button
                    size="sm" disabled={!finalDataSaved || productQrMutation.isPending}
                    title={!finalDataSaved ? "Save Final QC data first" : undefined}
                    onClick={() => productQrMutation.mutate()}
                  >
                    {productQrMutation.isPending ? "Generating..." : "Generate Product QR"}
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="flex flex-col items-center gap-3 rounded-md border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Carton QR</p>
            {product.cartonQrGenerated ? (
              <QRImage url={`/products/${productId}/carton-qr-image/`} alt="Carton QR" downloadName={`${product.styleNumber}-carton-qr.png`} />
            ) : (
              <>
                <QrCode className="h-10 w-10 text-slate-300" />
                {canManage && (
                  <Button
                    size="sm" disabled={!finalDataSaved || cartonQrMutation.isPending}
                    title={!finalDataSaved ? "Save Final QC data first" : undefined}
                    onClick={() => cartonQrMutation.mutate()}
                  >
                    {cartonQrMutation.isPending ? "Generating..." : "Generate Carton QR"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  )
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Ban, FileDown, FileSpreadsheet, Undo2 } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { downloadFile } from "@/lib/download"
import { extractErrorMessage } from "@/lib/errors"
import type { Paginated } from "@/types/api"
import type { Product } from "@/types/sourcing"

// Mirrors the backend's IsRole on packing_list_skip: company reps and
// admins. Other roles see the review/download surface read-only.
const CAN_SKIP_ROLES = ["admin", "company_rep"]

/**
 * Pipeline step 3 — Packing List. Review + download only, per the locked
 * design: the document is generated from intake data on demand (no separate
 * entity), and the step is finished per product either by downloading it
 * (PDF or XLSX — the export endpoint stamps packingListExportedAt) or by
 * explicitly skipping (toggle). No data is edited here.
 */
export function PackingListStep({ sisterProfileId }: { sisterProfileId: string }) {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const productsQuery = useQuery({
    queryKey: ["products", "by-sister", sisterProfileId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>("/products/", {
        params: { sisterProfile: sisterProfileId, page_size: 500 },
      })
      return data.results
    },
  })

  async function refresh() {
    // A download stamps packingListExportedAt server-side, and skip toggles
    // the flag — both feed the pipeline progress, so refresh both caches.
    await queryClient.invalidateQueries({ queryKey: ["products"] })
    await queryClient.invalidateQueries({ queryKey: ["pipeline"] })
  }

  async function download(product: Product, filetype: "pdf" | "xlsx") {
    setBusyId(product.id)
    setError(null)
    try {
      await downloadFile(
        `/products/${product.id}/packing-list-export/${filetype === "xlsx" ? "?filetype=xlsx" : ""}`,
        `packing-list-${product.styleNumber}.${filetype}`,
      )
      await refresh()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const skipMutation = useMutation({
    mutationFn: async (product: Product) => {
      await api.post(`/products/${product.id}/packing-list-skip/`)
    },
    onSuccess: refresh,
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  const canSkip = !!user && CAN_SKIP_ROLES.includes(user.role)
  const products = productsQuery.data ?? []
  const exportedCount = products.filter((p) => p.packingListExportedAt).length
  const skippedCount = products.filter((p) => p.packingListSkipped).length

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        Each product's packing list is generated from its intake record (header fields + per-color rows).{" "}
        {products.length > 0
          ? `${exportedCount} exported · ${skippedCount} skipped · ${Math.max(products.length - exportedCount - skippedCount, 0)} pending.`
          : "No products on this order yet."}
      </p>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <Card>
        <CardContent className="p-0">
          {productsQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : products.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              No products yet — add them in Step 1 (Sourcing Intake) first.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Style #</th>
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">Colors</th>
                    <th className="px-4 py-2.5 font-medium">Cartons</th>
                    <th className="px-4 py-2.5 font-medium">Packing Date</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5"><code className="text-xs text-slate-500">{p.styleNumber}</code></td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{p.name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.variants.length}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.totalCartons}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.packingDate || "—"}</td>
                      <td className="px-4 py-2.5">
                        {p.packingListExportedAt ? (
                          <Badge variant="success" title={`Exported ${new Date(p.packingListExportedAt).toLocaleString()}`}>
                            Exported
                          </Badge>
                        ) : p.packingListSkipped ? (
                          <Badge variant="warning">Skipped</Badge>
                        ) : (
                          <Badge>Pending</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm" variant="ghost" title="Download PDF"
                            disabled={busyId === p.id}
                            onClick={() => download(p, "pdf")}
                          >
                            <FileDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost" title="Download Excel"
                            disabled={busyId === p.id}
                            onClick={() => download(p, "xlsx")}
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                          </Button>
                          {canSkip && (
                            <Button
                              size="sm" variant="ghost"
                              title={p.packingListSkipped ? "Un-skip (back to pending)" : "Skip the packing list for this product"}
                              disabled={skipMutation.isPending && busyId === p.id}
                              onClick={() => { setBusyId(p.id); skipMutation.mutate(p) }}
                            >
                              {p.packingListSkipped ? <Undo2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                            </Button>
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
    </div>
  )
}

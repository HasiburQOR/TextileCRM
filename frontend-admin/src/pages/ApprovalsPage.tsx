import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, X } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { extractErrorMessage } from "@/lib/errors"
import { PRODUCT_STATUS_BADGE_VARIANT, PRODUCT_STATUS_LABEL } from "@/lib/status"
import type { Paginated } from "@/types/api"
import type { Product } from "@/types/sourcing"

export function ApprovalsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [rejectTarget, setRejectTarget] = useState<Product | null>(null)
  const [approveTarget, setApproveTarget] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pendingQuery = useQuery({
    queryKey: ["products", "pending-approval"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>("/products/", { params: { page_size: 200 } })
      return data.results.filter((p) => p.status === "pending_admin_approval")
    },
  })

  const approveMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { data } = await api.post<Product>(`/products/${productId}/approve/`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      setError(null)
      setApproveTarget(null)
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Admin Approval</h1>
        <p className="text-sm text-slate-500">Sourcing requests waiting on a decision, most recent first.</p>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <Card>
        <CardContent className="p-0">
          {pendingQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner className="text-slate-400" />
            </div>
          ) : (pendingQuery.data?.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Nothing pending — all caught up.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Style #</th>
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">Sister Profile PO</th>
                    <th className="px-4 py-2.5 font-medium">Order Qty</th>
                    <th className="px-4 py-2.5 font-medium">Created By</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {pendingQuery.data!.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="cursor-pointer px-4 py-2.5" onClick={() => navigate(`/products/${p.id}`)}>
                        <code className="text-xs text-slate-500">{p.styleNumber}</code>
                      </td>
                      <td className="cursor-pointer px-4 py-2.5 font-medium text-slate-900" onClick={() => navigate(`/products/${p.id}`)}>
                        {p.name}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{p.sisterProfilePoReference}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.totalOrderQty}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.createdByName}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={PRODUCT_STATUS_BADGE_VARIANT[p.status]}>{PRODUCT_STATUS_LABEL[p.status]}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => setApproveTarget(p)}
                            disabled={approveMutation.isPending}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setRejectTarget(p)}>
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </Button>
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

      {rejectTarget && (
        <RejectDialog
          product={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onError={setError}
        />
      )}

      {approveTarget && (
        <Dialog open onClose={() => setApproveTarget(null)} title={`Approve "${approveTarget.name}"?`}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              This moves {approveTarget.styleNumber} to Approved for QC. It can't be rejected or sent back after
              this — the next step is a QC Report against it.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
              <Button disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(approveTarget.id)}>
                {approveMutation.isPending ? "Approving…" : "Approve"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function RejectDialog({ product, onClose, onError }: { product: Product; onClose: () => void; onError: (msg: string | null) => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState("")

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Product>(`/products/${product.id}/reject/`, { reason })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      onError(null)
      onClose()
    },
    onError: (err: unknown) => onError(extractErrorMessage(err)),
  })

  return (
    <Dialog open onClose={onClose} title={`Reject "${product.name}"`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (reason.trim()) rejectMutation.mutate()
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">Rejection Reason *</label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={rejectMutation.isPending || !reason.trim()}>
            {rejectMutation.isPending ? "Rejecting…" : "Reject"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

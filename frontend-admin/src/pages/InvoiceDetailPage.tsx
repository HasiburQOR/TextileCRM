import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Ban, CheckCircle2, Download, FileSpreadsheet, Plus, Trash2, XCircle, ArrowLeft } from "lucide-react"
import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { downloadFile } from "@/lib/download"
import { extractErrorMessage } from "@/lib/errors"
import type { Invoice, InvoiceStatus } from "@/types/invoicing"

const STATUS_BADGE: Record<InvoiceStatus, "warning" | "success" | "danger" | "default"> = {
  pending_approval: "warning", issued: "success", rejected: "danger", void: "default",
}
// BR-46: an Issued/Void invoice is never edited or hard-deleted — Void
// (above) is its only lifecycle exit. Pending/Rejected invoices never took
// effect, so those alone may be deleted (mirrors InvoicesPage.tsx's list-row
// delete — surfaced here too so "why can't I edit/delete this" has an answer
// on the page a user actually lands on).
const DELETABLE_STATUSES: InvoiceStatus[] = ["pending_approval", "rejected"]

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null)

  const invoiceQuery = useQuery({
    queryKey: ["invoices", id],
    queryFn: async () => { const { data } = await api.get<Invoice>(`/invoices/${id}/`); return data },
    enabled: !!id,
  })

  const isAdmin = user?.role === "admin"

  function invalidate(data: Invoice) {
    queryClient.setQueryData(["invoices", id], data)
    queryClient.invalidateQueries({ queryKey: ["invoices", "all"] })
  }

  const approveMutation = useMutation({
    mutationFn: async () => { const { data } = await api.post<Invoice>(`/invoices/${id}/approve/`); return data },
    onSuccess: invalidate,
    onError: (err: unknown) => setActionError(extractErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => { await api.delete(`/invoices/${id}/`) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", "all"] })
      navigate("/invoices")
    },
    onError: (err: unknown) => setActionError(extractErrorMessage(err)),
  })

  if (invoiceQuery.isLoading) return <div className="flex justify-center py-16"><Spinner className="text-slate-400" /></div>
  if (!invoiceQuery.data) return <p className="py-16 text-center text-sm text-slate-400">Invoice not found.</p>

  const inv = invoiceQuery.data

  async function handleExport(kind: "pdf" | "xlsx") {
    setExporting(kind)
    setActionError(null)
    try {
      await downloadFile(
        `/invoices/${id}/export/${kind === "xlsx" ? "?filetype=xlsx" : ""}`,
        `${inv.invoiceNo}.${kind}`,
      )
    } catch (err) {
      setActionError(extractErrorMessage(err))
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/invoices")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{inv.invoiceNo}</h1>
            <Badge variant={STATUS_BADGE[inv.status]}>{inv.status.replace(/_/g, " ")}</Badge>
          </div>
          <p className="text-sm text-slate-500">{inv.sisterProfilePoReference} · {inv.buyerName}</p>
        </div>
        <Button variant="outline" disabled={exporting !== null} onClick={() => handleExport("pdf")}>
          <Download className="h-4 w-4" /> {exporting === "pdf" ? "Downloading…" : "Export PDF"}
        </Button>
        <Button variant="outline" disabled={exporting !== null} onClick={() => handleExport("xlsx")}>
          <FileSpreadsheet className="h-4 w-4" /> {exporting === "xlsx" ? "Downloading…" : "Export Excel"}
        </Button>
        {isAdmin && inv.status === "pending_approval" && (
          <>
            <Button variant="outline" onClick={() => setRejectOpen(true)}>
              <XCircle className="h-4 w-4" /> Reject
            </Button>
            <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              <CheckCircle2 className="h-4 w-4" /> {approveMutation.isPending ? "Approving…" : "Approve"}
            </Button>
          </>
        )}
        {isAdmin && inv.status === "issued" && (
          <Button variant="destructive" onClick={() => setVoidOpen(true)}>
            <Ban className="h-4 w-4" /> Void
          </Button>
        )}
        {isAdmin && DELETABLE_STATUSES.includes(inv.status) && (
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
      </div>

      {actionError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>}
      {inv.status === "rejected" && inv.rejectionReason && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">Rejection reason: {inv.rejectionReason}</div>
      )}
      {inv.status === "void" && inv.voidReason && (
        <div className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600">Void reason: {inv.voidReason}</div>
      )}
      {(inv.status === "issued" || inv.status === "void") && (
        <p className="text-xs text-slate-400">
          An {inv.status} invoice can't be edited or deleted (Void, above, is its only lifecycle exit) — that keeps
          every number a buyer has already seen permanent and auditable.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Line Total" value={Number(inv.totalValue).toLocaleString()} />
        <StatCard label="Commission" value={Number(inv.commissionAmount).toLocaleString()} />
        <StatCard label="Grand Total" value={Number(inv.grandTotal).toLocaleString()} />
        <StatCard label="Outstanding" value={Number(inv.outstandingBalance).toLocaleString()} tone={Number(inv.outstandingBalance) > 0 ? "warning" : "success"} />
        {inv.targetCurrency && (
          <StatCard
            label={`Converted (@ ${Number(inv.exchangeRateValueLocked).toLocaleString(undefined, { maximumFractionDigits: 6 })} → ${inv.targetCurrency})`}
            value={`${Number(inv.convertedTotal).toLocaleString()} ${inv.targetCurrency}`}
          />
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Style/Item</th>
                <th className="px-4 py-2 font-medium">Packing List</th>
                <th className="px-4 py-2 font-medium">CTN</th>
                <th className="px-4 py-2 font-medium">Qty</th>
                <th className="px-4 py-2 font-medium">Unit Price</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Remarks</th>
              </tr></thead>
              <tbody>
                {inv.lineItems.map((li) => (
                  <tr key={li.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 font-medium text-slate-900">{li.description}</td>
                    <td className="px-4 py-2 text-slate-500">{li.styleItemCode}</td>
                    <td className="px-4 py-2 text-slate-500">{li.packingListRef || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{li.ctn}</td>
                    <td className="px-4 py-2 text-slate-500">{li.totalQty}</td>
                    <td className="px-4 py-2 text-slate-500">{Number(li.unitPrice).toLocaleString()}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{Number(li.amount).toLocaleString()}</td>
                    <td className="px-4 py-2 text-slate-400">{li.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Payments</CardTitle>
          {isAdmin && inv.status === "issued" && (
            <Button size="sm" variant="outline" onClick={() => setPaymentOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Record Payment
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {inv.payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No payments recorded yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Reference</th>
              </tr></thead>
              <tbody>
                {inv.payments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 text-slate-500">{p.paymentDate}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{Number(p.amount).toLocaleString()} {p.currency}</td>
                    <td className="px-4 py-2 text-slate-500">{p.bankReference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {deleteOpen && (
        <Dialog open onClose={() => setDeleteOpen(false)} title={`Delete "${inv.invoiceNo}"?`}>
          <div className="flex flex-col gap-4">
            {actionError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>}
            <p className="text-sm text-slate-600">
              This permanently removes the invoice — it never took effect (no payments possible against a
              {" "}{inv.status.replace(/_/g, " ")} invoice). This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {rejectOpen && (
        <ReasonDialog
          title="Reject Invoice" label="Rejection reason"
          onClose={() => setRejectOpen(false)}
          onSubmit={async (reason) => {
            const { data } = await api.post<Invoice>(`/invoices/${id}/reject/`, { reason })
            invalidate(data); setRejectOpen(false)
          }}
        />
      )}
      {voidOpen && (
        <ReasonDialog
          title="Void Invoice" label="Void reason"
          onClose={() => setVoidOpen(false)}
          onSubmit={async (reason) => {
            const { data } = await api.post<Invoice>(`/invoices/${id}/void/`, { reason })
            invalidate(data); setVoidOpen(false)
          }}
        />
      )}
      {paymentOpen && id && (
        <RecordPaymentDialog
          invoiceId={id}
          onClose={() => setPaymentOpen(false)}
          onSuccess={(data) => { invalidate(data); setPaymentOpen(false) }}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "warning" | "success" }) {
  return (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent className={`pt-0 text-xl font-semibold ${tone === "warning" ? "text-amber-600" : tone === "success" ? "text-emerald-600" : "text-slate-900"}`}>
        {value}
      </CardContent>
    </Card>
  )
}

function ReasonDialog({ title, label, onClose, onSubmit }: {
  title: string; label: string; onClose: () => void; onSubmit: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) { setError("A reason is required."); return }
    setError(null); setLoading(true)
    try { await onSubmit(reason) } catch (err) { setError(extractErrorMessage(err)) } finally { setLoading(false) }
  }
  return (
    <Dialog open onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{label} *</label>
          <Textarea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="destructive" disabled={loading}>{loading ? "Submitting..." : "Confirm"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

function RecordPaymentDialog({ invoiceId, onClose, onSuccess }: {
  invoiceId: string; onClose: () => void; onSuccess: (data: Invoice) => void
}) {
  const [amount, setAmount] = useState(0)
  const [currency, setCurrency] = useState("USD")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [bankReference, setBankReference] = useState("")
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Invoice>(`/invoices/${invoiceId}/payments/`, { amount, currency, paymentDate, bankReference })
      return data
    },
    onSuccess,
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })
  return (
    <Dialog open onClose={onClose} title="Record Payment">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Amount *</label>
            <Input required type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Currency</label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Payment Date *</label>
          <Input required type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Method / Reference</label>
          <Input value={bankReference} onChange={(e) => setBankReference(e.target.value)} placeholder="Bank transfer ref, cheque no..." />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Recording..." : "Record Payment"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

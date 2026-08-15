import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, ArrowLeft, Download, FileSpreadsheet } from "lucide-react"
import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { downloadFile } from "@/lib/download"
import { extractErrorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import type {
  PortalCosts, PortalDocument, PortalInvoice, PortalLedger, PortalOrderDetail,
  PortalPackingList, PortalProductProgress,
} from "@/types/portal"

type TabKey = "overview" | "progress" | "costs" | "ledger" | "packing" | "invoices" | "documents"

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "progress", label: "Sourcing Progress" },
  { key: "costs", label: "Costs" },
  { key: "ledger", label: "Settlement Ledger" },
  { key: "packing", label: "Packing List" },
  { key: "invoices", label: "Invoices" },
  { key: "documents", label: "Documents" },
]

export function BuyerOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>("overview")
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportingKey, setExportingKey] = useState<string | null>(null)

  async function handleExport(kind: "invoice" | "packing-list", entityId: string, filetype: "pdf" | "xlsx", filename: string) {
    const key = `${kind}:${entityId}:${filetype}`
    setExportingKey(key)
    setExportError(null)
    try {
      const base = kind === "invoice" ? `/invoices/${entityId}/export/` : `/packing-lists/${entityId}/export/`
      await downloadFile(`${base}${filetype === "xlsx" ? "?filetype=xlsx" : ""}`, filename)
    } catch (err) {
      setExportError(extractErrorMessage(err))
    } finally {
      setExportingKey(null)
    }
  }

  const orderQuery = useQuery({
    queryKey: ["portal", "orders", id],
    queryFn: async () => { const { data } = await api.get<PortalOrderDetail>(`/portal/orders/${id}/`); return data },
    enabled: !!id,
  })

  const ledgerQuery = useQuery({
    queryKey: ["portal", "orders", id, "ledger"],
    queryFn: async () => { const { data } = await api.get<PortalLedger>(`/portal/orders/${id}/ledger/`); return data },
    enabled: !!id,
  })

  const progressQuery = useQuery({
    queryKey: ["portal", "orders", id, "sourcing-progress"],
    queryFn: async () => { const { data } = await api.get<PortalProductProgress[]>(`/portal/orders/${id}/sourcing-progress/`); return data },
    enabled: !!id && tab === "progress",
  })

  const costsQuery = useQuery({
    queryKey: ["portal", "orders", id, "costs"],
    queryFn: async () => { const { data } = await api.get<PortalCosts>(`/portal/orders/${id}/costs/`); return data },
    enabled: !!id && tab === "costs",
  })

  const packingQuery = useQuery({
    queryKey: ["portal", "orders", id, "packing-list"],
    queryFn: async () => { const { data } = await api.get<PortalPackingList[]>(`/portal/orders/${id}/packing-list/`); return data },
    enabled: !!id && tab === "packing",
  })

  const invoicesQuery = useQuery({
    queryKey: ["portal", "orders", id, "invoices"],
    queryFn: async () => { const { data } = await api.get<PortalInvoice[]>(`/portal/orders/${id}/invoices/`); return data },
    enabled: !!id && tab === "invoices",
  })

  const documentsQuery = useQuery({
    queryKey: ["portal", "orders", id, "documents"],
    queryFn: async () => { const { data } = await api.get<PortalDocument[]>(`/portal/orders/${id}/documents/`); return data },
    enabled: !!id && tab === "documents",
  })

  if (orderQuery.isLoading) return <div className="flex justify-center py-16"><Spinner className="text-slate-400" /></div>
  if (!orderQuery.data) return <p className="py-16 text-center text-sm text-slate-400">Order not found.</p>
  const order = orderQuery.data
  const ledger = ledgerQuery.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/portal/orders")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{order.poReference || order.id}</h1>
            <Badge variant={order.status === "active" ? "info" : order.status === "completed" ? "success" : "danger"}>{order.status}</Badge>
          </div>
          <p className="text-sm text-slate-500">Agreement Type {order.agreementType} · Ordered {new Date(order.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {exportError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{exportError}</div>
      )}

      {ledger?.negativeBalance && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Negative balance: net position is {Number(ledger.netPosition).toLocaleString()}.
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Advance" value={ledger ? Number(ledger.totalAdvance).toLocaleString() : "—"} />
          <StatCard label="Total Expense" value={ledger ? Number(ledger.totalExpense).toLocaleString() : "—"} />
          <StatCard label="Amount Owed" value={ledger ? Number(ledger.amountOwed).toLocaleString() : "—"} />
          <StatCard label="Net Position" value={ledger ? Number(ledger.netPosition).toLocaleString() : "—"} tone={ledger?.negativeBalance ? "danger" : "success"} />
        </div>
      )}

      {tab === "progress" && (
        <ListCard loading={progressQuery.isLoading} empty={!progressQuery.data?.length} emptyText="No products sourced yet under this order.">
          <div className="flex flex-col gap-4 p-4">
            {progressQuery.data?.map((row) => (
              <Card key={row.product.id}>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle>{row.product.name}</CardTitle>
                    <p className="text-xs text-slate-400">{row.product.styleNumber} · {row.product.brandName}</p>
                  </div>
                  <Badge variant="default">{row.product.status.replace(/_/g, " ")}</Badge>
                </CardHeader>
                <CardContent className="pt-0">
                  {!row.cost ? (
                    <p className="text-sm text-slate-400">No sourcing cost recorded yet.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Badge variant={row.cost.status === "open" ? "default" : "success"}>{row.cost.status}</Badge>
                      <table className="w-full text-left text-sm">
                        <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                          <th className="px-2 py-1.5 font-medium">Location</th><th className="px-2 py-1.5 font-medium">Qty</th>
                          <th className="px-2 py-1.5 font-medium">Advance</th><th className="px-2 py-1.5 font-medium">Status</th>
                        </tr></thead>
                        <tbody>
                          {row.cost.locations?.map((loc, i) => (
                            <tr key={i} className="border-b border-slate-100 last:border-0">
                              <td className="px-2 py-1.5 font-medium text-slate-900">{loc.locationName}</td>
                              <td className="px-2 py-1.5 text-slate-500">{loc.quantity}</td>
                              <td className="px-2 py-1.5 text-slate-500">{Number(loc.advanceAmount).toLocaleString()}</td>
                              <td className="px-2 py-1.5"><Badge variant={loc.status === "reported" ? "success" : "warning"}>{loc.status}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </ListCard>
      )}

      {tab === "costs" && (
        <div className="flex flex-col gap-4">
          {costsQuery.data && (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex flex-wrap gap-4 text-sm">
                  {costsQuery.data.bySourceType?.map((s) => (
                    <span key={s.sourceType} className="text-slate-600">
                      {s.sourceType.replace(/_/g, " ")}: <strong>{Number(s.total).toLocaleString()}</strong>
                    </span>
                  ))}
                </div>
                <span className="text-lg font-semibold text-slate-900">Total: {Number(costsQuery.data.total).toLocaleString()}</span>
              </CardContent>
            </Card>
          )}
          <ListCard loading={costsQuery.isLoading} empty={!costsQuery.data?.items?.length} emptyText="No costs recorded yet.">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Source</th><th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Remarks</th><th className="px-4 py-2 font-medium">Date</th>
              </tr></thead>
              <tbody>
                {costsQuery.data?.items?.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 font-medium text-slate-900">{c.sourceType.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2 text-slate-500">{Number(c.amount).toLocaleString()} {c.currency}</td>
                    <td className="px-4 py-2 text-slate-400">{c.remarks || "—"}</td>
                    <td className="px-4 py-2 text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ListCard>
        </div>
      )}

      {tab === "ledger" && (
        <ListCard loading={ledgerQuery.isLoading} empty={!ledger} emptyText="No ledger data yet.">
          {ledger && (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Advance" value={Number(ledger.totalAdvance).toLocaleString()} />
              <StatCard label="Total Expense" value={Number(ledger.totalExpense).toLocaleString()} />
              <StatCard label="Amount Owed" value={Number(ledger.amountOwed).toLocaleString()} />
              <StatCard label="Net Position" value={Number(ledger.netPosition).toLocaleString()} tone={ledger.negativeBalance ? "danger" : "success"} />
            </div>
          )}
        </ListCard>
      )}

      {tab === "packing" && (
        <ListCard loading={packingQuery.isLoading} empty={!packingQuery.data?.length} emptyText="No packing list published yet.">
          <div className="flex flex-col gap-4 p-4">
            {packingQuery.data?.map((pl) => (
              <Card key={pl.id}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>{pl.poNo || pl.id} — {pl.brandName || "—"}</CardTitle>
                  <div className="inline-flex gap-1">
                    <Button
                      size="sm" variant="outline"
                      disabled={exportingKey === `packing-list:${pl.id}:pdf`}
                      onClick={() => handleExport("packing-list", pl.id, "pdf", `${pl.poNo || pl.id}.pdf`)}
                    >
                      <Download className="h-3 w-3" /> PDF
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      disabled={exportingKey === `packing-list:${pl.id}:xlsx`}
                      onClick={() => handleExport("packing-list", pl.id, "xlsx", `${pl.poNo || pl.id}.xlsx`)}
                    >
                      <FileSpreadsheet className="h-3 w-3" /> Excel
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-left text-xs">
                    <thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="px-2 py-1.5 font-medium">Style</th><th className="px-2 py-1.5 font-medium">Color</th>
                      <th className="px-2 py-1.5 font-medium">Cartons</th><th className="px-2 py-1.5 font-medium">Ship Qty</th>
                      <th className="px-2 py-1.5 font-medium">G.W</th><th className="px-2 py-1.5 font-medium">N.W</th><th className="px-2 py-1.5 font-medium">CBM</th>
                    </tr></thead>
                    <tbody>
                      {pl.cartons?.map((c) => (
                        <tr key={c.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-2 py-1.5 font-medium text-slate-900">{c.styleNumber}</td>
                          <td className="px-2 py-1.5 text-slate-500">{c.colorName || "—"}</td>
                          <td className="px-2 py-1.5 text-slate-500">{c.noOfCartons}</td>
                          <td className="px-2 py-1.5 text-slate-500">{c.shipQty}</td>
                          <td className="px-2 py-1.5 text-slate-500">{Number(c.totalGrossWeight).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-slate-500">{Number(c.totalNetWeight).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-slate-500">{Number(c.totalCbm).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))}
          </div>
        </ListCard>
      )}

      {tab === "invoices" && (
        <ListCard loading={invoicesQuery.isLoading} empty={!invoicesQuery.data?.length} emptyText="No invoices issued yet.">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">Invoice No</th><th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Grand Total</th><th className="px-4 py-2 font-medium">Outstanding</th>
              <th className="px-4 py-2 font-medium">Converted</th>
              <th className="px-4 py-2 font-medium" />
            </tr></thead>
            <tbody>
              {invoicesQuery.data?.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-900">{inv.invoiceNo}</td>
                  <td className="px-4 py-2 text-slate-500">{inv.status.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-slate-500">{Number(inv.grandTotal).toLocaleString()}</td>
                  <td className="px-4 py-2 text-slate-500">{Number(inv.outstandingBalance).toLocaleString()}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {inv.targetCurrency ? `${Number(inv.convertedTotal).toLocaleString()} ${inv.targetCurrency}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm" variant="outline"
                        disabled={exportingKey === `invoice:${inv.id}:pdf`}
                        onClick={() => handleExport("invoice", inv.id, "pdf", `${inv.invoiceNo}.pdf`)}
                      >
                        <Download className="h-3 w-3" /> PDF
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        disabled={exportingKey === `invoice:${inv.id}:xlsx`}
                        onClick={() => handleExport("invoice", inv.id, "xlsx", `${inv.invoiceNo}.xlsx`)}
                      >
                        <FileSpreadsheet className="h-3 w-3" /> Excel
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ListCard>
      )}

      {tab === "documents" && (
        <ListCard loading={documentsQuery.isLoading} empty={!documentsQuery.data?.length} emptyText="No documents uploaded yet.">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">File</th><th className="px-4 py-2 font-medium">Type</th><th className="px-4 py-2 font-medium">Uploaded</th>
            </tr></thead>
            <tbody>
              {documentsQuery.data?.map((doc) => (
                <tr key={doc.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">
                    <a href={doc.file} target="_blank" rel="noreferrer" className="font-medium text-slate-900 hover:underline">{doc.fileName}</a>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{doc.documentType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-slate-400">{new Date(doc.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ListCard>
      )}
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent className={cn("pt-0 text-xl font-semibold", tone === "danger" ? "text-red-600" : tone === "success" ? "text-emerald-600" : "text-slate-900")}>
        {value}
      </CardContent>
    </Card>
  )
}

function ListCard({ loading, empty, emptyText, children }: { loading: boolean; empty: boolean; emptyText: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
        ) : empty ? (
          <p className="py-10 text-center text-sm text-slate-400">{emptyText}</p>
        ) : (
          <div className="overflow-x-auto">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}

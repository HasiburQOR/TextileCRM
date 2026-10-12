import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Download, FileSpreadsheet } from "lucide-react"
import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { downloadFile } from "@/lib/download"
import { extractErrorMessage } from "@/lib/errors"
import { resolveMediaUrl } from "@/lib/media"
import { cn } from "@/lib/utils"
import type {
  PortalCosts, PortalDocument, PortalInvoice, PortalOrderDetail,
  PortalPackingList, PortalProductProgress,
} from "@/types/portal"

type TabKey = "overview" | "progress" | "costs" | "packing" | "invoices" | "documents"

function money(value: string | number | null | undefined, currency?: string) {
  const text = Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency ? `${text} ${currency}` : text
}

const label = (code: string) => code.replace(/_/g, " ")

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "progress", label: "Sourcing Progress" },
  { key: "costs", label: "Costs" },
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
      const base = kind === "invoice" ? `/invoices/${entityId}/export/` : `/products/${entityId}/packing-list-export/`
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

  const progressQuery = useQuery({
    queryKey: ["portal", "orders", id, "sourcing-progress"],
    queryFn: async () => { const { data } = await api.get<PortalProductProgress[]>(`/portal/orders/${id}/sourcing-progress/`); return data },
    enabled: !!id && tab === "progress",
  })

  const costsQuery = useQuery({
    queryKey: ["portal", "orders", id, "costs"],
    queryFn: async () => { const { data } = await api.get<PortalCosts>(`/portal/orders/${id}/costs/`); return data },
    enabled: !!id && (tab === "costs" || tab === "overview"),
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
  const costs = costsQuery.data
  const rate = Number(order.exchangeRate)
  // Without an agreed rate nothing was converted, so the buyer-currency
  // totals would read 0.00 — fall back to the cost as incurred.
  const chargedTotal = costs ? (rate ? money(costs.totalBuyer, costs.buyerCurrency) : money(costs.total, costs.supplierCurrency)) : "—"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/portal/orders")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{order.poReference || order.referenceCode}</h1>
            <Badge variant={order.status === "active" ? "info" : order.status === "completed" ? "success" : "danger"}>{order.status}</Badge>
          </div>
          <p className="text-sm text-slate-500">Agreement Type {order.agreementType} · Ordered {new Date(order.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {exportError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{exportError}</div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "shrink-0 cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Status" value={order.status.charAt(0).toUpperCase() + order.status.slice(1)} />
          <StatCard label="Agreement Type" value={`Type ${order.agreementType}`} />
          <StatCard
            label="Exchange Rate"
            value={rate ? `1 ${order.buyerCurrency} = ${rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${order.supplierCurrency}` : "Not set yet"}
          />
          <StatCard label="Costs Charged So Far" value={costsQuery.isLoading ? "…" : chargedTotal} />
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
                  <Badge variant="default">{label(row.product.status)}</Badge>
                </CardHeader>
                <CardContent className="pt-0">
                  {!row.cost ? (
                    <p className="text-sm text-slate-400">No sourcing cost recorded yet.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div><Badge variant={row.cost.status === "open" ? "default" : "success"}>{row.cost.status === "open" ? "Costs open" : "Costs closed"}</Badge></div>
                      <table className="w-full text-left text-sm">
                        <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                          <th className="px-2 py-1.5 font-medium">Location</th><th className="px-2 py-1.5 font-medium">Qty</th>
                          <th className="px-2 py-1.5 font-medium">Costs</th>
                          <th className="px-2 py-1.5 text-right font-medium">Amount ({order.supplierCurrency})</th>
                        </tr></thead>
                        <tbody>
                          {row.cost.items?.map((loc, i) => {
                            const fields = loc.customCostFields ?? []
                            return (
                              <tr key={i} className="border-b border-slate-100 align-top last:border-0">
                                <td className="px-2 py-1.5 font-medium text-slate-900">{loc.locationName}</td>
                                <td className="px-2 py-1.5 text-slate-500">{loc.quantity}</td>
                                <td className="px-2 py-1.5 text-slate-500">{fields.map((cf) => cf.name).filter(Boolean).join(", ") || "—"}</td>
                                <td className="px-2 py-1.5 text-right text-slate-700">{money(fields.reduce((s, cf) => s + (Number(cf.amount) || 0), 0))}</td>
                              </tr>
                            )
                          })}
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
                    <span key={s.sourceType} className="capitalize text-slate-600">
                      {label(s.sourceType)}: <strong>{rate ? money(s.totalBuyer, costsQuery.data.buyerCurrency) : money(s.total, costsQuery.data.supplierCurrency)}</strong>
                    </span>
                  ))}
                </div>
                <span className="text-lg font-semibold text-slate-900">Total: {chargedTotal}</span>
              </CardContent>
            </Card>
          )}
          <ListCard loading={costsQuery.isLoading} empty={!costsQuery.data?.items?.length} emptyText="No costs recorded yet.">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Source</th><th className="px-4 py-2 font-medium">Spent on your behalf</th>
                <th className="px-4 py-2 font-medium">Charged to you</th>
                <th className="px-4 py-2 font-medium">Remarks</th><th className="px-4 py-2 font-medium">Date</th>
              </tr></thead>
              <tbody>
                {costsQuery.data?.items?.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 font-medium capitalize text-slate-900">{label(c.sourceType)}</td>
                    <td className="px-4 py-2 text-slate-500">{money(c.amount, c.currency)}</td>
                    <td className="px-4 py-2 text-slate-700">{c.buyerCurrency ? money(c.amountInBuyerCurrency, c.buyerCurrency) : "—"}</td>
                    <td className="px-4 py-2 text-slate-400">{c.remarks || "—"}</td>
                    <td className="px-4 py-2 text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ListCard>
        </div>
      )}

      {tab === "packing" && (
        <ListCard loading={packingQuery.isLoading} empty={!packingQuery.data?.length} emptyText="No products on this order yet.">
          <div className="flex flex-col gap-4 p-4">
            {packingQuery.data?.map((pl) => (
              <Card key={pl.id}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>{pl.poNo || pl.styleNumber} — {pl.brandName || "—"}</CardTitle>
                  <div className="inline-flex gap-1">
                    <Button
                      size="sm" variant="outline"
                      disabled={exportingKey === `packing-list:${pl.id}:pdf`}
                      onClick={() => handleExport("packing-list", pl.id, "pdf", `${pl.poNo || pl.styleNumber}.pdf`)}
                    >
                      <Download className="h-3 w-3" /> PDF
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      disabled={exportingKey === `packing-list:${pl.id}:xlsx`}
                      onClick={() => handleExport("packing-list", pl.id, "xlsx", `${pl.poNo || pl.styleNumber}.xlsx`)}
                    >
                      <FileSpreadsheet className="h-3 w-3" /> Excel
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="px-2 py-1.5 font-medium">Style</th><th className="px-2 py-1.5 font-medium">Color</th>
                      <th className="px-2 py-1.5 font-medium">Cartons</th><th className="px-2 py-1.5 font-medium">Ship Qty</th>
                      <th className="px-2 py-1.5 font-medium">G.W</th><th className="px-2 py-1.5 font-medium">N.W</th><th className="px-2 py-1.5 font-medium">CBM</th>
                    </tr></thead>
                    <tbody>
                      {pl.variants?.map((c) => (
                        <tr key={c.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-2 py-1.5 font-medium text-slate-900">{pl.styleNumber}</td>
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
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ListCard>
      )}

      {tab === "invoices" && (
        <ListCard loading={invoicesQuery.isLoading} empty={!invoicesQuery.data?.length} emptyText="No invoices issued yet.">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">Invoice No</th><th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Total Value</th>
              <th className="px-4 py-2 font-medium">Converted</th>
              <th className="px-4 py-2 font-medium" />
            </tr></thead>
            <tbody>
              {invoicesQuery.data?.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-900">{inv.invoiceNo}</td>
                  <td className="px-4 py-2 capitalize text-slate-500">{label(inv.status)}</td>
                  <td className="px-4 py-2 text-slate-500">{money(inv.grandTotal, inv.sourceCurrency)}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {inv.targetCurrency ? money(inv.convertedTotal, inv.targetCurrency) : "—"}
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
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">File</th><th className="px-4 py-2 font-medium">Type</th><th className="px-4 py-2 font-medium">Uploaded</th>
            </tr></thead>
            <tbody>
              {documentsQuery.data?.map((doc) => (
                <tr key={doc.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">
                    <a href={resolveMediaUrl(doc.file)} target="_blank" rel="noreferrer" className="font-medium text-slate-900 underline decoration-slate-300 hover:decoration-slate-900">{doc.fileName}</a>
                  </td>
                  <td className="px-4 py-2 capitalize text-slate-500">{label(doc.documentType)}</td>
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent className="pt-0 text-xl font-semibold text-slate-900">{value}</CardContent>
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

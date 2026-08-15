import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, ArrowLeft } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Paginated } from "@/types/api"
import type { SisterProfile } from "@/types/buyers"
import type { Invoice } from "@/types/invoicing"
import type { PackingList } from "@/types/packing"
import type { Product, SourcingCost } from "@/types/sourcing"

interface SettlementLedgerRow {
  sisterProfile: string; totalAdvance: string; totalExpense: string
  amountOwed: string; netPosition: string; negativeBalance: boolean; updatedAt: string
}

interface ExpenseRow {
  id: string; sourceType: string; amount: string; currency: string
  remarks: string; productName: string | null; createdAt: string
}

interface DocumentRow {
  id: string; documentType: string; file: string; fileName: string; createdAt: string
}

type TabKey = "overview" | "products" | "costs" | "packing" | "expenses" | "invoices" | "documents"

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "products", label: "Products" },
  { key: "costs", label: "Sourcing Costs" },
  { key: "packing", label: "Packing Lists" },
  { key: "expenses", label: "Expenses" },
  { key: "invoices", label: "Invoices" },
  { key: "documents", label: "Documents" },
]

export function SisterProfileDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>("overview")

  const profileQuery = useQuery({
    queryKey: ["sister-profiles", id],
    queryFn: async () => { const { data } = await api.get<SisterProfile>(`/sister-profiles/${id}/`); return data },
    enabled: !!id,
  })

  const ledgerQuery = useQuery({
    queryKey: ["settlements", id],
    queryFn: async () => { const { data } = await api.get<SettlementLedgerRow>(`/settlements/${id}/`); return data },
    enabled: !!id,
  })

  const productsQuery = useQuery({
    queryKey: ["products", "by-sister-profile", id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>("/products/", { params: { sisterProfile: id, page_size: 200 } })
      return data.results
    },
    enabled: !!id && (tab === "products" || tab === "costs"),
  })

  const costsQuery = useQuery({
    queryKey: ["sourcing-costs", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SourcingCost>>("/sourcing-costs/", { params: { page_size: 200 } })
      return data.results
    },
    enabled: !!id && tab === "costs",
  })
  const costsForProfile = useMemo(
    () => (costsQuery.data ?? []).filter((t) => t.sisterProfile === id),
    [costsQuery.data, id],
  )

  const packingListsQuery = useQuery({
    queryKey: ["packing-lists", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<PackingList>>("/packing-lists/", { params: { page_size: 200 } })
      return data.results
    },
    enabled: !!id && tab === "packing",
  })
  const packingListsForProfile = useMemo(
    () => (packingListsQuery.data ?? []).filter((pl) => pl.sisterProfile === id),
    [packingListsQuery.data, id],
  )

  const expensesQuery = useQuery({
    queryKey: ["expenses", "by-sister-profile", id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ExpenseRow>>("/expenses/", { params: { sisterProfile: id, page_size: 200 } })
      return data.results
    },
    enabled: !!id && tab === "expenses",
  })

  const invoicesQuery = useQuery({
    queryKey: ["invoices", "by-sister-profile", id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Invoice>>("/invoices/", { params: { sisterProfile: id, status: "all", page_size: 200 } })
      return data.results
    },
    enabled: !!id && tab === "invoices",
  })

  const documentsQuery = useQuery({
    queryKey: ["documents", "by-sister-profile", id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<DocumentRow>>("/documents/", { params: { sisterProfile: id, page_size: 200 } })
      return data.results
    },
    enabled: !!id && tab === "documents",
  })

  if (profileQuery.isLoading) {
    return <div className="flex justify-center py-16"><Spinner className="text-slate-400" /></div>
  }
  if (!profileQuery.data) {
    return <p className="py-16 text-center text-sm text-slate-400">Sister Profile not found.</p>
  }
  const profile = profileQuery.data
  const ledger = ledgerQuery.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/sister-profiles")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{profile.poReference || profile.id}</h1>
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{profile.referenceCode}</code>
            <Badge variant={profile.status === "active" ? "info" : profile.status === "completed" ? "success" : "danger"}>
              {profile.status}
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            {profile.buyerProfileName} · Agreement Type {profile.agreementType}
            {profile.rateLocked && " · rate locked (cost entries exist)"}
          </p>
        </div>
      </div>

      {ledger?.negativeBalance && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Negative balance: net position is {Number(ledger.netPosition).toLocaleString()}. Review the Settlement Ledger.
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
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
          <StatCard
            label="Net Position"
            value={ledger ? Number(ledger.netPosition).toLocaleString() : "—"}
            tone={ledger?.negativeBalance ? "danger" : "success"}
          />
        </div>
      )}

      {tab === "products" && (
        <ListCard
          loading={productsQuery.isLoading}
          empty={!productsQuery.data?.length}
          emptyText="No products sourced yet under this profile."
        >
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">Style No</th><th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 font-medium">Order Qty</th>
            </tr></thead>
            <tbody>
              {productsQuery.data?.map((p) => (
                <tr key={p.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" onClick={() => navigate(`/products/${p.id}`)}>
                  <td className="px-4 py-2 font-medium text-slate-900">{p.styleNumber}</td>
                  <td className="px-4 py-2 text-slate-500">{p.name}</td>
                  <td className="px-4 py-2 text-slate-500">{p.status.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-slate-500">{p.totalOrderQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ListCard>
      )}

      {tab === "costs" && (
        <ListCard
          loading={productsQuery.isLoading || costsQuery.isLoading}
          empty={!costsForProfile.length}
          emptyText="No sourcing costs yet under this profile."
        >
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">PO Reference</th><th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Items</th><th className="px-4 py-2 font-medium">Total Amount</th>
            </tr></thead>
            <tbody>
              {costsForProfile.map((t) => (
                <tr key={t.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" onClick={() => navigate(`/sourcing-costs/${t.id}`)}>
                  <td className="px-4 py-2 font-medium text-slate-900">{t.poReference}</td>
                  <td className="px-4 py-2"><Badge variant={t.status === "open" ? "default" : "success"}>{t.status}</Badge></td>
                  <td className="px-4 py-2 text-slate-500">{t.items.length}</td>
                  <td className="px-4 py-2 text-slate-500">{Number(t.totalAmount || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ListCard>
      )}

      {tab === "packing" && (
        <ListCard
          loading={packingListsQuery.isLoading}
          empty={!packingListsForProfile.length}
          emptyText="No packing lists yet under this profile."
        >
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">PO No</th><th className="px-4 py-2 font-medium">Brand</th>
              <th className="px-4 py-2 font-medium">Cartons</th><th className="px-4 py-2 font-medium">CBM</th>
            </tr></thead>
            <tbody>
              {packingListsForProfile.map((pl) => (
                <tr key={pl.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" onClick={() => navigate(`/packing-lists/${pl.id}`)}>
                  <td className="px-4 py-2 font-medium text-slate-900">{pl.poNo || "—"}</td>
                  <td className="px-4 py-2 text-slate-500">{pl.brandName || "—"}</td>
                  <td className="px-4 py-2 text-slate-500">{pl.totalCartonQty}</td>
                  <td className="px-4 py-2 text-slate-500">{Number(pl.totalCbm).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ListCard>
      )}

      {tab === "expenses" && (
        <ListCard loading={expensesQuery.isLoading} empty={!expensesQuery.data?.length} emptyText="No expenses recorded yet.">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">Source</th><th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 font-medium">Amount</th><th className="px-4 py-2 font-medium">Date</th>
            </tr></thead>
            <tbody>
              {expensesQuery.data?.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-900">{e.sourceType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-slate-500">{e.productName || "—"}</td>
                  <td className="px-4 py-2 text-slate-500">{Number(e.amount).toLocaleString()} {e.currency}</td>
                  <td className="px-4 py-2 text-slate-400">{new Date(e.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ListCard>
      )}

      {tab === "invoices" && (
        <ListCard loading={invoicesQuery.isLoading} empty={!invoicesQuery.data?.length} emptyText="No invoices generated yet.">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">Invoice No</th><th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Grand Total</th><th className="px-4 py-2 font-medium">Outstanding</th>
            </tr></thead>
            <tbody>
              {invoicesQuery.data?.map((inv) => (
                <tr key={inv.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <td className="px-4 py-2 font-medium text-slate-900">{inv.invoiceNo}</td>
                  <td className="px-4 py-2 text-slate-500">{inv.status.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-slate-500">{Number(inv.grandTotal).toLocaleString()}</td>
                  <td className="px-4 py-2 text-slate-500">{Number(inv.outstandingBalance).toLocaleString()}</td>
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
              <th className="px-4 py-2 font-medium">File</th><th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Uploaded</th>
            </tr></thead>
            <tbody>
              {documentsQuery.data?.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">
                    <a href={d.file} target="_blank" rel="noreferrer" className="font-medium text-slate-900 hover:underline">{d.fileName}</a>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{d.documentType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-slate-400">{new Date(d.createdAt).toLocaleDateString()}</td>
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

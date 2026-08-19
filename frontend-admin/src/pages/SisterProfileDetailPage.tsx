import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, ArrowLeft } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { extractErrorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import type { Paginated } from "@/types/api"
import type { CostBreakdown, SisterProfile, SisterProfileUpdateInput } from "@/types/buyers"
import { AGREEMENTS } from "@/types/buyers"
import type { Invoice } from "@/types/invoicing"
import type { PackingList } from "@/types/packing"
import type { Product, SourcingCost } from "@/types/sourcing"


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
  const [editOpen, setEditOpen] = useState(false)

  const profileQuery = useQuery({
    queryKey: ["sister-profiles", id],
    queryFn: async () => { const { data } = await api.get<SisterProfile>(`/sister-profiles/${id}/`); return data },
    enabled: !!id,
  })

  const breakdownQuery = useQuery({
    queryKey: ["sister-profiles", id, "cost-breakdown"],
    queryFn: async () => {
      const { data } = await api.get<CostBreakdown>(`/sister-profiles/${id}/cost-breakdown/`)
      return data
    },
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
  const breakdown = breakdownQuery.data
  const agreement = AGREEMENTS[profile.agreementType]
  const money = (value: string | null | undefined, currency: string) =>
    value == null ? "—" : `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`

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
            {profile.buyerProfileName} · {agreement?.short ?? `Type ${profile.agreementType}`}
            {" · "}{profile.supplierCurrency} → {profile.buyerCurrency}
            {profile.rateLocked && " · currency locked (cost entries exist)"}
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
      </div>

      {Number(profile.exchangeRate) <= 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No exchange rate set for this order. Costs are charged to the buyer's wallet unconverted until one is
          agreed, and invoices will print no converted total.
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
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Agreement</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 pt-0">
              <p className="text-sm font-medium text-slate-900">{agreement?.title ?? `Type ${profile.agreementType}`}</p>
              <p className="text-sm leading-relaxed text-slate-500">{agreement?.explanation}</p>
              <p className="text-xs text-slate-400">
                The {agreement?.rateLabel.toLowerCase()} is entered on each invoice, so it can differ per shipment.
              </p>
              <dl className="mt-2 grid grid-cols-3 gap-4 border-t border-slate-100 pt-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-400">Supplier currency</dt>
                  <dd className="font-medium text-slate-900">{profile.supplierCurrency}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Buyer currency</dt>
                  <dd className="font-medium text-slate-900">{profile.buyerCurrency}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Exchange rate</dt>
                  <dd className="font-medium text-slate-900">{breakdown?.rateLabel || "Not set"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={`Sourcing (${profile.supplierCurrency})`}
              value={money(breakdown?.groups.sourcing.amount, profile.supplierCurrency)}
              sub={money(breakdown?.groups.sourcing.amountBuyer, profile.buyerCurrency)}
            />
            <StatCard
              label={`Warehouse (${profile.supplierCurrency})`}
              value={money(breakdown?.groups.warehouse.amount, profile.supplierCurrency)}
              sub={money(breakdown?.groups.warehouse.amountBuyer, profile.buyerCurrency)}
            />
            <StatCard
              label={`QC & other (${profile.supplierCurrency})`}
              value={money(
                breakdown
                  ? String(Number(breakdown.groups.qc.amount) + Number(breakdown.groups.other.amount))
                  : undefined,
                profile.supplierCurrency,
              )}
              sub={money(
                breakdown
                  ? String(Number(breakdown.groups.qc.amountBuyer) + Number(breakdown.groups.other.amountBuyer))
                  : undefined,
                profile.buyerCurrency,
              )}
            />
            <StatCard
              label="Total spent"
              value={money(breakdown?.total.amount, profile.supplierCurrency)}
              sub={money(breakdown?.total.amountBuyer, profile.buyerCurrency)}
            />
          </div>

          {!!breakdown?.units.totalOrderQty && (
            <Card>
              <CardHeader><CardTitle>Cost per piece</CardTitle></CardHeader>
              <CardContent className="pt-0 text-sm text-slate-600">
                {breakdown.units.totalOrderQty.toLocaleString()} pcs on order ·{" "}
                <span className="font-medium text-slate-900">
                  {money(breakdown.units.unitCost, profile.supplierCurrency)}
                </span>{" "}
                <span className="text-slate-400">
                  ({money(breakdown.units.unitCostBuyer, profile.buyerCurrency)}) per piece in recorded costs
                </span>
              </CardContent>
            </Card>
          )}
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
              <th className="px-4 py-2 font-medium">Total Value</th>
            </tr></thead>
            <tbody>
              {invoicesQuery.data?.map((inv) => (
                <tr key={inv.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <td className="px-4 py-2 font-medium text-slate-900">{inv.invoiceNo}</td>
                  <td className="px-4 py-2 text-slate-500">{inv.status.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-slate-500">{Number(inv.grandTotal).toLocaleString()}</td>
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

      {editOpen && <EditSisterProfileDialog profile={profile} onClose={() => setEditOpen(false)} />}
    </div>
  )
}

function StatCard({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: "success" | "danger"
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent className={cn("pt-0", tone === "danger" ? "text-red-600" : tone === "success" ? "text-emerald-600" : "text-slate-900")}>
        <div className="text-xl font-semibold">{value}</div>
        {sub && <div className="mt-0.5 text-sm font-normal text-slate-400">{sub}</div>}
      </CardContent>
    </Card>
  )
}

function EditSisterProfileDialog({ profile, onClose }: { profile: SisterProfile; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [poReference, setPoReference] = useState(profile.poReference)
  const [supplierCurrency, setSupplierCurrency] = useState(profile.supplierCurrency)
  const [buyerCurrency, setBuyerCurrency] = useState(profile.buyerCurrency)
  const [exchangeRate, setExchangeRate] = useState(String(profile.exchangeRate ?? ""))
  const [status, setStatus] = useState(profile.status)

  const mutation = useMutation({
    mutationFn: async (input: SisterProfileUpdateInput) => {
      const { data } = await api.patch<SisterProfile>(`/sister-profiles/${profile.id}/`, input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sister-profiles"] })
      onClose()
    },
  })

  return (
    <Dialog open onClose={onClose} title="Edit Sister Profile">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate({
            poReference,
            supplierCurrency: supplierCurrency.trim().toUpperCase(),
            buyerCurrency: buyerCurrency.trim().toUpperCase(),
            exchangeRate: exchangeRate.trim() || "0",
            status,
          })
        }}
      >
        {mutation.error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{extractErrorMessage(mutation.error)}</div>
        )}
        {profile.rateLocked && (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            Costs have already been recorded against this order, so its currency configuration is frozen — changing
            it would restate money the buyer was already charged. Invoices already issued keep their own locked rate
            regardless.
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">PO Reference</label>
          <Input value={poReference} onChange={(e) => setPoReference(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Supplier currency</label>
            <Input
              maxLength={8} value={supplierCurrency} disabled={profile.rateLocked}
              onChange={(e) => setSupplierCurrency(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Buyer currency</label>
            <Input
              maxLength={8} value={buyerCurrency} disabled={profile.rateLocked}
              onChange={(e) => setBuyerCurrency(e.target.value.toUpperCase())}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Exchange rate</label>
          <Input
            type="number" min={0} step="0.000001" value={exchangeRate} disabled={profile.rateLocked}
            onChange={(e) => setExchangeRate(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">
            {Number(exchangeRate) > 0
              ? `1 ${buyerCurrency} = ${exchangeRate} ${supplierCurrency}`
              : "No rate — costs pass through unconverted."}
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as SisterProfile["status"])}>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </Dialog>
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

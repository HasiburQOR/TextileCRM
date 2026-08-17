import { useQuery } from "@tanstack/react-query"
import { AlertTriangle } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { PRODUCT_STATUS_BADGE_VARIANT, PRODUCT_STATUS_LABEL } from "@/lib/status"
import type { Paginated } from "@/types/api"
import type { ProductStatus } from "@/types/sourcing"
import type { BuyerWallet, WalletSummary } from "@/types/wallet"

interface ProductSummary {
  id: string
  name: string
  styleNumber: string
  status: ProductStatus
  brandName: string
  createdAt: string
}

function useCount(key: string, params: Record<string, string>) {
  return useQuery({
    queryKey: [key, params],
    queryFn: async () => {
      const { data } = await api.get<Paginated<unknown>>(`/${key}/`, { params: { ...params, page_size: 1 } })
      return data.count
    },
  })
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const isAdmin = user?.role === "admin"

  const totalProducts = useCount("products", {})
  const pendingApprovals = useCount("products", { status: "pending_admin_approval" })
  const totalInvoices = useCount("invoices", {})
  const issuedInvoices = useCount("invoices", { status: "issued" })

  // Buyer_Wallet_Module.md "Dashboard (Module 1) update": the cash-liquidity
  // signal — which buyers have spent past what they have funded.
  const negativeWallets = useQuery({
    queryKey: ["wallets", "negative-balance"],
    queryFn: async () => {
      const { data } = await api.get<BuyerWallet[]>("/wallets/negative-balance/")
      return data
    },
    enabled: isAdmin,
  })

  const walletSummary = useQuery({
    queryKey: ["wallets", "summary"],
    queryFn: async () => {
      const { data } = await api.get<WalletSummary>("/wallets/summary/")
      return data
    },
    enabled: isAdmin,
  })

  const recentProducts = useQuery({
    queryKey: ["products", "recent"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ProductSummary>>("/products/", { params: { page_size: 8 } })
      return data.results
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Welcome back, {user?.name || user?.username}.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Products" value={totalProducts.data} loading={totalProducts.isLoading} />
        <StatCard label="Pending Approval" value={pendingApprovals.data} loading={pendingApprovals.isLoading} />
        <StatCard label="Total Invoices" value={totalInvoices.data} loading={totalInvoices.isLoading} />
        <StatCard label="Issued Invoices" value={issuedInvoices.data} loading={issuedInvoices.isLoading} />
      </div>

      {/* What buyers have funded and what has been charged against it. Shown
          per currency, never as one number: wallets are per-buyer and each
          names its own currency, so a single total would add USD to EUR. */}
      {isAdmin && walletSummary.data && (
        <Card>
          <CardHeader><CardTitle>Buyer funds</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {walletSummary.data.byCurrency.length === 0 ? (
              <p className="text-sm text-slate-400">No wallet activity yet.</p>
            ) : (
              walletSummary.data.byCurrency.map((row) => (
                <div key={row.currency} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Figure label={`Received (${row.currency})`} value={row.topUps} currency={row.currency} tone="positive" />
                  <Figure label={`Charged (${row.currency})`} value={row.charged} currency={row.currency} />
                  <Figure label={`Refunded (${row.currency})`} value={row.refunded} currency={row.currency} />
                  <Figure
                    label={`Balance held (${row.currency})`}
                    value={row.balance}
                    currency={row.currency}
                    tone={Number(row.balance) < 0 ? "negative" : undefined}
                  />
                </div>
              ))
            )}
            {walletSummary.data.bySupplierCurrency.length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Spent on the supplier side</p>
                <div className="flex flex-wrap gap-6">
                  {walletSummary.data.bySupplierCurrency.map((row) => (
                    <Figure key={row.currency} label={row.currency} value={row.spent} currency={row.currency} />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && negativeWallets.data && negativeWallets.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" /> Buyers with Negative Wallet Balance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-col divide-y divide-slate-100">
              {negativeWallets.data.map((w) => (
                <div
                  key={w.buyerProfile}
                  className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-slate-50"
                  onClick={() => navigate(`/buyers/${w.buyerProfile}`)}
                >
                  <span className="text-sm font-medium text-slate-900">{w.buyerProfileName}</span>
                  <span className="text-sm font-semibold text-red-600">{Number(w.balance).toLocaleString()} {w.currency}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Sourcing Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {recentProducts.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="text-slate-400" />
            </div>
          ) : recentProducts.data && recentProducts.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 font-medium">Style #</th>
                    <th className="pb-2 font-medium">Brand</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentProducts.data.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 font-medium text-slate-900">{p.name}</td>
                      <td className="py-2.5 text-slate-500">
                        <code className="text-xs">{p.styleNumber}</code>
                      </td>
                      <td className="py-2.5 text-slate-500">{p.brandName}</td>
                      <td className="py-2.5">
                        <Badge variant={PRODUCT_STATUS_BADGE_VARIANT[p.status]}>{PRODUCT_STATUS_LABEL[p.status] ?? p.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">No sourcing requests yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Figure({ label, value, currency, tone }: {
  label: string; value: string; currency: string; tone?: "positive" | "negative"
}) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div
        className={
          tone === "positive" ? "text-lg font-semibold text-emerald-600"
            : tone === "negative" ? "text-lg font-semibold text-red-600"
            : "text-lg font-semibold text-slate-900"
        }
      >
        {Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
      </div>
    </div>
  )
}

function StatCard({ label, value, loading }: { label: string; value?: number; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <Spinner className="text-slate-400" /> : <div className="text-2xl font-semibold text-slate-900">{value ?? 0}</div>}
      </CardContent>
    </Card>
  )
}

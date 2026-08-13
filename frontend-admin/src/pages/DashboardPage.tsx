import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { PRODUCT_STATUS_BADGE_VARIANT, PRODUCT_STATUS_LABEL } from "@/lib/status"
import type { Paginated } from "@/types/api"
import type { ProductStatus } from "@/types/sourcing"

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

  const totalProducts = useCount("products", {})
  const pendingApprovals = useCount("products", { status: "pending_admin_approval" })
  const totalInvoices = useCount("invoices", {})
  const issuedInvoices = useCount("invoices", { status: "issued" })

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

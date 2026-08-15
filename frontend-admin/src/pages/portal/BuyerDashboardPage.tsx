import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, MapPin } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { cn } from "@/lib/utils"
import type { PortalDashboard } from "@/types/portal"

export function BuyerDashboardPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const dashboardQuery = useQuery({
    queryKey: ["portal", "dashboard"],
    queryFn: async () => {
      const { data } = await api.get<PortalDashboard>("/portal/dashboard/")
      return data
    },
  })

  if (dashboardQuery.isLoading) {
    return <div className="flex justify-center py-16"><Spinner className="text-slate-400" /></div>
  }
  if (!dashboardQuery.data) {
    return <p className="py-16 text-center text-sm text-slate-400">Unable to load your dashboard.</p>
  }
  const d = dashboardQuery.data

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Welcome, {d.buyerProfile?.name ?? "—"}</h1>
        <p className="text-sm text-slate-500">{user?.username} · Buyer Portal</p>
      </div>

      {(d.alerts?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2">
          {d.alerts?.map((a) => (
            <div
              key={a.sisterProfileId}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 hover:bg-red-100"
              onClick={() => navigate(`/portal/orders/${a.sisterProfileId}`)}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Order {a.poReference} has a negative balance of {Number(a.netPosition).toLocaleString()}. View Settlement Ledger →
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Orders" value={d.kpis.totalOrders} />
        <StatCard label="Orders In Progress" value={d.kpis.ordersInProgress} />
        <StatCard label="Orders Completed" value={d.kpis.ordersCompleted} />
        <StatCard
          label="Invoices Outstanding"
          value={Number(d.kpis.invoicesOutstanding).toLocaleString()}
          tone={Number(d.kpis.invoicesOutstanding) > 0 ? "danger" : "success"}
        />
      </div>
      {Number(d.kpis.negativeSettlementBalance) > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Recorded expense exceeds advance on one or more orders by {Number(d.kpis.negativeSettlementBalance).toLocaleString()} in total — see Settlement Ledger on the order for details.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Active Sourcing Costs</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(d.activeSourcingCosts?.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No sourcing costs currently open.</p>
            ) : (
              <div className="flex flex-col divide-y divide-slate-100">
                {d.activeSourcingCosts?.map((t) => (
                  <div
                    key={t.id}
                    className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-slate-50"
                    onClick={() => navigate(`/portal/orders/${t.sisterProfileId}`)}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{t.productName}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3" /> {t.poReference}</p>
                    </div>
                    <Badge variant={t.locationsReported === t.locationsTotal && t.locationsTotal > 0 ? "success" : "warning"}>
                      {t.locationsReported} of {t.locationsTotal} locations reported
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(d.recentActivity?.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No recent activity yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-slate-100">
                {d.recentActivity?.map((n) => (
                  <div key={n.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-500">{n.message}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "danger" }) {
  return (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent className={cn("pt-0 text-2xl font-semibold", tone === "danger" ? "text-red-600" : tone === "success" ? "text-emerald-600" : "text-slate-900")}>
        {value}
      </CardContent>
    </Card>
  )
}

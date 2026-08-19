import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { PortalOrder, PortalOrderStatus } from "@/types/portal"

const STATUS_BADGE: Record<PortalOrderStatus, "info" | "success" | "danger"> = {
  active: "info", completed: "success", cancelled: "danger",
}

export function BuyerOrdersPage() {
  const navigate = useNavigate()

  const ordersQuery = useQuery({
    queryKey: ["portal", "orders"],
    queryFn: async () => {
      const { data } = await api.get<PortalOrder[]>("/portal/orders/")
      return data
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">My Orders</h1>
        <p className="text-sm text-slate-500">Every Purchase Order / shipment under your account.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {ordersQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : !ordersQuery.data?.length ? (
            <p className="py-10 text-center text-sm text-slate-400">No orders yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">PO Reference</th>
                  <th className="px-4 py-3 font-medium">Agreement Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Order Date</th>
                  <th className="px-4 py-3 font-medium">Current Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ordersQuery.data.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/portal/orders/${o.id}`)}>
                    <td className="px-4 py-3 font-medium text-slate-900">{o.poReference || o.id}</td>
                    <td className="px-4 py-3 text-slate-500">Type {o.agreementType}</td>
                    <td className="px-4 py-3"><Badge variant={STATUS_BADGE[o.status]}>{o.status}</Badge></td>
                    <td className="px-4 py-3 text-slate-400">{new Date(o.createdAt).toLocaleDateString()}</td>
                    <td className={cn("px-4 py-3 font-semibold", Number(o.currentBalance) < 0 ? "text-red-600" : "text-emerald-600")}>
                      {Number(o.currentBalance).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCheck } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Paginated } from "@/types/api"

interface Notification {
  id: string
  sisterProfile: string | null
  sisterProfilePoReference: string | null
  title: string
  message: string
  type: string
  isRead: boolean
  createdAt: string
}

export function NotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<"all" | "unread">("all")

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "list", filter],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Notification>>("/notifications/", {
        params: { page_size: 100, ...(filter === "unread" ? { isRead: false } : {}) },
      })
      return data.results
    },
  })

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => { await api.patch(`/notifications/${id}/read/`) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: async () => { await api.post("/notifications/mark-all-read/") },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  function handleClick(n: Notification) {
    if (!n.isRead) markReadMutation.mutate(n.id)
    if (n.sisterProfile) navigate(`/sister-profiles/${n.sisterProfile}`)
  }

  const unreadCount = notificationsQuery.data?.filter((n) => !n.isRead).length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500">Cost closures, approvals, invoices, payments, and balance alerts.</p>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => markAllReadMutation.mutate()}
          disabled={markAllReadMutation.isPending || unreadCount === 0}
        >
          <CheckCheck className="h-3.5 w-3.5" /> Mark All Read
        </Button>
      </div>

      <Select className="w-40" value={filter} onChange={(e) => setFilter(e.target.value as "all" | "unread")}>
        <option value="all">All</option>
        <option value="unread">Unread</option>
      </Select>

      <Card>
        <CardContent className="p-0">
          {notificationsQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : !notificationsQuery.data?.length ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {filter === "unread" ? "No unread notifications." : "No notifications yet."}
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {notificationsQuery.data.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50",
                    !n.isRead && "bg-sky-50/60",
                  )}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", !n.isRead ? "bg-sky-500" : "bg-transparent")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-sm", !n.isRead ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>{n.title}</p>
                      {n.sisterProfilePoReference && <Badge variant="default">{n.sisterProfilePoReference}</Badge>}
                    </div>
                    <p className="text-sm text-slate-500">{n.message}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

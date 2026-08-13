import { type ReactNode } from "react"
import { Bell, LogOut, Package } from "lucide-react"
import { NavLink, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ICON_MAP } from "./icon-map"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { isNavItemVisible, NAV_ITEMS } from "@/lib/nav-items"
import { cn } from "@/lib/utils"
import type { Paginated } from "@/types/api"

interface NotificationSummary {
  isRead: boolean
}

export function AppShell({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: unreadCount } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<NotificationSummary>>("/notifications/", {
        params: { isRead: false, page_size: 1 },
      })
      return data.count
    },
    refetchInterval: 60_000,
  })

  const visibleItems = user ? NAV_ITEMS.filter((item) => isNavItemVisible(item, user.role)) : []

  function handleLogout() {
    logout()
    queryClient.clear()
    navigate("/login", { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-900 text-slate-100">
        <div className="flex items-center gap-2 px-5 py-5">
          <Package className="h-6 w-6" />
          <span className="text-sm font-semibold">Textile Sourcing CRM</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {visibleItems.map((item) => {
            const Icon = ICON_MAP[item.icon]
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
                  )
                }
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="border-t border-white/10 px-4 py-4">
          <div className="mb-2 text-xs text-slate-400">Signed in as</div>
          <div className="mb-1 truncate text-sm font-medium">{user?.name || user?.username}</div>
          <div className="mb-3 inline-block rounded-full bg-white/10 px-2 py-0.5 text-xs capitalize text-slate-300">
            {user?.role.replace("_", " ")}
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b border-slate-200 bg-white px-6 py-3">
          <NavLink to="/notifications" className="relative text-slate-500 hover:text-slate-900">
            <Bell className="h-5 w-5" />
            {!!unreadCount && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                {unreadCount}
              </span>
            )}
          </NavLink>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

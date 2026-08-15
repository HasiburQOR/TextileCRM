import { type ReactNode } from "react"
import { LayoutDashboard, ListOrdered, LogOut, Package, Wallet } from "lucide-react"
import { NavLink, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/lib/auth-store"
import { cn } from "@/lib/utils"

const BUYER_NAV_ITEMS = [
  { to: "/portal", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/portal/orders", label: "My Orders", icon: ListOrdered, end: false },
  { to: "/portal/wallet", label: "Wallet", icon: Wallet, end: false },
]

export function BuyerShell({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  function handleLogout() {
    logout()
    queryClient.clear()
    navigate("/login", { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-900 text-slate-100">
        <div className="flex items-center gap-2 px-5 py-5">
          <Package className="h-6 w-6" />
          <span className="text-sm font-semibold">Buyer Portal</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {BUYER_NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="border-t border-white/10 px-4 py-4">
          <div className="mb-2 text-xs text-slate-400">Signed in as</div>
          <div className="mb-3 truncate text-sm font-medium">{user?.name || user?.username}</div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}

import type { Role } from "@/lib/auth-store"

export interface NavItem {
  to: string
  label: string
  icon: string
  roles?: Role[] // omitted = every supplier role can see it
}

// "admin" can always see everything; other roles are listed explicitly per item.
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "LayoutDashboard" },
  { to: "/buyers", label: "Buyers", icon: "Users", roles: ["management"] },
  { to: "/sister-profiles", label: "Sister Profiles", icon: "GitBranch", roles: ["management"] },
  { to: "/product-templates", label: "Product Templates", icon: "LayoutTemplate", roles: [] },
  // The unified Sourcing Pipeline: the four sequential steps per Sister
  // Profile (Intake → Sourcing Cost → Packing List → Warehouse Cost) in one
  // guided flow. Replaces the former "Sourcing Intake" and "Costs" entries;
  // those URLs redirect to /pipeline. warehouse: read-only on intake rows,
  // plus "Mark Ready for Final QC" on In Warehouse products.
  { to: "/pipeline", label: "Sourcing Pipeline", icon: "Workflow", roles: ["company_rep", "employee", "management", "warehouse"] },
  // Temporarily disabled — still under active work, hidden from nav until ready.
  // { to: "/final-qc", label: "Final QC & QR", icon: "QrCode", roles: ["qc", "management"] },
  // { to: "/qc-reports", label: "QC Costs", icon: "ClipboardCheck", roles: ["qc", "management"] },
  { to: "/expenses", label: "Expenses", icon: "Receipt", roles: ["qc", "warehouse", "company_rep", "employee", "management"] },
  { to: "/invoices", label: "Invoices", icon: "FileText", roles: ["employee", "management"] },
  { to: "/exchange-rates", label: "Exchange Rates", icon: "ArrowLeftRight", roles: [] },
  { to: "/documents", label: "Document Vault", icon: "Folder", roles: ["qc", "warehouse", "company_rep", "employee", "management"] },
  { to: "/audit-log", label: "Audit Log", icon: "History", roles: [] },
  { to: "/users", label: "Users", icon: "UserCog", roles: [] },
  // Admin-only to edit, but every role that issues invoices needs to be able
  // to see whether the identity/bank block is filled in before generating a
  // document — the page itself is read-only for them.
  { to: "/company-profile", label: "Company Profile", icon: "Building2", roles: ["employee", "management"] },
]

export function isNavItemVisible(item: NavItem, role: Role): boolean {
  if (role === "admin") return true
  return (item.roles ?? []).includes(role)
}

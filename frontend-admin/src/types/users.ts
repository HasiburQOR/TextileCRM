import type { Role } from "@/lib/auth-store"

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  company_rep: "Company Representative",
  qc: "QC Person",
  warehouse: "Warehouse Manager",
  employee: "Employee",
  management: "Management",
  buyer: "Buyer",
}

export const SUPPLIER_ROLES: Role[] = ["admin", "company_rep", "qc", "warehouse", "employee", "management"]

export interface AppUser {
  id: string
  username: string
  email: string
  name: string
  role: Role
  buyer_profile: string | null
  is_active: boolean
  createdAt: string
}

export interface UserCreateInput {
  username: string
  email: string
  name: string
  role: Role
  buyer_profile: string | null
  password: string
}

export interface UserUpdateInput {
  username?: string
  email?: string
  name?: string
  role?: Role
  buyer_profile?: string | null
  is_active?: boolean
  password?: string
}

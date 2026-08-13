import { create } from "zustand"
import { persist } from "zustand/middleware"

export type Role =
  | "admin"
  | "company_rep"
  | "qc"
  | "warehouse"
  | "employee"
  | "management"
  | "buyer"

export interface CurrentUser {
  id: string
  username: string
  email: string
  name: string
  role: Role
  buyer_profile: string | null
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: CurrentUser | null
  setTokens: (access: string, refresh: string) => void
  setUser: (user: CurrentUser) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),
      setUser: (user) => set({ user }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: "textile-crm-auth" },
  ),
)

import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"
import { Spinner } from "@/components/ui/spinner"
import { useAuthStore } from "@/lib/auth-store"
import { useCurrentUser } from "@/lib/use-current-user"

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const { isLoading, isError } = useCurrentUser()

  if (!accessToken) return <Navigate to="/login" replace />

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-slate-400" />
      </div>
    )
  }

  if (isError) return <Navigate to="/login" replace />

  return <>{children}</>
}

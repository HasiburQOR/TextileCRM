import { useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { Package } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"

interface TokenResponse {
  access: string
  refresh: string
  role: string
  buyer_profile_id: string | null
}

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const accessToken = useAuthStore((s) => s.accessToken)
  const setTokens = useAuthStore((s) => s.setTokens)

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (accessToken) return <Navigate to="/" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { data } = await api.post<TokenResponse>("/auth/token/", { username, password })
      // Every login is a clean slate: without this, a query cached under an
      // unchanged key (like "me") from a *previous* session on this same
      // browser tab can still be within its staleTime and never refetch,
      // silently leaving the new session's user/role data stuck at
      // whatever the last logout cleared it to. Found by switching accounts
      // in the same tab during manual verification, not by any type error.
      queryClient.clear()
      setTokens(data.access, data.refresh)
      navigate("/", { replace: true })
    } catch {
      setError("Invalid username or password.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white">
            <Package className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Textile Sourcing CRM</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to the Admin console</p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-sm font-medium text-slate-700">
              Username
            </label>
            <Input
              id="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" disabled={submitting} className="mt-2 w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  )
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import type { Role } from "@/lib/auth-store"
import { extractErrorMessage } from "@/lib/errors"
import type { Paginated } from "@/types/api"
import type { BuyerProfile } from "@/types/buyers"
import { ROLE_LABEL } from "@/types/users"
import type { AppUser } from "@/types/users"

export function UsersPage() {
  const queryClient = useQueryClient()
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AppUser | null>(null)

  const usersQuery = useQuery({
    queryKey: ["users", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<AppUser>>("/users/", { params: { page_size: 200 } }); return data.results },
  })

  const filtered = useMemo(() => {
    const rows = usersQuery.data ?? []
    return roleFilter === "all" ? rows : rows.filter((u) => u.role === roleFilter)
  }, [usersQuery.data, roleFilter])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">Internal user and role management.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New User</Button>
      </div>

      <Select className="w-56" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "all")}>
        <option value="all">All Roles</option>
        {Object.entries(ROLE_LABEL).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
      </Select>

      <Card>
        <CardContent className="p-0">
          {usersQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No users match this filter.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{u.name || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{u.username}</td>
                    <td className="px-4 py-3 text-slate-500">{ROLE_LABEL[u.role]}</td>
                    <td className="px-4 py-3"><Badge variant={u.is_active ? "success" : "danger"}>{u.is_active ? "Active" : "Inactive"}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditTarget(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <UserFormDialog
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["users"] }); setCreateOpen(false) }}
        />
      )}
      {editTarget && (
        <UserFormDialog
          existing={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["users"] }); setEditTarget(null) }}
        />
      )}
    </div>
  )
}

function UserFormDialog({ existing, onClose, onSuccess }: {
  existing?: AppUser; onClose: () => void; onSuccess: () => void
}) {
  const isEdit = !!existing
  const [username, setUsername] = useState(existing?.username ?? "")
  const [email, setEmail] = useState(existing?.email ?? "")
  const [name, setName] = useState(existing?.name ?? "")
  const [role, setRole] = useState<Role>(existing?.role ?? "employee")
  const [buyerProfile, setBuyerProfile] = useState(existing?.buyer_profile ?? "")
  const [isActive, setIsActive] = useState(existing?.is_active ?? true)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const buyersQuery = useQuery({
    queryKey: ["buyers", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<BuyerProfile>>("/buyers/", { params: { page_size: 200 } }); return data.results },
    enabled: role === "buyer",
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        username, email, name, role, buyer_profile: role === "buyer" ? buyerProfile || null : null,
      }
      if (isEdit) payload.is_active = isActive
      if (password) payload.password = password
      if (isEdit) {
        const { data } = await api.patch(`/users/${existing!.id}/`, payload)
        return data
      }
      const { data } = await api.post("/users/", payload)
      return data
    },
    onSuccess,
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (role === "buyer" && !buyerProfile) { setError("Select a Buyer Profile for the buyer role."); return }
    if (!isEdit && !password) { setError("A password is required when creating a user."); return }
    setError(null)
    mutation.mutate()
  }

  return (
    <Dialog open onClose={onClose} title={isEdit ? `Edit User — ${existing!.username}` : "New User"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Username *</label>
          <Input required value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Display Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Role *</label>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {Object.entries(ROLE_LABEL).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
          </Select>
        </div>
        {role === "buyer" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Buyer Profile *</label>
            <Select required value={buyerProfile} onChange={(e) => setBuyerProfile(e.target.value)}>
              <option value="">Select buyer...</option>
              {buyersQuery.data?.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </Select>
          </div>
        )}
        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {isEdit ? "Reset Password (leave blank to keep current)" : "Password *"}
          </label>
          <Input required={!isEdit} type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create User"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

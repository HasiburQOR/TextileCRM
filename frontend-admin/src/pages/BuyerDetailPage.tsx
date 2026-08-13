import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, KeyRound, Pencil, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { extractErrorMessage } from "@/lib/errors"
import type { Paginated } from "@/types/api"
import type { BuyerProfile, BuyerProfileCreateInput, SisterProfile } from "@/types/buyers"
import type { AppUser, UserCreateInput } from "@/types/users"

export function BuyerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const isAdmin = user?.role === "admin"
  const [editOpen, setEditOpen] = useState(false)
  const [createLoginOpen, setCreateLoginOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null)

  const buyerQuery = useQuery({
    queryKey: ["buyers", id],
    queryFn: async () => {
      const { data } = await api.get<BuyerProfile>(`/buyers/${id}/`)
      return data
    },
    enabled: !!id,
  })

  const sisterProfilesQuery = useQuery({
    queryKey: ["sister-profiles", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const portalUsersQuery = useQuery({
    queryKey: ["users", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<AppUser>>("/users/", { params: { page_size: 200 } })
      return data.results
    },
    enabled: isAdmin,
  })

  const linkedProfiles = useMemo(
    () => (sisterProfilesQuery.data ?? []).filter((sp) => sp.buyerProfile === id),
    [sisterProfilesQuery.data, id],
  )
  const portalUsers = useMemo(
    () => (portalUsersQuery.data ?? []).filter((u) => u.role === "buyer" && u.buyer_profile === id),
    [portalUsersQuery.data, id],
  )

  if (buyerQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="text-slate-400" />
      </div>
    )
  }

  if (!buyerQuery.data) {
    return <p className="py-16 text-center text-sm text-slate-400">Buyer not found.</p>
  }

  const buyer = buyerQuery.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/buyers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">{buyer.name}</h1>
          <p className="text-sm text-slate-500">{buyer.contactInfo || "No contact info on file."}</p>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Sister Profiles</CardTitle>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/sister-profiles?buyer=${id}`)}>
                <Plus className="h-3.5 w-3.5" /> New Sister Profile
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {sisterProfilesQuery.isLoading ? (
              <div className="flex justify-center py-8"><Spinner className="text-slate-400" /></div>
            ) : linkedProfiles.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No Sister Profiles yet for this buyer.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-medium">PO Reference</th>
                    <th className="px-4 py-2 font-medium">Agreement Type</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedProfiles.map((sp) => (
                    <tr
                      key={sp.id}
                      className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                      onClick={() => navigate(`/sister-profiles/${sp.id}`)}
                    >
                      <td className="px-4 py-2 font-medium text-slate-900">{sp.poReference || sp.id}</td>
                      <td className="px-4 py-2 text-slate-500">Type {sp.agreementType}</td>
                      <td className="px-4 py-2">
                        <Badge variant={sp.status === "active" ? "info" : sp.status === "completed" ? "success" : "default"}>
                          {sp.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Portal Access</CardTitle>
            {isAdmin && portalUsers.length === 0 && (
              <Button size="sm" variant="outline" onClick={() => setCreateLoginOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Create Login
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-4 pt-0">
            {!isAdmin ? (
              <p className="text-sm text-slate-400">Only Admin can manage portal access.</p>
            ) : portalUsersQuery.isLoading ? (
              <div className="flex justify-center py-4"><Spinner className="text-slate-400" /></div>
            ) : portalUsers.length === 0 ? (
              <p className="text-sm text-slate-400">No portal login issued yet.</p>
            ) : (
              portalUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{u.username}</p>
                    <p className="text-xs text-slate-400">{u.email || "—"}</p>
                    <Badge variant={u.is_active ? "success" : "danger"} className="mt-1">
                      {u.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setResetTarget(u)}>
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {editOpen && <EditBuyerDialog buyer={buyer} onClose={() => setEditOpen(false)} />}
      {createLoginOpen && id && (
        <CreatePortalLoginDialog buyerProfileId={id} onClose={() => setCreateLoginOpen(false)} />
      )}
      {resetTarget && <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />}
    </div>
  )

  function EditBuyerDialog({ buyer, onClose }: { buyer: BuyerProfile; onClose: () => void }) {
    const [form, setForm] = useState<BuyerProfileCreateInput>({
      name: buyer.name, contactInfo: buyer.contactInfo, branding: buyer.branding,
    })
    const [error, setError] = useState<string | null>(null)
    const mutation = useMutation({
      mutationFn: async () => {
        const { data } = await api.patch<BuyerProfile>(`/buyers/${buyer.id}/`, form)
        return data
      },
      onSuccess: (data) => {
        queryClient.setQueryData(["buyers", buyer.id], data)
        queryClient.invalidateQueries({ queryKey: ["buyers", "all"] })
        onClose()
      },
      onError: (err: unknown) => setError(extractErrorMessage(err)),
    })
    return (
      <Dialog open onClose={onClose} title="Edit Buyer Profile">
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="flex flex-col gap-4">
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Buyer Name *</label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Contact Info</label>
            <Textarea rows={3} value={form.contactInfo} onChange={(e) => setForm({ ...form, contactInfo: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Branding / Display Name</label>
            <Input value={form.branding} onChange={(e) => setForm({ ...form, branding: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Save Changes"}</Button>
          </div>
        </form>
      </Dialog>
    )
  }

  function CreatePortalLoginDialog({ buyerProfileId, onClose }: { buyerProfileId: string; onClose: () => void }) {
    const [form, setForm] = useState({ username: "", email: "", name: "", password: "" })
    const [error, setError] = useState<string | null>(null)
    const mutation = useMutation({
      mutationFn: async () => {
        const payload: UserCreateInput = { ...form, role: "buyer", buyer_profile: buyerProfileId }
        const { data } = await api.post("/users/", payload)
        return data
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["users", "all"] })
        onClose()
      },
      onError: (err: unknown) => setError(extractErrorMessage(err)),
    })
    return (
      <Dialog open onClose={onClose} title="Create Portal Login">
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="flex flex-col gap-4">
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Username *</label>
            <Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Display Name</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Password *</label>
            <Input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Creating..." : "Create Login"}</Button>
          </div>
        </form>
      </Dialog>
    )
  }

  function ResetPasswordDialog({ target, onClose }: { target: AppUser; onClose: () => void }) {
    const [password, setPassword] = useState("")
    const [error, setError] = useState<string | null>(null)
    const mutation = useMutation({
      mutationFn: async () => {
        const { data } = await api.patch(`/users/${target.id}/`, { password })
        return data
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["users", "all"] })
        onClose()
      },
      onError: (err: unknown) => setError(extractErrorMessage(err)),
    })
    return (
      <Dialog open onClose={onClose} title={`Reset Password — ${target.username}`}>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="flex flex-col gap-4">
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">New Password *</label>
            <Input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          <p className="text-xs text-slate-400">This immediately replaces the buyer's portal password. It will not be shown again.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Resetting..." : "Reset Password"}</Button>
          </div>
        </form>
      </Dialog>
    )
  }
}

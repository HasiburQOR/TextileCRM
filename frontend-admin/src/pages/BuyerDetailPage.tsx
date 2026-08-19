import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, ArrowLeft, KeyRound, Pencil, Plus, Wallet as WalletIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { extractErrorMessage } from "@/lib/errors"
import type { Paginated } from "@/types/api"
import type { BuyerProfile, BuyerProfileCreateInput, SisterProfile } from "@/types/buyers"
import type { AppUser, UserCreateInput } from "@/types/users"
import type { BuyerWallet, WalletAdjustInput, WalletTopUpInput, WalletTransaction, WalletTransactionType } from "@/types/wallet"

const WALLET_TXN_TYPE_LABEL: Record<WalletTransactionType, string> = {
  top_up: "Top-up", deduction: "Deduction", refund: "Refund", adjustment: "Adjustment",
}
const WALLET_TXN_TYPE_BADGE: Record<WalletTransactionType, "success" | "danger" | "info" | "default"> = {
  top_up: "success", deduction: "danger", refund: "info", adjustment: "default",
}

export function BuyerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const isAdmin = user?.role === "admin"
  const [editOpen, setEditOpen] = useState(false)
  const [createLoginOpen, setCreateLoginOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null)
  const [topUpOpen, setTopUpOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [txnTypeFilter, setTxnTypeFilter] = useState("")
  const [txnSisterFilter, setTxnSisterFilter] = useState("")
  const [txnDateFrom, setTxnDateFrom] = useState("")
  const [txnDateTo, setTxnDateTo] = useState("")

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

  const walletQuery = useQuery({
    queryKey: ["buyers", id, "wallet"],
    queryFn: async () => {
      const { data } = await api.get<BuyerWallet>(`/buyers/${id}/wallet/`)
      return data
    },
    enabled: !!id,
  })

  const walletTransactionsQuery = useQuery({
    queryKey: ["buyers", id, "wallet", "transactions", { txnTypeFilter, txnSisterFilter, txnDateFrom, txnDateTo }],
    queryFn: async () => {
      const { data } = await api.get<Paginated<WalletTransaction>>(`/buyers/${id}/wallet/transactions/`, {
        params: {
          page_size: 200,
          type: txnTypeFilter || undefined,
          sisterProfile: txnSisterFilter || undefined,
          date_from: txnDateFrom || undefined,
          date_to: txnDateTo || undefined,
        },
      })
      return data.results
    },
    enabled: !!id,
  })

  const walletTransactionsWithRunningBalance = useMemo(() => {
    if (!walletTransactionsQuery.data || !walletQuery.data) return []
    let cumulative = Number(walletQuery.data.balance)
    return walletTransactionsQuery.data.map((t) => {
      const runningBalance = cumulative
      cumulative -= Number(t.amount)
      return { ...t, runningBalance }
    })
  }, [walletTransactionsQuery.data, walletQuery.data])

  function invalidateWallet() {
    queryClient.invalidateQueries({ queryKey: ["buyers", id, "wallet"] })
  }

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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{buyer.name}</h1>
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{buyer.referenceCode}</code>
          </div>
          <p className="text-sm text-slate-500">{buyer.contactInfo || "No contact info on file."}</p>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><WalletIcon className="h-4 w-4" /> Wallet</CardTitle>
          {isAdmin && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>Adjust Balance</Button>
              <Button size="sm" onClick={() => setTopUpOpen(true)}><Plus className="h-3.5 w-3.5" /> Add Top-up</Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {walletQuery.isLoading ? (
            <div className="flex justify-center py-4"><Spinner className="text-slate-400" /></div>
          ) : walletQuery.data ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`text-3xl font-semibold ${Number(walletQuery.data.balance) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {Number(walletQuery.data.balance).toLocaleString()} {walletQuery.data.currency}
                </span>
                {walletQuery.data.negativeBalance && <Badge variant="danger">Negative Balance</Badge>}
                {walletQuery.data.lowBalance && <Badge variant="warning">Low Balance</Badge>}
              </div>
              {walletQuery.data.negativeBalance && (
                <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  This buyer's wallet balance is negative — spend has outrun what they've topped up.
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
                  <Select value={txnTypeFilter} onChange={(e) => setTxnTypeFilter(e.target.value)} className="w-40">
                    <option value="">All types</option>
                    <option value="top_up">Top-up</option>
                    <option value="deduction">Deduction</option>
                    <option value="refund">Refund</option>
                    <option value="adjustment">Adjustment</option>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Sister Profile</label>
                  <Select value={txnSisterFilter} onChange={(e) => setTxnSisterFilter(e.target.value)} className="w-48">
                    <option value="">All orders</option>
                    {linkedProfiles.map((sp) => (
                      <option key={sp.id} value={sp.id}>{sp.poReference || sp.id}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">From</label>
                  <Input type="date" value={txnDateFrom} onChange={(e) => setTxnDateFrom(e.target.value)} className="w-36" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">To</label>
                  <Input type="date" value={txnDateTo} onChange={(e) => setTxnDateTo(e.target.value)} className="w-36" />
                </div>
              </div>

              {walletTransactionsQuery.isLoading ? (
                <div className="flex justify-center py-6"><Spinner className="text-slate-400" /></div>
              ) : walletTransactionsWithRunningBalance.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No wallet transactions yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-4 py-2 font-medium">Date</th>
                        <th className="px-4 py-2 font-medium">Type</th>
                        <th className="px-4 py-2 font-medium">Source</th>
                        <th className="px-4 py-2 font-medium">Sister Profile</th>
                        <th className="px-4 py-2 font-medium">Cost incurred</th>
                        <th className="px-4 py-2 font-medium">Amount</th>
                        <th className="px-4 py-2 font-medium">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walletTransactionsWithRunningBalance.map((t) => (
                        <tr key={t.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-2 text-slate-500">{new Date(t.createdAt).toLocaleString()}</td>
                          <td className="px-4 py-2">
                            <Badge variant={WALLET_TXN_TYPE_BADGE[t.type]}>{WALLET_TXN_TYPE_LABEL[t.type]}</Badge>
                          </td>
                          <td className="px-4 py-2 text-slate-700">{t.description}{t.reason ? ` — ${t.reason}` : ""}</td>
                          <td className="px-4 py-2 text-slate-500">{t.sisterProfilePoReference || "—"}</td>
                          {/* What was actually spent on the supplier side, and
                              the locked rate it was charged to the buyer at. */}
                          <td className="px-4 py-2 text-slate-500">
                            {t.sourceAmount == null ? (
                              "—"
                            ) : (
                              <>
                                {Number(t.sourceAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                                {t.sourceCurrency}
                                {t.rateLabel && <span className="block text-xs text-slate-400">{t.rateLabel}</span>}
                              </>
                            )}
                          </td>
                          <td className={`px-4 py-2 font-medium ${Number(t.amount) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                            {Number(t.amount) > 0 ? "+" : ""}
                            {Number(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {t.currency}
                          </td>
                          <td className="px-4 py-2 text-slate-900">
                            {t.runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {t.currency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">Unable to load wallet.</p>
          )}
        </CardContent>
      </Card>

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
      {topUpOpen && id && (
        <WalletTopUpDialog buyerId={id} onClose={() => setTopUpOpen(false)} onSuccess={() => { invalidateWallet(); setTopUpOpen(false) }} />
      )}
      {adjustOpen && id && (
        <WalletAdjustDialog
          buyerId={id} sisterProfiles={linkedProfiles}
          onClose={() => setAdjustOpen(false)} onSuccess={() => { invalidateWallet(); setAdjustOpen(false) }}
        />
      )}
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

function WalletTopUpDialog({ buyerId, onClose, onSuccess }: { buyerId: string; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<WalletTopUpInput>({ amount: 0, currency: "USD", methodReference: "" })
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<WalletTransaction>(`/buyers/${buyerId}/wallet/top-up/`, form)
      return data
    },
    onSuccess,
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })
  return (
    <Dialog open onClose={onClose} title="Add Top-up">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Amount *</label>
            <Input required type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Currency</label>
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Method / Reference *</label>
          <Input required value={form.methodReference} onChange={(e) => setForm({ ...form, methodReference: e.target.value })} placeholder="Bank transfer ID, cheque no..." />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Adding..." : "Add Top-up"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

function WalletAdjustDialog({ buyerId, sisterProfiles, onClose, onSuccess }: {
  buyerId: string; sisterProfiles: SisterProfile[]; onClose: () => void; onSuccess: () => void
}) {
  const [form, setForm] = useState<WalletAdjustInput>({ amount: 0, reason: "", sisterProfile: "" })
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, sisterProfile: form.sisterProfile || undefined }
      const { data } = await api.post<WalletTransaction>(`/buyers/${buyerId}/wallet/adjust/`, payload)
      return data
    },
    onSuccess,
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })
  return (
    <Dialog open onClose={onClose} title="Adjust Balance">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <p className="text-xs text-slate-400">For corrections that don't map to a specific expense — e.g. a bank fee. Use a negative amount to deduct.</p>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Amount * (use a minus sign to deduct)</label>
          <Input required type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Sister Profile (optional, for reporting only)</label>
          <Select value={form.sisterProfile} onChange={(e) => setForm({ ...form, sisterProfile: e.target.value })}>
            <option value="">Not tied to a specific order</option>
            {sisterProfiles.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.poReference || sp.id}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Reason *</label>
          <Textarea required rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Adjust Balance"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

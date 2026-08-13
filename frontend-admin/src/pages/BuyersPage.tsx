import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { extractErrorMessage } from "@/lib/errors"
import type { Paginated } from "@/types/api"
import type { BuyerProfile, BuyerProfileCreateInput } from "@/types/buyers"

export function BuyersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buyersQuery = useQuery({
    queryKey: ["buyers", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BuyerProfile>>("/buyers/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const filtered = useMemo(() => {
    const rows = buyersQuery.data ?? []
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter((b) => b.name.toLowerCase().includes(q) || b.contactInfo.toLowerCase().includes(q))
  }, [buyersQuery.data, search])

  const createMutation = useMutation({
    mutationFn: async (input: BuyerProfileCreateInput) => {
      const { data } = await api.post<BuyerProfile>("/buyers/", input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buyers"] })
      setCreateOpen(false)
      setError(null)
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Buyers</h1>
          <p className="text-sm text-slate-500">Manage buyer profiles and portal credentials.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New Buyer
        </Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder="Search buyers..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Card>
        <CardContent className="p-0">
          {buyersQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {search.trim() ? "No buyers match your search." : "No buyers yet. Create one to get started."}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Sister Profiles</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((buyer) => (
                  <tr key={buyer.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/buyers/${buyer.id}`)}>
                    <td className="px-4 py-3 font-medium text-slate-900">{buyer.name}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-500">{buyer.contactInfo || "—"}</td>
                    <td className="px-4 py-3"><Badge variant="info">{buyer.sisterProfileCount}</Badge></td>
                    <td className="px-4 py-3 text-slate-400">{new Date(buyer.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <CreateBuyerDialog
        open={createOpen} onClose={() => { setCreateOpen(false); setError(null) }}
        onSubmit={createMutation.mutate} loading={createMutation.isPending} error={error}
      />
    </div>
  )
}

function CreateBuyerDialog({ open, onClose, onSubmit, loading, error }: {
  open: boolean; onClose: () => void
  onSubmit: (input: BuyerProfileCreateInput) => void
  loading: boolean; error: string | null
}) {
  const [name, setName] = useState("")
  const [contactInfo, setContactInfo] = useState("")
  const [branding, setBranding] = useState("")
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({ name, contactInfo, branding })
  }
  return (
    <Dialog open={open} onClose={onClose} title="New Buyer Profile">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Buyer Name *</label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ABC Textiles" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Contact Info</label>
          <Textarea rows={3} value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} placeholder="Email, phone, address..." />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Branding / Display Name</label>
          <Input value={branding} onChange={(e) => setBranding(e.target.value)} placeholder="Logo label" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading || !name.trim()}>{loading ? "Creating..." : "Create Buyer"}</Button>
        </div>
      </form>
    </Dialog>
  )
}


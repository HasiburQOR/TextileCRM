import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Eye, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { extractErrorMessage } from "@/lib/errors"
import { TRIP_STATUS_BADGE_VARIANT, TRIP_STATUS_LABEL } from "@/lib/status"
import { useAuthStore } from "@/lib/auth-store"
import type { Paginated } from "@/types/api"
import type { Product, SourcingLocationEntryInput, SourcingTrip, SourcingTripCreateInput } from "@/types/sourcing"

const CAN_CREATE_ROLES = ["admin", "company_rep"]
const CAN_MANAGE_ROLES = ["admin"]

function emptyLocation(): SourcingLocationEntryInput {
  return { locationName: "", quantity: 0, advanceAmount: 0, date: new Date().toISOString().slice(0, 16) }
}

export function SourcingTripsPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SourcingTrip | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const tripsQuery = useQuery({
    queryKey: ["sourcing-trips", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SourcingTrip>>("/sourcing-trips/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/sourcing-trips/${id}/`) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sourcing-trips"] })
      setDeleteTarget(null)
      setDeleteError(null)
    },
    onError: (err: unknown) => setDeleteError(extractErrorMessage(err)),
  })

  const canCreate = !!user && CAN_CREATE_ROLES.includes(user.role)
  const canManage = !!user && CAN_MANAGE_ROLES.includes(user.role)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sourcing Trips</h1>
          <p className="text-sm text-slate-500">Locations visited while sourcing a product, and the advances paid at each.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Trip
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {tripsQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner className="text-slate-400" />
            </div>
          ) : (tripsQuery.data?.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No sourcing trips yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">Locations</th>
                    <th className="px-4 py-2.5 font-medium">Reported</th>
                    <th className="px-4 py-2.5 font-medium">Total Advance</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Created</th>
                    <th className="px-4 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {tripsQuery.data!.map((t) => {
                    const reported = t.locations.filter((l) => l.status === "reported").length
                    const totalAdvance = t.locations.reduce((sum, l) => sum + Number(l.advanceAmount), 0)
                    const hasReported = reported > 0
                    return (
                      <tr
                        key={t.id}
                        className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                        onClick={() => navigate(`/sourcing-trips/${t.id}`)}
                      >
                        <td className="px-4 py-2.5 font-medium text-slate-900">{t.productName}</td>
                        <td className="px-4 py-2.5 text-slate-500">{t.locations.length}</td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {reported} / {t.locations.length}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{totalAdvance.toLocaleString()}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={TRIP_STATUS_BADGE_VARIANT[t.status]}>{TRIP_STATUS_LABEL[t.status]}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" title="View" onClick={(e) => { e.stopPropagation(); navigate(`/sourcing-trips/${t.id}`) }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {canManage && (
                              <Button
                                size="sm" variant="ghost" title={hasReported ? "Cannot delete — locations already reported" : "Delete"}
                                className="text-red-500 hover:text-red-700 disabled:text-slate-300"
                                disabled={hasReported}
                                onClick={(e) => { e.stopPropagation(); setDeleteError(null); setDeleteTarget(t) }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {createOpen && <CreateTripDialog onClose={() => setCreateOpen(false)} />}

      {deleteTarget && (
        <Dialog open onClose={() => setDeleteTarget(null)} title={`Delete trip for "${deleteTarget.productName}"?`}>
          <div className="flex flex-col gap-4">
            {deleteError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</div>}
            <p className="text-sm text-slate-600">This permanently removes the trip and its locations. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteTarget.id)}>
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function CreateTripDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const productsQuery = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>("/products/", { params: { page_size: 200 } })
      return data.results
    },
    select: (results) => results.filter((p) => p.status === "sourcing_trip_open"),
  })

  const [product, setProduct] = useState("")
  const [locations, setLocations] = useState<SourcingLocationEntryInput[]>([emptyLocation()])
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: async (payload: SourcingTripCreateInput) => {
      const { data } = await api.post<SourcingTrip>("/sourcing-trips/", payload)
      return data
    },
    onSuccess: (trip) => {
      queryClient.invalidateQueries({ queryKey: ["sourcing-trips"] })
      onClose()
      navigate(`/sourcing-trips/${trip.id}`)
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function updateLocation(index: number, patch: Partial<SourcingLocationEntryInput>) {
    setLocations((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function removeLocation(index: number) {
    setLocations((rows) => rows.filter((_, i) => i !== index))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!product) {
      setError("Product is required.")
      return
    }
    const cleanLocations = locations
      .filter((l) => l.locationName.trim())
      .map((l) => ({ ...l, date: new Date(l.date).toISOString() }))
    createMutation.mutate({ product, locations: cleanLocations })
  }

  return (
    <Dialog open onClose={onClose} title="New Sourcing Trip" className="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">Product *</label>
          <Select value={product} onChange={(e) => setProduct(e.target.value)} required>
            <option value="">Select…</option>
            {productsQuery.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.styleNumber})
              </option>
            ))}
          </Select>
          {productsQuery.data?.length === 0 && (
            <p className="text-xs text-slate-400">No products in "Sourcing Trip Open" status are available.</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-600">Locations</label>
            <Button type="button" variant="outline" size="sm" onClick={() => setLocations((rows) => [...rows, emptyLocation()])}>
              <Plus className="h-3.5 w-3.5" />
              Add Row
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="px-2 py-1.5 font-medium">Location Name</th>
                  <th className="px-2 py-1.5 font-medium">Quantity</th>
                  <th className="px-2 py-1.5 font-medium">Advance Amount</th>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {locations.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="p-1">
                      <Input
                        className="h-7 text-xs"
                        value={row.locationName}
                        onChange={(e) => updateLocation(i, { locationName: e.target.value })}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        className="h-7 w-20 text-xs"
                        type="number"
                        min={0}
                        value={row.quantity}
                        onChange={(e) => updateLocation(i, { quantity: Number(e.target.value) })}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        className="h-7 w-24 text-xs"
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.advanceAmount}
                        onChange={(e) => updateLocation(i, { advanceAmount: Number(e.target.value) })}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        className="h-7 text-xs"
                        type="datetime-local"
                        value={row.date}
                        onChange={(e) => updateLocation(i, { date: e.target.value })}
                      />
                    </td>
                    <td className="p-1 text-center">
                      {locations.length > 1 && (
                        <button type="button" onClick={() => removeLocation(i)} className="text-slate-400 hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create Trip"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

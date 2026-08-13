import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { extractErrorMessage } from "@/lib/errors"
import { LOCATION_STATUS_BADGE_VARIANT, LOCATION_STATUS_LABEL, TRIP_STATUS_BADGE_VARIANT, TRIP_STATUS_LABEL } from "@/lib/status"
import type { SourcingLocationEntry, SourcingLocationEntryInput, SourcingTrip } from "@/types/sourcing"

const CAN_MANAGE_ROLES = ["admin", "company_rep"]

export function SourcingTripDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<SourcingLocationEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SourcingLocationEntry | null>(null)

  const tripQuery = useQuery({
    queryKey: ["sourcing-trips", id],
    queryFn: async () => {
      const { data } = await api.get<SourcingTrip>(`/sourcing-trips/${id}/`)
      return data
    },
    enabled: !!id,
  })

  const reportMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const { data } = await api.post(`/sourcing-trips/${id}/locations/${locationId}/report/`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sourcing-trips", id] })
      setActionError(null)
    },
    onError: (err: unknown) => setActionError(extractErrorMessage(err)),
  })

  const deleteLocationMutation = useMutation({
    mutationFn: async (locationId: string) => { await api.delete(`/sourcing-trips/${id}/locations/${locationId}/`) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sourcing-trips", id] })
      setDeleteTarget(null)
      setActionError(null)
    },
    onError: (err: unknown) => setActionError(extractErrorMessage(err)),
  })

  const closeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<SourcingTrip>(`/sourcing-trips/${id}/close/`)
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["sourcing-trips", id], data)
      queryClient.invalidateQueries({ queryKey: ["sourcing-trips"] })
      setActionError(null)
    },
    onError: (err: unknown) => setActionError(extractErrorMessage(err)),
  })

  if (tripQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="text-slate-400" />
      </div>
    )
  }

  if (!tripQuery.data) {
    return <p className="py-16 text-center text-sm text-slate-400">Sourcing trip not found.</p>
  }

  const trip = tripQuery.data
  const canManage = !!user && CAN_MANAGE_ROLES.includes(user.role)
  const isOpen = trip.status === "open"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/sourcing-trips")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{trip.productName}</h1>
            <Badge variant={TRIP_STATUS_BADGE_VARIANT[trip.status]}>{TRIP_STATUS_LABEL[trip.status]}</Badge>
          </div>
          {trip.fullPaymentConfirmedAt && (
            <p className="text-sm text-slate-500">Full payment confirmed {new Date(trip.fullPaymentConfirmedAt).toLocaleString()}</p>
          )}
        </div>
        {canManage && isOpen && (
          <>
            <Button variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Location
            </Button>
            <Button onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
              {closeMutation.isPending ? "Closing…" : "Close Trip"}
            </Button>
          </>
        )}
      </div>

      {actionError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Locations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium">Location</th>
                  <th className="px-4 py-2 font-medium">Quantity</th>
                  <th className="px-4 py-2 font-medium">Advance</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {trip.locations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">
                      No locations recorded.
                    </td>
                  </tr>
                ) : (
                  trip.locations.map((loc) => (
                    <tr key={loc.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2 font-medium text-slate-900">{loc.locationName}</td>
                      <td className="px-4 py-2 text-slate-500">{loc.quantity}</td>
                      <td className="px-4 py-2 text-slate-500">{Number(loc.advanceAmount).toLocaleString()}</td>
                      <td className="px-4 py-2 text-slate-500">{new Date(loc.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2">
                        <Badge variant={LOCATION_STATUS_BADGE_VARIANT[loc.status]}>{LOCATION_STATUS_LABEL[loc.status]}</Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {canManage && loc.status === "pending" && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => reportMutation.mutate(loc.id)} disabled={reportMutation.isPending}>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Report
                            </Button>
                            <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditTarget(loc)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Delete" className="text-red-500 hover:text-red-700" onClick={() => setDeleteTarget(loc)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {addOpen && <AddLocationDialog tripId={trip.id} onClose={() => setAddOpen(false)} />}

      {editTarget && <EditLocationDialog tripId={trip.id} location={editTarget} onClose={() => setEditTarget(null)} />}

      {deleteTarget && (
        <Dialog open onClose={() => setDeleteTarget(null)} title={`Delete "${deleteTarget.locationName}"?`}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">This permanently removes this location entry. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" disabled={deleteLocationMutation.isPending} onClick={() => deleteLocationMutation.mutate(deleteTarget.id)}>
                {deleteLocationMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function EditLocationDialog({ tripId, location, onClose }: { tripId: string; location: SourcingLocationEntry; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<SourcingLocationEntryInput>({
    locationName: location.locationName,
    quantity: location.quantity,
    advanceAmount: Number(location.advanceAmount),
    date: location.date.slice(0, 16),
  })
  const [error, setError] = useState<string | null>(null)

  const editMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch(`/sourcing-trips/${tripId}/locations/${location.id}/`, {
        ...form,
        date: new Date(form.date).toISOString(),
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sourcing-trips", tripId] })
      onClose()
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  return (
    <Dialog open onClose={onClose} title="Edit Location">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          if (!form.locationName.trim()) {
            setError("Location name is required.")
            return
          }
          editMutation.mutate()
        }}
        className="flex flex-col gap-4"
      >
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">Location Name *</label>
          <Input value={form.locationName} onChange={(e) => setForm({ ...form, locationName: e.target.value })} required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">Quantity</label>
            <Input
              type="number"
              min={0}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">Advance Amount</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.advanceAmount}
              onChange={(e) => setForm({ ...form, advanceAmount: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">Date</label>
          <Input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={editMutation.isPending}>
            {editMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function AddLocationDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<SourcingLocationEntryInput>({
    locationName: "",
    quantity: 0,
    advanceAmount: 0,
    date: new Date().toISOString().slice(0, 16),
  })
  const [error, setError] = useState<string | null>(null)

  const addMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/sourcing-trips/${tripId}/locations/`, {
        ...form,
        date: new Date(form.date).toISOString(),
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sourcing-trips", tripId] })
      onClose()
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  return (
    <Dialog open onClose={onClose} title="Add Location">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          if (!form.locationName.trim()) {
            setError("Location name is required.")
            return
          }
          addMutation.mutate()
        }}
        className="flex flex-col gap-4"
      >
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">Location Name *</label>
          <Input value={form.locationName} onChange={(e) => setForm({ ...form, locationName: e.target.value })} required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">Quantity</label>
            <Input
              type="number"
              min={0}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">Advance Amount</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.advanceAmount}
              onChange={(e) => setForm({ ...form, advanceAmount: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">Date</label>
          <Input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={addMutation.isPending}>
            {addMutation.isPending ? "Adding…" : "Add Location"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, LayoutTemplate, Plus, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { extractErrorMessage } from "@/lib/errors"
import type { Paginated } from "@/types/api"
import type {
  FieldGroup, FieldType, ProductTemplate, ProductTemplateCreateInput,
  TemplateField, TemplateFieldCreateInput,
} from "@/types/templates"

// Mirrors backend apps.sourcing.models.CORE_FIELD_DESCRIPTORS — shown
// immediately for a brand-new (unsaved) template, before the server has a
// row to return its own `coreFields` from. Same fixed list either way.
const CORE_FIELDS = [
  { fieldKey: "color", label: "Color" },
  { fieldKey: "pattern_no", label: "Pattern No" },
  { fieldKey: "po_no", label: "PO No" },
  { fieldKey: "order_qty", label: "Order Qty" },
  { fieldKey: "size_breakdown", label: "Size Breakdown" },
  { fieldKey: "inner_bundle", label: "Inner Bundle" },
  { fieldKey: "carton_no_range", label: "Carton No Range" },
  { fieldKey: "weights", label: "Weights (Gross / Net)" },
  { fieldKey: "carton_dimensions", label: "Carton Dimensions" },
  { fieldKey: "cbm", label: "CBM" },
]

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "decimal", label: "Decimal" },
  { value: "boolean", label: "Boolean" },
  { value: "select", label: "Select" },
]

export function ProductTemplatesPage() {
  const queryClient = useQueryClient()
  const [builderTarget, setBuilderTarget] = useState<ProductTemplate | "new" | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProductTemplate | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const templatesQuery = useQuery({
    queryKey: ["product-templates"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ProductTemplate>>("/product-templates/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/product-templates/${id}/`) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-templates"] })
      setDeleteTarget(null)
      setDeleteError(null)
    },
    onError: (err: unknown) => setDeleteError(extractErrorMessage(err)),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><LayoutTemplate className="h-5 w-5" /> Product Templates</h1>
          <p className="text-sm text-slate-500">Reusable field sets per product category — Shirt, Pants, Footwear, and so on.</p>
        </div>
        <Button onClick={() => setBuilderTarget("new")}><Plus className="h-4 w-4" /> Add Template</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {templatesQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : !templatesQuery.data?.length ? (
            <p className="py-10 text-center text-sm text-slate-400">No templates yet. Add one to get started.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Optional Fields</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {templatesQuery.data.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setBuilderTarget(t)}>
                    <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-500">{t.description || "—"}</td>
                    <td className="px-4 py-3"><Badge variant="info">{t.fields.length}</Badge></td>
                    <td className="px-4 py-3"><Badge variant={t.isActive ? "success" : "default"}>{t.isActive ? "Active" : "Inactive"}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                        onClick={(e) => { e.stopPropagation(); setDeleteError(null); setDeleteTarget(t) }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {builderTarget && (
        <TemplateBuilderDialog
          template={builderTarget === "new" ? null : builderTarget}
          onClose={() => setBuilderTarget(null)}
        />
      )}

      {deleteTarget && (
        <Dialog open onClose={() => setDeleteTarget(null)} title={`Delete "${deleteTarget.name}"?`}>
          <div className="flex flex-col gap-4">
            {deleteError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</div>}
            <p className="text-sm text-slate-600">
              Existing products created with this template keep their own resolved field set — this only removes the
              template itself. This cannot be undone.
            </p>
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

function TemplateBuilderDialog({ template, onClose }: { template: ProductTemplate | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const isEdit = !!template
  const [name, setName] = useState(template?.name ?? "")
  const [description, setDescription] = useState(template?.description ?? "")
  const [isActive, setIsActive] = useState(template?.isActive ?? true)
  const [selectedIds, setSelectedIds] = useState<string[]>(template?.fields.map((f) => f.id) ?? [])
  const [error, setError] = useState<string | null>(null)
  const [newFieldOpen, setNewFieldOpen] = useState(false)

  const libraryQuery = useQuery({
    queryKey: ["field-library"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<TemplateField>>("/field-library/", { params: { page_size: 500 } })
      return data.results
    },
  })

  const fieldsById = useMemo(() => new Map((libraryQuery.data ?? []).map((f) => [f.id, f])), [libraryQuery.data])

  const groupedAvailable = useMemo(() => {
    const groups = new Map<string, TemplateField[]>()
    for (const f of libraryQuery.data ?? []) {
      const key = f.fieldGroupName || "Ungrouped"
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(f)
    }
    return Array.from(groups.entries())
  }, [libraryQuery.data])

  function toggleField(field: TemplateField, checked: boolean) {
    if (checked) {
      // Auto-select the rest of the group client-side too (the server
      // re-enforces this at save time regardless — see save_template_fields).
      const siblingIds = field.fieldGroup
        ? (libraryQuery.data ?? []).filter((f) => f.fieldGroup === field.fieldGroup).map((f) => f.id)
        : [field.id]
      setSelectedIds((prev) => Array.from(new Set([...prev, ...siblingIds])))
    } else {
      setSelectedIds((prev) => prev.filter((id) => id !== field.id))
    }
  }

  function moveSelected(index: number, direction: -1 | 1) {
    setSelectedIds((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: ProductTemplateCreateInput = { name, description, isActive, fieldIds: selectedIds }
      if (isEdit) {
        const { data } = await api.patch<ProductTemplate>(`/product-templates/${template!.id}/`, payload)
        return data
      }
      const { data } = await api.post<ProductTemplate>("/product-templates/", payload)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["product-templates"] })
      // The server may have expanded the selection (auto-group-select) —
      // reflect that back so Save again doesn't look like it dropped anything.
      setSelectedIds(data.fields.map((f) => f.id))
      onClose()
    },
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError("Name is required."); return }
    saveMutation.mutate()
  }

  return (
    <Dialog open onClose={onClose} title={isEdit ? `Edit Template — ${template!.name}` : "New Product Template"} className="max-w-[95vw] xl:max-w-4xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Name *</label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shirt" />
          </div>
          <div className="flex items-end gap-2 pb-1.5">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">
            Core Fields <span className="font-normal text-slate-400">(always included, cannot be removed)</span>
          </label>
          <div className="flex flex-wrap gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
            {(template?.coreFields ?? CORE_FIELDS).map((f) => (
              <Badge key={f.fieldKey} variant="default">{f.label}</Badge>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600">Optional Field Library</label>
              <Button type="button" size="sm" variant="outline" onClick={() => setNewFieldOpen(true)}>
                <Plus className="h-3 w-3" /> New Field
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200 p-2">
              {libraryQuery.isLoading ? (
                <div className="flex justify-center py-4"><Spinner className="text-slate-400" /></div>
              ) : groupedAvailable.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">No fields in the library yet.</p>
              ) : (
                groupedAvailable.map(([groupName, fields]) => (
                  <div key={groupName} className="mb-2 last:mb-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{groupName}</p>
                    {fields.map((f) => (
                      <label key={f.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox" checked={selectedIds.includes(f.id)}
                          onChange={(e) => toggleField(f, e.target.checked)}
                        />
                        <span className="text-slate-700">{f.label}</span>
                        <span className="text-[10px] text-slate-400">({f.fieldType})</span>
                      </label>
                    ))}
                    {fields.some((f) => selectedIds.includes(f.id)) && fields.length > 1 && (
                      <p className="ml-1.5 text-[10px] italic text-slate-400">these fields are linked and are selected together</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              Selected Fields <span className="font-normal text-slate-400">(render order on the intake form)</span>
            </label>
            <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200 p-2">
              {selectedIds.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">No optional fields selected.</p>
              ) : (
                selectedIds.map((id, i) => {
                  const field = fieldsById.get(id)
                  if (!field) return null
                  return (
                    <div key={id} className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                      <span className="text-slate-700">{field.label}</span>
                      <div className="flex items-center gap-0.5">
                        <button type="button" disabled={i === 0} onClick={() => moveSelected(i, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button type="button" disabled={i === selectedIds.length - 1} onClick={() => moveSelected(i, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button type="button" onClick={() => toggleField(field, false)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save Template"}</Button>
        </div>
      </form>

      {newFieldOpen && (
        <NewLibraryFieldDialog
          onClose={() => setNewFieldOpen(false)}
          onCreated={(field) => {
            queryClient.invalidateQueries({ queryKey: ["field-library"] })
            setSelectedIds((prev) => [...prev, field.id])
            setNewFieldOpen(false)
          }}
        />
      )}
    </Dialog>
  )
}

function NewLibraryFieldDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (field: TemplateField) => void }) {
  const [fieldKey, setFieldKey] = useState("")
  const [label, setLabel] = useState("")
  const [fieldType, setFieldType] = useState<FieldType>("text")
  const [isRequired, setIsRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const groupsQuery = useQuery({
    queryKey: ["field-groups"],
    queryFn: async () => { const { data } = await api.get<Paginated<FieldGroup>>("/field-groups/", { params: { page_size: 200 } }); return data.results },
  })
  const [fieldGroup, setFieldGroup] = useState("")

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: TemplateFieldCreateInput = {
        fieldKey: fieldKey.trim(), label: label.trim(), fieldType, isRequired,
        selectOptions: [], fieldGroup: fieldGroup || null,
      }
      const { data } = await api.post<TemplateField>("/field-library/", payload)
      return data
    },
    onSuccess: onCreated,
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!fieldKey.trim() || !label.trim()) { setError("Field key and label are required."); return }
    createMutation.mutate()
  }

  return (
    <Dialog open onClose={onClose} title="New Field Library Entry">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Label *</label>
          <Input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Sleeve Length" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Field Key *</label>
          <Input required value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} placeholder="e.g. sleeve_length" />
          <p className="mt-0.5 text-[10px] text-slate-400">Machine name — must be unique across the whole Field Library.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
            <Select value={fieldType} onChange={(e) => setFieldType(e.target.value as FieldType)}>
              {FIELD_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Group (optional)</label>
            <Select value={fieldGroup} onChange={(e) => setFieldGroup(e.target.value)}>
              <option value="">No group</option>
              {groupsQuery.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
          Required
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Adding..." : "Add Field"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FileText, Plus, Trash2, Upload } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { extractErrorMessage } from "@/lib/errors"
import type { Paginated } from "@/types/api"
import type { SisterProfile } from "@/types/sourcing"

type DocumentType = "po" | "contract" | "invoice" | "packing_list" | "qc_photo" | "other"

const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  po: "Purchase Order", contract: "Contract", invoice: "Invoice",
  packing_list: "Packing List", qc_photo: "QC Photo", other: "Other",
}

interface DocumentVaultItem {
  id: string; sisterProfile: string; documentType: DocumentType
  file: string; fileName: string; fileSize: number; createdAt: string
}

export function DocumentVaultPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [sisterProfileFilter, setSisterProfileFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState<DocumentType | "">("")
  const [uploadOpen, setUploadOpen] = useState(false)

  const profilesQuery = useQuery({
    queryKey: ["sister-profiles", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 200 } }); return data.results },
  })

  const documentsQuery = useQuery({
    queryKey: ["documents", "all", sisterProfileFilter],
    queryFn: async () => {
      const { data } = await api.get<Paginated<DocumentVaultItem>>("/documents/", {
        params: { page_size: 200, ...(sisterProfileFilter ? { sisterProfile: sisterProfileFilter } : {}) },
      })
      return data.results
    },
  })

  const filtered = useMemo(() => {
    const rows = documentsQuery.data ?? []
    return typeFilter ? rows.filter((d) => d.documentType === typeFilter) : rows
  }, [documentsQuery.data, typeFilter])

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/documents/${id}/`) },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  })

  const isAdmin = user?.role === "admin"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Document Vault</h1>
          <p className="text-sm text-slate-500">POs, contracts, invoices, packing lists, and QC photos per Sister Profile.</p>
        </div>
        <Button onClick={() => setUploadOpen(true)}><Plus className="h-4 w-4" /> Upload Document</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select className="w-56" value={sisterProfileFilter} onChange={(e) => setSisterProfileFilter(e.target.value)}>
          <option value="">All Sister Profiles</option>
          {profilesQuery.data?.map((sp) => (<option key={sp.id} value={sp.id}>{sp.poReference || sp.id}</option>))}
        </Select>
        <Select className="w-48" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as DocumentType | "")}>
          <option value="">All Types</option>
          {Object.entries(DOCUMENT_TYPE_LABEL).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
        </Select>
      </div>

      {documentsQuery.isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">No documents match the current filters.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex items-start gap-3">
                <FileText className="mt-0.5 h-8 w-8 shrink-0 text-slate-300" />
                <div className="min-w-0 flex-1">
                  <a href={d.file} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-900 hover:underline">
                    {d.fileName}
                  </a>
                  <p className="text-xs text-slate-400">{DOCUMENT_TYPE_LABEL[d.documentType]} · {(d.fileSize / 1024).toFixed(0)} KB</p>
                  <p className="text-xs text-slate-400">{new Date(d.createdAt).toLocaleDateString()}</p>
                </div>
                {isAdmin && (
                  <button onClick={() => deleteMutation.mutate(d.id)} className="shrink-0 text-slate-300 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {uploadOpen && (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["documents"] }); setUploadOpen(false) }}
        />
      )}
    </div>
  )
}

function UploadDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [sisterProfile, setSisterProfile] = useState("")
  const [documentType, setDocumentType] = useState<DocumentType>("other")
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const profilesQuery = useQuery({
    queryKey: ["sister-profiles", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 200 } }); return data.results },
  })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      form.append("sisterProfile", sisterProfile)
      form.append("documentType", documentType)
      form.append("file", file as File)
      const { data } = await api.post("/documents/", form, { headers: { "Content-Type": "multipart/form-data" } })
      return data
    },
    onSuccess,
    onError: (err: unknown) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sisterProfile || !file) { setError("Sister Profile and a file are required."); return }
    setError(null)
    uploadMutation.mutate()
  }

  return (
    <Dialog open onClose={onClose} title="Upload Document">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Sister Profile *</label>
          <Select required value={sisterProfile} onChange={(e) => setSisterProfile(e.target.value)}>
            <option value="">Select...</option>
            {profilesQuery.data?.map((sp) => (<option key={sp.id} value={sp.id}>{sp.poReference || sp.id} — {sp.buyerProfileName}</option>))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Document Type *</label>
          <Select value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentType)}>
            {Object.entries(DOCUMENT_TYPE_LABEL).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">File *</label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 hover:bg-slate-50"
          >
            <Upload className="h-4 w-4" /> {file ? file.name : "Choose a file..."}
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={uploadMutation.isPending}>{uploadMutation.isPending ? "Uploading..." : "Upload"}</Button>
        </div>
      </form>
    </Dialog>
  )
}

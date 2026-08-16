import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { extractErrorMessage } from "@/lib/errors"
import { resolveMediaUrl } from "@/lib/media"
import type { CompanyProfile, CompanyProfileInput } from "@/types/company"

const EMPTY: CompanyProfileInput = {
  name: "", tagline: "", addressLine: "", email: "", phone: "", contactPerson: "", registrationNo: "",
  bankName: "", bankAccountTitle: "", bankAccountNo: "", bankSwiftCode: "", bankAddress: "",
}

// Mirrors LOGO_MAX_BYTES in backend/apps/core/serializers.py and
// client_max_body_size in frontend-admin/nginx.conf — all three must agree.
const MAX_LOGO_BYTES = 10 * 1024 * 1024

export function CompanyProfilePage() {
  const queryClient = useQueryClient()
  const canEdit = useAuthStore((s) => s.user?.role) === "admin"
  const fileInput = useRef<HTMLInputElement>(null)
  const sealFileInput = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<CompanyProfileInput>(EMPTY)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [sealFile, setSealFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const profileQuery = useQuery({
    queryKey: ["company-profile"],
    queryFn: async () => {
      const { data } = await api.get<CompanyProfile>("/company-profile/")
      return data
    },
  })

  // Seed the form once the server value arrives. Keyed on the query data
  // rather than run on mount, because the fetch resolves after first render.
  useEffect(() => {
    if (!profileQuery.data) return
    const { name, tagline, addressLine, email, phone, contactPerson, registrationNo,
      bankName, bankAccountTitle, bankAccountNo, bankSwiftCode, bankAddress } = profileQuery.data
    setForm({
      name, tagline, addressLine, email, phone, contactPerson, registrationNo,
      bankName, bankAccountTitle, bankAccountNo, bankSwiftCode, bankAddress,
    })
  }, [profileQuery.data])

  const saveMutation = useMutation({
    mutationFn: async () => {
      // multipart only when a new logo is attached — sending the whole form
      // as multipart otherwise would turn every empty string into the
      // literal "undefined" on the way through FormData.
      if (logoFile || sealFile) {
        const body = new FormData()
        Object.entries(form).forEach(([key, value]) => body.append(key, value ?? ""))
        if (logoFile) body.append("logo", logoFile)
        if (sealFile) body.append("sealSignature", sealFile)
        const { data } = await api.patch<CompanyProfile>("/company-profile/", body)
        return data
      }
      const { data } = await api.patch<CompanyProfile>("/company-profile/", form)
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["company-profile"], data)
      setLogoFile(null)
      setSealFile(null)
      setError(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  function field(key: keyof CompanyProfileInput, label: string, placeholder = "", type = "text") {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
        <Input
          type={type}
          value={form[key] ?? ""}
          placeholder={placeholder}
          disabled={!canEdit}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      </div>
    )
  }

  if (profileQuery.isLoading) {
    return <div className="flex justify-center py-16"><Spinner className="text-slate-400" /></div>
  }

  const missing = profileQuery.data?.missingFields ?? []
  const logoUrl = logoFile ? URL.createObjectURL(logoFile) : resolveMediaUrl(profileQuery.data?.logo ?? "")
  const sealUrl = sealFile ? URL.createObjectURL(sealFile) : resolveMediaUrl(profileQuery.data?.sealSignature ?? "")

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Company Profile</h1>
        <p className="text-sm text-slate-500">
          Your own company identity and bank details — printed on every Commercial Invoice / Packing List.
        </p>
      </div>

      {missing.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Invoices will print with gaps until this is filled in.</p>
            <p className="text-xs">Still missing: {missing.join(", ")}.</p>
          </div>
        </div>
      )}

      {!canEdit && (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
          Read-only — only an Admin can change the company identity and bank details.
        </p>
      )}

      <Card>
        <CardHeader><CardTitle>Letterhead</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-24 w-72 items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50">
              {logoUrl
                ? <img src={logoUrl} alt="Letterhead" className="max-h-full max-w-full object-contain" />
                : <span className="text-xs text-slate-400">No letterhead uploaded</span>}
            </div>
            <div className="text-xs text-slate-500">
              <input
                ref={fileInput} type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  // Caught here rather than at save time: nginx hard-stops
                  // >10 MB uploads with a bare 413 page, which surfaces in the
                  // UI as an unusable generic network error.
                  if (file && file.size > MAX_LOGO_BYTES) {
                    e.target.value = "" // so picking the same file again still fires onChange
                    setLogoFile(null)
                    setError(
                      `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB — ` +
                      "letterhead images must be 10 MB or less.",
                    )
                    return
                  }
                  setError(null)
                  setLogoFile(file)
                }}
              />
              <Button variant="outline" size="sm" disabled={!canEdit} onClick={() => fileInput.current?.click()}>
                <Upload className="h-4 w-4" /> {logoUrl ? "Replace letterhead" : "Upload letterhead"}
              </Button>
              {/* Matches how the export behaves: an uploaded banner replaces
                  the typeset header rather than sitting above a duplicate of
                  the same address. */}
              <p className="mt-2 max-w-xs">
                A full-width banner works best (PNG or JPG, up to 10 MB). When one is set it replaces the typed
                name/address block at the top of the invoice, so make sure it carries everything you want printed.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {field("name", "Company name", "Sumaiya International")}
            {field("tagline", "Tagline", "(Export, Import, Supply & Manufacturer)")}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Address</label>
            <Textarea
              rows={2} value={form.addressLine} disabled={!canEdit}
              placeholder="House 38 (Ground Floor), Road 5/A, Sector 05, Uttara, Dhaka-1230, Bangladesh"
              onChange={(e) => setForm((f) => ({ ...f, addressLine: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("email", "E-mail", "you@company.com", "email")}
            {field("phone", "Phone / Cell", "+880 1777 634066")}
            {field("contactPerson", "Contact person (printed on the invoice header)", "Mohammed Sumaiya")}
            {field("registrationNo", "Registration / BIN No", "optional")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bank Details</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-slate-500">
            Printed in the invoice footer — this is the account your buyers wire against.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("bankName", "Bank name", "Commercial Bank of Ceylon PLC")}
            {field("bankAccountTitle", "Account title", "M/S SUMAIYA INTERNATIONAL")}
            {field("bankAccountNo", "Account number", "1806011466")}
            {field("bankSwiftCode", "SWIFT code", "CCEYBDDH")}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Bank address</label>
            <Textarea
              rows={2} value={form.bankAddress} disabled={!canEdit}
              placeholder="Uttara Branch, Plot 12, Road 14/C, Sector 4, Uttara, Dhaka 1230, Bangladesh"
              onChange={(e) => setForm((f) => ({ ...f, bankAddress: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Seal & Signature</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-slate-500">
            Printed bottom-right of every invoice, above the "Authorized Signatory" line.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-24 w-48 items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50">
              {sealUrl
                ? <img src={sealUrl} alt="Seal and signature" className="max-h-full max-w-full object-contain" />
                : <span className="text-xs text-slate-400">No seal/signature uploaded</span>}
            </div>
            <div className="text-xs text-slate-500">
              <input
                ref={sealFileInput} type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  if (file && file.size > MAX_LOGO_BYTES) {
                    e.target.value = ""
                    setSealFile(null)
                    setError(
                      `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB — ` +
                      "seal/signature images must be 10 MB or less.",
                    )
                    return
                  }
                  setError(null)
                  setSealFile(file)
                }}
              />
              <Button variant="outline" size="sm" disabled={!canEdit} onClick={() => sealFileInput.current?.click()}>
                <Upload className="h-4 w-4" /> {sealUrl ? "Replace seal/signature" : "Upload seal/signature"}
              </Button>
              <p className="mt-2 max-w-xs">A scanned stamp + signature, PNG with a transparent background works best (up to 10 MB).</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button disabled={!canEdit || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "Saving…" : "Save company profile"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        {profileQuery.data?.updatedByName && (
          <span className="text-xs text-slate-400">
            Last updated by {profileQuery.data.updatedByName}
          </span>
        )}
      </div>
    </div>
  )
}

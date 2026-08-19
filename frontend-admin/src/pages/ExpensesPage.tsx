import { useQuery } from "@tanstack/react-query"
import { Download, FileSpreadsheet, FileText, Table2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { downloadFile } from "@/lib/download"
import { extractErrorMessage } from "@/lib/errors"
import type { Paginated } from "@/types/api"
import type { BuyerProfile } from "@/types/buyers"
import type { SisterProfile } from "@/types/sourcing"

interface Expense {
  id: string; sisterProfile: string; sisterProfilePoReference: string
  buyerProfile: string; buyerProfileName: string
  product: string | null; productName: string | null
  sourceType: string; amount: string; currency: string
  remarks: string; fieldName: string
  createdBy: string; createdByName: string; createdAt: string
}

const SOURCE_TYPES = [
  "sourcing_advance", "qc_lunch", "qc_carrying", "qc_travel_extra",
  "warehouse_loader", "warehouse_extra_worker", "warehouse_packaging_item", "custom_field", "extra_cost",
]

// Mirrors exports.GROUP_BY_OPTIONS on the backend — the value is sent as
// ?groupBy= and decides both the summary sheet and the subtotal rows.
const GROUP_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "No grouping — flat list" },
  { value: "buyer", label: "Buyer" },
  { value: "sisterProfile", label: "Sister Profile / PO" },
  { value: "product", label: "Product" },
  { value: "sourceType", label: "Source Type" },
  { value: "recordedBy", label: "Recorded By" },
  { value: "month", label: "Month" },
  { value: "currency", label: "Currency" },
]

const PAGE_SIZE = 500

function label(sourceType: string) {
  return sourceType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

/** Quick date-range presets for the range filter. Everything is computed in
 * UTC to match the backend's `createdAt__date` filtering (TIME_ZONE = UTC). */
const DATE_PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: "This month", range: () => {
    const now = new Date()
    return [isoDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), isoDay(now)]
  } },
  { label: "Last month", range: () => {
    const now = new Date()
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
    return [isoDay(first), isoDay(last)]
  } },
  { label: "Last 30 days", range: () => {
    const now = new Date()
    const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
    return [isoDay(from), isoDay(now)]
  } },
  { label: "This year", range: () => {
    const now = new Date()
    return [isoDay(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))), isoDay(now)]
  } },
  { label: "All time", range: () => ["", ""] },
]

export function ExpensesPage() {
  const navigate = useNavigate()
  const [buyerFilter, setBuyerFilter] = useState("")
  const [sisterProfileFilter, setSisterProfileFilter] = useState("")
  const [sourceTypes, setSourceTypes] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [currency, setCurrency] = useState("")
  const [recordedBy, setRecordedBy] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")

  const [downloadOpen, setDownloadOpen] = useState(false)
  const [groupBy, setGroupBy] = useState("sourceType")
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  // Per-row selection state for "Download Selected"
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Typing in the search box shouldn't fire a request per keystroke — the
  // filter is applied server-side now, unlike the other controls which
  // change one value at a time.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(timer)
  }, [searchInput])

  // The single source of truth for "which expenses are we looking at" —
  // sent to /expenses/ for the table and to /expenses/export/ for the
  // download, so a file can never contain a different slice than the
  // screen it was requested from.
  const filterParams = useMemo(() => {
    const params: Record<string, string> = {}
    if (buyerFilter) params.buyerProfile = buyerFilter
    if (sisterProfileFilter) params.sisterProfile = sisterProfileFilter
    if (sourceTypes.length) params.sourceType = sourceTypes.join(",")
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (currency) params.currency = currency
    if (recordedBy) params.createdBy = recordedBy
    if (search) params.search = search
    return params
  }, [buyerFilter, sisterProfileFilter, sourceTypes, dateFrom, dateTo, currency, recordedBy, search])

  const expensesQuery = useQuery({
    queryKey: ["expenses", filterParams],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Expense>>("/expenses/", {
        params: { ...filterParams, page_size: PAGE_SIZE },
      })
      return data
    },
  })

  const buyersQuery = useQuery({
    queryKey: ["buyers", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BuyerProfile>>("/buyers/", { params: { page_size: 200 } })
      return data.results
    },
  })

  const profilesQuery = useQuery({
    queryKey: ["sister-profiles", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SisterProfile>>("/sister-profiles/", { params: { page_size: 200 } })
      return data.results
    },
  })

  // Choosing a Buyer narrows which Sister Profiles are selectable to that
  // buyer's own — picking one from a different buyer would silently produce
  // zero rows otherwise.
  const sisterProfileOptions = useMemo(
    () => (profilesQuery.data ?? []).filter((sp) => !buyerFilter || sp.buyerProfile === buyerFilter),
    [profilesQuery.data, buyerFilter],
  )

  function handleBuyerChange(value: string) {
    setBuyerFilter(value)
    if (value && sisterProfileFilter) {
      const current = profilesQuery.data?.find((sp) => sp.id === sisterProfileFilter)
      if (current?.buyerProfile !== value) setSisterProfileFilter("")
    }
  }

  // Memoized so the derived lists below don't recompute on every render —
  // `?? []` would hand them a fresh array identity each time.
  const rows = useMemo(() => expensesQuery.data?.results ?? [], [expensesQuery.data])
  const matchCount = expensesQuery.data?.count ?? 0
  const truncated = matchCount > rows.length

  // Currency and Recorded-By options come from the rows already on screen
  // rather than a separate endpoint — /users/ isn't readable by every role
  // that can reach this page.
  const currencyOptions = useMemo(
    () => Array.from(new Set(rows.map((e) => e.currency))).sort(),
    [rows],
  )
  const recordedByOptions = useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach((e) => { if (e.createdBy) map.set(e.createdBy, e.createdByName || e.createdBy) })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  // Never a single blended number: an Expense carries its own currency, so
  // BDT and USD rows are totalled separately (same rule the exports follow).
  const totalsByCurrency = useMemo(() => {
    const totals = new Map<string, number>()
    rows.forEach((e) => totals.set(e.currency, (totals.get(e.currency) ?? 0) + Number(e.amount)))
    return Array.from(totals.entries()).sort()
  }, [rows])

  /** An empty selection means "every source type" (no query param), which is
   * also how the checkboxes render it — all ticked. So the first click when
   * nothing is selected has to mean "all except this one", not "only this
   * one", and re-ticking the last box collapses back to the unfiltered
   * empty list rather than an equivalent list of all nine. */
  function toggleSourceType(value: string) {
    setSourceTypes((current) => {
      if (current.length === 0) return SOURCE_TYPES.filter((t) => t !== value)
      const next = current.includes(value)
        ? current.filter((t) => t !== value)
        : [...current, value]
      return next.length === SOURCE_TYPES.length ? [] : next
    })
  }

  function applyPreset(preset: (typeof DATE_PRESETS)[number]) {
    const [from, to] = preset.range()
    setDateFrom(from)
    setDateTo(to)
  }

  function resetFilters() {
    setBuyerFilter("")
    setSisterProfileFilter("")
    setSourceTypes([])
    setDateFrom("")
    setDateTo("")
    setCurrency("")
    setRecordedBy("")
    setSearchInput("")
  }

  // ── Row selection helpers ──────────────────────────────────────────
  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((e) => selectedIds.has(e.id)),
    [rows, selectedIds],
  )
  const someSelected = useMemo(
    () => selectedIds.size > 0 && !allSelected,
    [selectedIds, allSelected],
  )

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map((e) => e.id)))
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Clear selection whenever the row set changes (new filters loaded)
  useEffect(() => {
    setSelectedIds(new Set())
  }, [filterParams])

  async function handleDownload(filetype: "xlsx" | "csv" | "pdf") {
    setDownloading(filetype)
    setDownloadError(null)
    try {
      const params = new URLSearchParams({ ...filterParams, filetype, groupBy })
      await downloadFile(`/expenses/export/?${params.toString()}`, `expenses.${filetype}`)
      setDownloadOpen(false)
    } catch (err) {
      setDownloadError(extractErrorMessage(err))
    } finally {
      setDownloading(null)
    }
  }

  /** Download only the checked rows — sends ?id=xxx&id=yyy to the export
   * endpoint, which reuses get_queryset() so the same grouping/formatting
   * applies to just those rows. */
  async function handleDownloadSelected(filetype: "xlsx" | "csv" | "pdf") {
    if (selectedIds.size === 0) return
    setDownloading(filetype)
    setDownloadError(null)
    try {
      const params = new URLSearchParams({ filetype, groupBy })
      selectedIds.forEach((id) => params.append("id", id))
      await downloadFile(`/expenses/export/?${params.toString()}`, `expenses-selected.${filetype}`)
    } catch (err) {
      setDownloadError(extractErrorMessage(err))
    } finally {
      setDownloading(null)
    }
  }

  const activeFilterSummary = [
    buyersQuery.data?.find((b) => b.id === buyerFilter)?.name,
    profilesQuery.data?.find((sp) => sp.id === sisterProfileFilter)?.poReference,
    sourceTypes.length ? `${sourceTypes.length} source type${sourceTypes.length > 1 ? "s" : ""}` : null,
    dateFrom || dateTo ? `${dateFrom || "earliest"} → ${dateTo || "today"}` : null,
    currency || null,
    recordedByOptions.find(([id]) => id === recordedBy)?.[1],
    search ? `"${search}"` : null,
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Expenses</h1>
          <p className="text-sm text-slate-500">Central Expense Table — every cost-producing action, in one place.</p>
        </div>
        <Button onClick={() => { setDownloadError(null); setDownloadOpen(true) }}>
          <Download className="h-4 w-4" /> Download
        </Button>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => handleDownloadSelected("xlsx")}
              disabled={downloading !== null}
            >
              <FileSpreadsheet className="h-4 w-4" /> Download Selected ({selectedIds.size})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear selection
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select className="w-56" value={buyerFilter} onChange={(e) => handleBuyerChange(e.target.value)}>
          <option value="">All Buyers</option>
          {buyersQuery.data?.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
        </Select>
        <Select className="w-56" value={sisterProfileFilter} onChange={(e) => setSisterProfileFilter(e.target.value)}>
          <option value="">All Sister Profiles</option>
          {sisterProfileOptions.map((sp) => (<option key={sp.id} value={sp.id}>{sp.poReference || sp.id}</option>))}
        </Select>
        <Select
          className="w-48"
          value={sourceTypes.length === 1 ? sourceTypes[0] : sourceTypes.length ? "__multi__" : ""}
          onChange={(e) => {
            if (e.target.value === "__multi__") return
            setSourceTypes(e.target.value ? [e.target.value] : [])
          }}
        >
          <option value="">All Source Types</option>
          {/* Reachable only from the Download dialog's checkboxes, which can
              select several at once — shown here so the toolbar never
              misreports the filter that's actually applied. */}
          {sourceTypes.length > 1 && <option value="__multi__">{sourceTypes.length} selected</option>}
          {SOURCE_TYPES.map((t) => (<option key={t} value={t}>{label(t)}</option>))}
        </Select>
        <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span className="text-sm text-slate-400">to</span>
        <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <Input
          className="w-56" placeholder="Search remarks, product, PO…"
          value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
        />
        {activeFilterSummary.length > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {DATE_PRESETS.map((preset) => (
          <Button key={preset.label} variant="outline" size="sm" onClick={() => applyPreset(preset)}>
            {preset.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
          <span className="text-sm text-slate-500">
            {matchCount} expense{matchCount === 1 ? "" : "s"}
            {truncated && <span className="text-slate-400"> — showing the first {rows.length}; download for the full set</span>}
          </span>
          <span className="text-lg font-semibold text-slate-900">
            <span className="mr-1 text-sm font-normal text-slate-500">Total:</span>
            {totalsByCurrency.length === 0
              ? "0.00"
              : totalsByCurrency.map(([code, amount]) => (
                  <span key={code} className="ml-3">
                    {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                    <span className="text-sm text-slate-500">{code}</span>
                  </span>
                ))}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {expensesQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No expenses match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium w-10">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-slate-300"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected }}
                        onChange={toggleAll}
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">Buyer</th>
                    <th className="px-4 py-3 font-medium">Sister Profile</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Source Type</th>
                    <th className="px-4 py-3 font-medium">Field</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Remarks</th>
                    <th className="px-4 py-3 font-medium">Recorded By</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((e) => (
                    <tr
                      key={e.id}
                      className={`cursor-pointer hover:bg-slate-50${selectedIds.has(e.id) ? " bg-indigo-50/50" : ""}`}
                      onClick={() => navigate(e.product ? `/products/${e.product}` : `/sister-profiles/${e.sisterProfile}`)}
                    >
                      <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300"
                          checked={selectedIds.has(e.id)}
                          onChange={() => toggleRow(e.id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-500">{e.buyerProfileName || "—"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{e.sisterProfilePoReference || e.sisterProfile}</td>
                      <td className="px-4 py-3 text-slate-500">{e.productName || "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{label(e.sourceType)}</td>
                      <td className="px-4 py-3 text-slate-500">{e.fieldName || "—"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{Number(e.amount).toLocaleString()} {e.currency}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-slate-400" title={e.remarks || undefined}>{e.remarks || "—"}</td>
                      <td className="px-4 py-3 text-slate-400">{e.createdByName || "—"}</td>
                      <td className="px-4 py-3 text-slate-400">{new Date(e.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        title="Download Expenses"
        className="max-w-2xl"
      >
        {/* The dialog edits the same filter state as the toolbar rather than
            keeping a private copy — so the row count quoted here is exactly
            what the file will contain, with no second set of controls that
            can drift out of sync with the table. */}
        <div className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Buyer Profile</label>
              <Select value={buyerFilter} onChange={(e) => handleBuyerChange(e.target.value)}>
                <option value="">All Buyers</option>
                {buyersQuery.data?.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Sister Profile / PO</label>
              <Select value={sisterProfileFilter} onChange={(e) => setSisterProfileFilter(e.target.value)}>
                <option value="">All Sister Profiles</option>
                {sisterProfileOptions.map((sp) => (<option key={sp.id} value={sp.id}>{sp.poReference || sp.id}</option>))}
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Date Range</label>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span className="text-sm text-slate-400">to</span>
              <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              {DATE_PRESETS.map((preset) => (
                <Button key={preset.label} variant="ghost" size="sm" onClick={() => applyPreset(preset)}>
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-500">Source Types</label>
              {sourceTypes.length > 0 && (
                <button className="text-xs text-slate-500 underline" onClick={() => setSourceTypes([])}>
                  Select all
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {SOURCE_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300"
                    checked={sourceTypes.length === 0 || sourceTypes.includes(t)}
                    onChange={() => toggleSourceType(t)}
                  />
                  {label(t)}
                </label>
              ))}
            </div>
            {sourceTypes.length === 0 && (
              <p className="mt-1 text-xs text-slate-400">All source types included.</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Currency</label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="">All</option>
                {currencyOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Recorded By</label>
              <Select value={recordedBy} onChange={(e) => setRecordedBy(e.target.value)}>
                <option value="">Anyone</option>
                {recordedByOptions.map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Group &amp; subtotal by</label>
              <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                {GROUP_BY_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </Select>
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-900">
              {matchCount} expense{matchCount === 1 ? "" : "s"} will be exported
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {activeFilterSummary.length ? activeFilterSummary.join(" · ") : "No filters — the whole table"}
            </p>
            {totalsByCurrency.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Total on screen: {totalsByCurrency.map(([code, amount]) =>
                  `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`,
                ).join("  +  ")}
              </p>
            )}
          </div>

          {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="ghost" onClick={() => setDownloadOpen(false)}>Cancel</Button>
            <Button variant="outline" disabled={downloading !== null} onClick={() => handleDownload("csv")}>
              <Table2 className="h-4 w-4" /> {downloading === "csv" ? "Preparing…" : "CSV"}
            </Button>
            <Button variant="outline" disabled={downloading !== null} onClick={() => handleDownload("pdf")}>
              <FileText className="h-4 w-4" /> {downloading === "pdf" ? "Preparing…" : "PDF"}
            </Button>
            <Button disabled={downloading !== null} onClick={() => handleDownload("xlsx")}>
              <FileSpreadsheet className="h-4 w-4" /> {downloading === "xlsx" ? "Preparing…" : "Excel"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Fragment, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import type { Paginated } from "@/types/api"
import type { AppUser } from "@/types/users"

interface AuditLogEntry {
  id: string; actor: string; actorName: string; action: string
  entityType: string; entityId: string
  beforeSnapshot: Record<string, unknown>; afterSnapshot: Record<string, unknown>
  timestamp: string
}

export function AuditLogPage() {
  const [entityType, setEntityType] = useState("")
  const [actor, setActor] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)

  const entriesQuery = useQuery({
    queryKey: ["audit-log", entityType, actor, dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await api.get<Paginated<AuditLogEntry>>("/audit-log/", {
        params: {
          page_size: 200,
          ...(entityType ? { entityType } : {}),
          ...(actor ? { actor } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        },
      })
      return data.results
    },
  })

  const usersQuery = useQuery({
    queryKey: ["users", "all"],
    queryFn: async () => { const { data } = await api.get<Paginated<AppUser>>("/users/", { params: { page_size: 200 } }); return data.results },
  })

  const entityTypes = useMemo(
    () => Array.from(new Set((entriesQuery.data ?? []).map((e) => e.entityType))).sort(),
    [entriesQuery.data],
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500">System-wide change history — who did what, when.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select className="w-48" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">All Entity Types</option>
          {entityTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
        </Select>
        <Select className="w-52" value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="">All Actors</option>
          {usersQuery.data?.map((u) => (<option key={u.id} value={u.id}>{u.name || u.username}</option>))}
        </Select>
        <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span className="text-sm text-slate-400">to</span>
        <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {entriesQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
          ) : !entriesQuery.data?.length ? (
            <p className="py-10 text-center text-sm text-slate-400">No audit entries match the current filters.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="w-8" />
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entriesQuery.data.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                      <td className="px-4 py-3 text-slate-400">
                        {expanded === entry.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{entry.actorName}</td>
                      <td className="px-4 py-3 text-slate-500">{entry.action.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-slate-500">{entry.entityType} #{entry.entityId.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-slate-400">{new Date(entry.timestamp).toLocaleString()}</td>
                    </tr>
                    {expanded === entry.id && (
                      <tr className="bg-slate-50">
                        <td />
                        <td colSpan={4} className="px-4 py-3">
                          <SnapshotDiff before={entry.beforeSnapshot} after={entry.afterSnapshot} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SnapshotDiff({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
  if (keys.length === 0) return <p className="text-xs text-slate-400">No field-level detail recorded for this entry.</p>
  return (
    <table className="w-full text-left text-xs">
      <thead><tr className="text-slate-400">
        <th className="py-1 pr-4 font-medium">Field</th><th className="py-1 pr-4 font-medium">Before</th><th className="py-1 font-medium">After</th>
      </tr></thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} className="border-t border-slate-200">
            <td className="py-1 pr-4 font-medium text-slate-600">{k}</td>
            <td className="py-1 pr-4 text-slate-500">{formatValue(before?.[k])}</td>
            <td className="py-1 text-slate-900">{formatValue(after?.[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function formatValue(v: unknown): string {
  if (v === undefined) return "—"
  if (v === null) return "null"
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

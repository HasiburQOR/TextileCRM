import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { useEffect } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { PackingListStep } from "@/components/pipeline/PackingListStep"
import { PipelineStepper } from "@/components/pipeline/PipelineStepper"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import { ProductsPage } from "@/pages/ProductsPage"
import { SourcingCostsPage } from "@/pages/SourcingCostsPage"
import { WarehouseCostsPage } from "@/pages/WarehouseCostsPage"
import type { SisterProfile } from "@/types/buyers"
import { PIPELINE_STEP_ORDER, type PipelineProgress, type PipelineStepKey } from "@/types/pipeline"

const STEP_HINTS: Record<PipelineStepKey, string> = {
  intake: "Add this order's products — style, colors, size breakdown, and per-carton packing details.",
  sourcingCost: "Record what was spent sourcing these products, with custom cost fields deducted from the buyer's wallet.",
  packingList: "Optional per product: review the packing list generated from intake data and download it as PDF/XLSX — or skip it.",
  warehouseCost: "Record the shipment's loading, packaging, and extra warehouse costs.",
}

/**
 * One order's Sourcing Pipeline: the stepper on top (fed by the read-only
 * /pipeline/ endpoint) with the active step's working surface below — the
 * same list/form screens as before, now scoped to this Sister Profile.
 * Guided, not gated: steps are clickable in any order; nothing locks.
 */
export function PipelineDetailPage() {
  const { id = "" } = useParams()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const profileQuery = useQuery({
    queryKey: ["sister-profiles", "detail", id],
    queryFn: async () => {
      const { data } = await api.get<SisterProfile>(`/sister-profiles/${id}/`)
      return data
    },
  })

  const pipelineQuery = useQuery({
    queryKey: ["pipeline", id],
    queryFn: async () => {
      const { data } = await api.get<PipelineProgress>(`/sister-profiles/${id}/pipeline/`)
      return data
    },
  })

  const stepParam = searchParams.get("step") as PipelineStepKey | null
  const active: PipelineStepKey =
    stepParam && PIPELINE_STEP_ORDER.includes(stepParam)
      ? stepParam
      : pipelineQuery.data?.nextStep ?? "intake"

  // Opened without ?step=: land on the next pending step, then pin it in the
  // URL. Unpinned, finishing a step (e.g. saving the first product) moved
  // `nextStep` and swapped the screen out from under the user mid-work.
  const resolvedNext = pipelineQuery.data ? pipelineQuery.data.nextStep ?? "intake" : null
  const stepPinned = !!stepParam && PIPELINE_STEP_ORDER.includes(stepParam)
  useEffect(() => {
    if (!stepPinned && resolvedNext) setSearchParams({ step: resolvedNext }, { replace: true })
  }, [stepPinned, resolvedNext, setSearchParams])

  // Progress is derived from the very lists the step screens edit — recompute
  // it whenever the user switches steps (edits made inside a step invalidate
  // ["pipeline"] themselves; see PackingListStep).
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["pipeline", id] })
  }, [active, id, queryClient])

  const steps = pipelineQuery.data?.steps
  const profile = profileQuery.data
  const nextKey = pipelineQuery.data?.nextStep ?? null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/pipeline" className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-3.5 w-3.5" /> All orders
          </Link>
          <h1 className="text-xl font-semibold text-slate-900">
            Sourcing Pipeline — {profile?.poReference || profile?.referenceCode || "…"}
          </h1>
          <p className="text-sm text-slate-500">
            {profile
              ? `${profile.buyerProfileName} · ${profile.supplierCurrency} → ${profile.buyerCurrency}`
              : "Loading order…"}
          </p>
        </div>
        <Link
          to={`/sister-profiles/${id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Full profile
        </Link>
      </div>

      {!steps ? (
        <div className="flex justify-center py-10"><Spinner className="text-slate-400" /></div>
      ) : (
        <>
          <PipelineStepper steps={steps} active={active} onSelect={(key) => setSearchParams({ step: key })} />

          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {pipelineQuery.data?.completed ? (
              <><span className="font-medium">All steps complete.</span> Nothing is locked — every step can still be revisited and edited.</>
            ) : (
              <>
                <span className="font-medium">Next: </span>
                {nextKey ? (
                  <button
                    type="button"
                    onClick={() => setSearchParams({ step: nextKey })}
                    className="cursor-pointer font-medium underline decoration-slate-400 underline-offset-2 hover:decoration-slate-900"
                  >
                    {steps[nextKey].title}
                  </button>
                ) : "—"}
                {" "}— click any step above; they stay open in any order.
              </>
            )}
          </p>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">{steps[active].title}</h2>
            <p className="mb-4 text-sm text-slate-500">{STEP_HINTS[active]}</p>
            {active === "intake" && <ProductsPage sisterProfileId={id} embedded />}
            {active === "sourcingCost" && <SourcingCostsPage sisterProfileId={id} embedded />}
            {active === "packingList" && <PackingListStep sisterProfileId={id} />}
            {active === "warehouseCost" && <WarehouseCostsPage sisterProfileId={id} embedded />}
          </div>
        </>
      )}
    </div>
  )
}

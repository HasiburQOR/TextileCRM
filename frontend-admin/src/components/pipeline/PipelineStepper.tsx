import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { PIPELINE_STEP_ORDER, type PipelineProgress, type PipelineStepKey } from "@/types/pipeline"

/**
 * The Unified Sourcing Pipeline as a stepper: the four steps in their fixed
 * order, colored by done-ness. Guided, not gated — every step is always
 * clickable, because nothing in the merged workflow locks (no approval or
 * cost-lock gates remain); the colors only show where the order stands.
 *
 * Packing List is optional: when it reads "done" without a single document
 * export, the whole step was finished by skipping, so its dot turns amber
 * instead of green to say "closed, but by skip, not by work".
 */
export function PipelineStepper({ steps, active, onSelect }: {
  steps: PipelineProgress["steps"]
  active: PipelineStepKey
  onSelect: (key: PipelineStepKey) => void
}) {
  return (
    <ol className="flex flex-wrap items-center gap-y-3 rounded-lg border border-slate-200 bg-white p-4">
      {PIPELINE_STEP_ORDER.map((key, i) => {
        const step = steps[key]
        const done = step.done
        const current = key === active && !done
        const skippedOver = key === "packingList" && done && (step.exportedCount ?? 0) === 0
        return (
          <li key={key} className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(key)}
              className="flex items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-slate-50"
              title={done && !skippedOver ? "Done" : skippedOver ? "Finished by skipping" : "Not done yet"}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold",
                  done && !skippedOver && "border-emerald-500 bg-emerald-500 text-white",
                  done && skippedOver && "border-amber-400 bg-amber-400 text-white",
                  current && "border-slate-900 bg-slate-900 text-white",
                  !done && !current && "border-slate-300 bg-white text-slate-400",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-xs",
                  current ? "font-semibold text-slate-900" : done ? "text-slate-600" : "text-slate-400",
                )}
              >
                {i + 1}. {step.title}
                {step.optional && (
                  <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-400">
                    optional
                  </span>
                )}
              </span>
            </button>
            {i < PIPELINE_STEP_ORDER.length - 1 && (
              <span className={cn("mx-2 h-px w-6 sm:w-10", done ? "bg-emerald-400" : "bg-slate-200")} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

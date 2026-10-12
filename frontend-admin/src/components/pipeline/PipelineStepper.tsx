import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { PIPELINE_STEP_ORDER, type PipelineProgress, type PipelineStepKey } from "@/types/pipeline"

/**
 * The Unified Sourcing Pipeline as a stepper: the four steps in their fixed
 * order, colored by done-ness. Guided, not gated — every step is always
 * clickable, because nothing in the merged workflow locks (no approval or
 * cost-lock gates remain); the colors only show where the order stands.
 *
 * Each step is a real tab-style button (border, hover, pressed state) so it
 * reads as clickable. "Which step am I on" (dark border + tint) is shown
 * separately from "is it done" (green dot) — a finished step stays visibly
 * selected while it is open.
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
    <ol className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
      {PIPELINE_STEP_ORDER.map((key, i) => {
        const step = steps[key]
        const done = step.done
        const selected = key === active
        const skippedOver = key === "packingList" && done && (step.exportedCount ?? 0) === 0
        const status = done ? (skippedOver ? "Skipped" : "Done") : "Not done yet"
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelect(key)}
              aria-current={selected ? "step" : undefined}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-left shadow-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 active:translate-y-px",
                selected
                  ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                  : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  done && !skippedOver && "border-emerald-500 bg-emerald-500 text-white",
                  done && skippedOver && "border-amber-400 bg-amber-400 text-white",
                  !done && selected && "border-slate-900 bg-slate-900 text-white",
                  !done && !selected && "border-slate-300 bg-white text-slate-500",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={cn("truncate text-sm", selected ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>
                  {step.title}
                  {step.optional && (
                    <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500">
                      optional
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[11px]",
                    done ? (skippedOver ? "text-amber-600" : "text-emerald-600") : "text-slate-400",
                  )}
                >
                  {status}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

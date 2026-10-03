import { Check, X } from "lucide-react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"
import type { ProductStatus } from "@/types/sourcing"

/** The product lifecycle as a row of steps, plus one plain sentence saying
 * what has to happen next and who does it — the status badge alone doesn't
 * tell anyone what to do about it. Mirrors the transitions in
 * backend/apps/sourcing/services.py. */
const STEPS: { status: ProductStatus; label: string }[] = [
  { status: "sourcing_trip_open", label: "Sourcing" },
  { status: "pending_admin_approval", label: "Approval" },
  { status: "approved_for_qc", label: "QC" },
  { status: "in_warehouse", label: "Warehouse" },
  { status: "ready_for_final_qc", label: "Final QC" },
  { status: "completed", label: "Completed" },
]

const NEXT_STEP: Record<ProductStatus, { who: string; text: React.ReactNode }> = {
  sourcing_trip_open: {
    who: "Company Rep",
    text: (
      <>
        Add this product to a <Link to="/sourcing-costs" className="font-medium underline">Sourcing Cost</Link>, close that
        cost once every location is paid, then click <strong>Submit for Approval</strong>.
      </>
    ),
  },
  pending_admin_approval: {
    who: "Admin",
    text: (
      <>
        Waiting for an Admin to approve or reject it in <Link to="/approvals" className="font-medium underline">Admin Approval</Link>.
      </>
    ),
  },
  rejected: {
    who: "Admin / Company Rep",
    text: <>Fix what the rejection reason says (an Admin can Edit the product), then click <strong>Resubmit for Approval</strong>.</>,
  },
  approved_for_qc: { who: "QC Person", text: <>The QC person records a QC report for this product, which moves it to the warehouse.</> },
  in_warehouse: {
    who: "Warehouse Manager",
    text: (
      <>
        Record this order's <Link to="/warehouse-costs" className="font-medium underline">Warehouse Costs</Link>, then click{" "}
        <strong>Mark Ready for Final QC</strong>.
      </>
    ),
  },
  ready_for_final_qc: {
    who: "QC Person",
    text: <>Final QC: save the final goods name, price and fabric details, then generate both QR codes.</>,
  },
  completed: { who: "", text: <>Done — both QR codes have been generated.</> },
}

export function ProductProgress({ status }: { status: ProductStatus }) {
  // Rejected sits at the Approval step, shown in red.
  const currentIndex = status === "rejected" ? 1 : STEPS.findIndex((s) => s.status === status)
  const next = NEXT_STEP[status]

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <ol className="flex flex-wrap items-center gap-y-2">
        {STEPS.map((step, i) => {
          const done = i < currentIndex || status === "completed"
          const current = i === currentIndex && status !== "completed"
          const rejected = current && status === "rejected"
          return (
            <li key={step.status} className="flex items-center">
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold",
                    done && "border-emerald-500 bg-emerald-500 text-white",
                    current && !rejected && "border-slate-900 bg-slate-900 text-white",
                    rejected && "border-red-500 bg-red-500 text-white",
                    !done && !current && "border-slate-300 bg-white text-slate-400",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : rejected ? <X className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    current ? "font-semibold text-slate-900" : done ? "text-slate-600" : "text-slate-400",
                    rejected && "text-red-700",
                  )}
                >
                  {rejected ? "Rejected" : step.label}
                </span>
              </span>
              {i < STEPS.length - 1 && <span className={cn("mx-2 h-px w-6 sm:w-10", i < currentIndex ? "bg-emerald-400" : "bg-slate-200")} />}
            </li>
          )
        })}
      </ol>
      <p className={cn("rounded-md px-3 py-2 text-sm", status === "rejected" ? "bg-red-50 text-red-800" : status === "completed" ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-700")}>
        {next.who && <span className="mr-1.5 inline-block rounded bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">{next.who}</span>}
        <span className="font-medium">Next: </span>
        {next.text}
      </p>
    </div>
  )
}

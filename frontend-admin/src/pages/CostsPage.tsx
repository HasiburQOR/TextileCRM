import { useState } from "react"
import { SourcingCostsPage } from "@/pages/SourcingCostsPage"
import { WarehouseCostsPage } from "@/pages/WarehouseCostsPage"

/**
 * The combined Costs page (Sourcing Costs + Warehouse Costs) — one stop in
 * the merged sequential workflow (Buyer/Sister Profile → Templates →
 * Intake-as-packing-list → Costs → Invoice). Costs carry no approval gates:
 * both sections are plain create/edit/delete lists, rendered as two labeled
 * sections on one page.
 */
export function CostsPage() {
  const [section, setSection] = useState<"sourcing" | "warehouse">("sourcing")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSection("sourcing")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            section === "sourcing" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          Sourcing Costs
        </button>
        <button
          type="button"
          onClick={() => setSection("warehouse")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            section === "warehouse" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          Warehouse Costs
        </button>
      </div>
      {section === "sourcing" ? <SourcingCostsPage /> : <WarehouseCostsPage />}
    </div>
  )
}

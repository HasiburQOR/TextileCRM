// src/types/pipeline.ts
// Shape of GET /sister-profiles/{id}/pipeline/ — the Unified Sourcing
// Pipeline progress endpoint. Step key order in `steps` IS the fixed
// pipeline order (1 Intake → 2 Sourcing Cost → 3 Packing List → 4 Warehouse
// Cost); see backend/apps/buyers/views.py SisterProfileViewSet.pipeline.

export type PipelineStepKey = "intake" | "sourcingCost" | "packingList" | "warehouseCost"

export const PIPELINE_STEP_ORDER: PipelineStepKey[] = ["intake", "sourcingCost", "packingList", "warehouseCost"]

export interface PipelineStepState {
  title: string
  done: boolean
  /** Step 3 only — the packing list can be finished by skipping instead of
   * downloading the document, per product. */
  optional?: boolean
  productCount?: number
  costCount?: number
  exportedCount?: number
  skippedCount?: number
}

export interface PipelineProgress {
  sisterProfile: string
  steps: Record<PipelineStepKey, PipelineStepState>
  nextStep: PipelineStepKey | null
  completed: boolean
}

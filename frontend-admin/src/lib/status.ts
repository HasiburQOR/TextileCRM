import type { BadgeProps } from "@/components/ui/badge"
import type { CostStatus, ProductStatus } from "@/types/sourcing"

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  sourcing_trip_open: "Sourcing Cost Open",
  pending_admin_approval: "Pending Approval",
  rejected: "Rejected",
  approved_for_qc: "Approved for QC",
  in_warehouse: "In Warehouse",
  ready_for_final_qc: "Ready for Final QC",
  completed: "Completed",
}

export const PRODUCT_STATUS_BADGE_VARIANT: Record<ProductStatus, NonNullable<BadgeProps["variant"]>> = {
  sourcing_trip_open: "default",
  pending_admin_approval: "warning",
  rejected: "danger",
  approved_for_qc: "info",
  in_warehouse: "info",
  ready_for_final_qc: "info",
  completed: "success",
}

export const COST_STATUS_LABEL: Record<CostStatus, string> = {
  open: "Open",
  closed: "Closed",
}

export const COST_STATUS_BADGE_VARIANT: Record<CostStatus, NonNullable<BadgeProps["variant"]>> = {
  open: "default",
  closed: "success",
}


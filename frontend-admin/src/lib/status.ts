import type { BadgeProps } from "@/components/ui/badge"
import type { LocationEntryStatus, ProductStatus, TripStatus } from "@/types/sourcing"

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  sourcing_trip_open: "Sourcing Trip Open",
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

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  open: "Open",
  closed: "Closed",
}

export const TRIP_STATUS_BADGE_VARIANT: Record<TripStatus, NonNullable<BadgeProps["variant"]>> = {
  open: "default",
  closed: "success",
}

export const LOCATION_STATUS_LABEL: Record<LocationEntryStatus, string> = {
  pending: "Pending",
  reported: "Reported",
}

export const LOCATION_STATUS_BADGE_VARIANT: Record<LocationEntryStatus, NonNullable<BadgeProps["variant"]>> = {
  pending: "warning",
  reported: "success",
}

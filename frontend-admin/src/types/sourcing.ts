export type ProductStatus =
  | "sourcing_trip_open"
  | "pending_admin_approval"
  | "rejected"
  | "approved_for_qc"
  | "in_warehouse"
  | "ready_for_final_qc"
  | "completed"

export interface ProductVariant {
  id: string
  colorBreakdown: Record<string, number>
  patternNo: string
  orderQty: number
  sizeBreakdown: Record<string, number>
  pcsPerCarton: number
  innerBundle: number
  cartonNoFrom: number | null
  cartonNoTo: number | null
  noOfCartons: number
  totalPcs: number
  grossWeight: number | null
  netWeight: number | null
  totalGrossWeight: number
  totalNetWeight: number
  ctnLength: number | null
  ctnWidth: number | null
  ctnHeight: number | null
  cbm: number
  totalCbm: number
}

export interface ProductImage {
  id: string
  product: string
  image: string
  label: "front_label" | "back_label" | "product_overall" | "fabric_closeup" | "custom"
  customLabelName: string
  gpsLat: string | null
  gpsLng: string | null
  capturedAt: string | null
  uploadedBy: string
  createdAt: string
}

export interface Product {
  id: string
  sisterProfile: string
  sisterProfilePoReference: string
  styleNumber: string
  name: string
  brandName: string
  poNo: string
  status: ProductStatus
  rejectionReason: string
  goodsName: string
  finalPrice: string | null
  fabricDetails: string
  factoryPackingList: string | null
  productQrGenerated: boolean
  productQrPayload: Record<string, unknown>
  cartonQrGenerated: boolean
  cartonQrPayload: Record<string, unknown>
  createdBy: string
  createdByName: string
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  variants: ProductVariant[]
  images: ProductImage[]
  totalOrderQty: number
  createdAt: string
  updatedAt: string
}

export interface ProductVariantInput {
  colorBreakdown: Record<string, number>
  patternNo: string
  orderQty: number
  sizeBreakdown: Record<string, number>
  innerBundle: number
  cartonNoFrom: number | null
  cartonNoTo: number | null
  grossWeight: number | null
  netWeight: number | null
  ctnLength: number | null
  ctnWidth: number | null
  ctnHeight: number | null
}

export interface ProductCreateInput {
  sisterProfile: string
  styleNumber: string
  name: string
  brandName: string
  poNo: string
  variants: ProductVariantInput[]
}

export interface SisterProfile {
  id: string
  buyerProfile: string
  buyerProfileName: string
  poReference: string
  agreementType: string
  status: string
}

export type LocationEntryStatus = "pending" | "reported"

export interface SourcingLocationEntry {
  id: string
  sourcingTrip: string
  locationName: string
  quantity: number
  advanceAmount: string
  status: LocationEntryStatus
  date: string
  reportedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SourcingLocationEntryInput {
  locationName: string
  quantity: number
  advanceAmount: number
  date: string
}

export type TripStatus = "open" | "closed"

export interface SourcingTrip {
  id: string
  product: string
  productName: string
  status: TripStatus
  fullPaymentConfirmedAt: string | null
  locations: SourcingLocationEntry[]
  createdAt: string
  updatedAt: string
}

export interface SourcingTripCreateInput {
  product: string
  locations: SourcingLocationEntryInput[]
}

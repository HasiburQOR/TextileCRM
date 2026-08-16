import type { SizeBreakdownEntry } from "@/components/packing/SizeBreakdownInput"
import type { CustomFieldEntry, ProductTemplateFieldEntry } from "@/types/templates"

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
  colorName: string
  patternNo: string
  orderQty: number
  sizeBreakdown: SizeBreakdownEntry[]
  customFieldValues: CustomFieldEntry[]
  pcsPerCarton: number
  innerBundle: number
  cartonNoFrom: number | null
  cartonNoTo: number | null
  noOfCartons: number
  totalPcs: number
  // Buy unit price per piece for this color (flat across its sizes) and the
  // computed Amount = totalPcs x unitPrice.
  unitPrice: number | null
  totalAmount: number
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
  // Captured at intake; pre-fills the invoice line Material column.
  material: string
  // Product_Templates_Custom_Fields_Module.md
  template: string | null
  templateName: string | null
  resolvedTemplateFields: ProductTemplateFieldEntry[]
  customFields: CustomFieldEntry[]
  status: ProductStatus
  rejectionReason: string
  goodsName: string
  finalPrice: string | null
  fabricDetails: string
  factoryPackingList: string | null
  packingCartonCount: number
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
  colorName: string
  patternNo: string
  orderQty: number
  sizeBreakdown: SizeBreakdownEntry[]
  customFieldValues: CustomFieldEntry[]
  innerBundle: number
  cartonNoFrom: number | null
  cartonNoTo: number | null
  unitPrice: number | null
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
  material?: string
  template?: string | null
  resolvedTemplateFields?: ProductTemplateFieldEntry[]
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

export interface CustomCostField {
  name: string
  amount: number
}

export interface SourcingCostItem {
  id: string
  sourcingCost: string
  product: string
  productName: string
  styleNumber: string
  poNo: string
  brandName: string
  locationName: string
  quantity: number
  customCostFields: CustomCostField[]
  totalAmount: string
  date: string
  createdAt: string
  updatedAt: string
}

export interface SourcingCostItemInput {
  product: string
  locationName: string
  quantity: number
  customCostFields: CustomCostField[]
  date: string
}

export type CostStatus = "open" | "closed"

export interface SourcingCost {
  id: string
  sisterProfile: string
  sisterProfileName: string
  poReference: string
  status: CostStatus
  fullPaymentConfirmedAt: string | null
  items: SourcingCostItem[]
  totalAmount: string
  createdAt: string
  updatedAt: string
}

export interface SourcingCostCreateInput {
  sisterProfile: string
  items: SourcingCostItemInput[]
}

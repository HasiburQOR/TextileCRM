import type { SizeBreakdownEntry } from "@/components/packing/SizeBreakdownInput"
import type { CustomFieldEntry } from "@/types/templates"

export interface PackingRule {
  id: string; buyerProfile: string | null; name: string
  sizeRatio: Record<string, number>; unitsPerCarton: number
  colorRatio: Record<string, number>
  cartonLength: number; cartonWidth: number; cartonHeight: number
  cartonNetWeight: number; cartonGrossWeight: number
  createdAt: string; updatedAt: string
}

export interface PackingCarton {
  id: string; packingList: string; product: string; styleNo: string
  // Packing_List_Module_Instructions.md §3.1: defaults from the Product's
  // PO No but independently editable/stored per row.
  poNo: string
  styleNumber: string; productName: string; productMaterial: string; packingListReferenceCode: string
  cartonNoFrom: number; cartonNoTo: number; noOfCartons: number
  colorName: string; patternNo: string; assortId: string
  sizeBreakdown: SizeBreakdownEntry[]
  customFieldValues: CustomFieldEntry[]
  totalPcsPerCarton: number; innerBundle: number
  orderQty: number; shipQty: number
  shortExcessQty: number; shortExcessPct: number
  // Unit price per piece, flat across the row's sizes (pre-filled from the
  // Sourcing Intake variant); computed Amount = shipQty x unitPrice.
  unitPrice: number | null; totalAmount: number
  grossWeight: number; netWeight: number
  totalGrossWeight: number; totalNetWeight: number
  ctnLength: number; ctnWidth: number; ctnHeight: number
  ctnCbm: number; totalCbm: number
}

export interface PackingList {
  id: string; sisterProfile: string; sisterProfilePoReference: string; referenceCode: string
  packingRule: string | null; poNo: string; brandName: string
  date: string | null; frontMark: string; sideMark: string
  totalOrderQty: number; totalShipQty: number
  shortExcessQty: number; shortExcessPct: number
  totalCartonQty: number; totalGrossWeight: number
  totalNetWeight: number; totalCbm: number
  cartons: PackingCarton[]
  createdBy: string; createdAt: string; updatedAt: string
}

export interface CartonInput {
  // No `styleNo` — server-derived from `product.styleNumber`, always
  // (Reference_Numbers_Identifier_System.md "Reference, Don't Copy").
  product: string; poNo: string; cartonNoFrom: number; cartonNoTo: number
  colorName: string; patternNo: string; assortId: string
  sizeBreakdown: SizeBreakdownEntry[]; customFieldValues: CustomFieldEntry[]
  innerBundle: number
  orderQty: number; unitPrice: number | null; grossWeight: number; netWeight: number
  ctnLength: number; ctnWidth: number; ctnHeight: number
}

export interface PackingListCreateInput {
  sisterProfile: string; packingRule: string | null
  poNo: string; brandName: string; date: string | null
  frontMark: string; sideMark: string
  cartons: CartonInput[]
}

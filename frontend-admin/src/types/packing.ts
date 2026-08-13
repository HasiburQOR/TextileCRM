/** Default 5 size options used when no PackingRule specifies otherwise */
export const DEFAULT_SIZE_OPTIONS = ["S", "M", "L", "XL", "XXL"]

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
  styleNumber: string; productName: string
  cartonNoFrom: number; cartonNoTo: number; noOfCartons: number
  colorBreakdown: Record<string, number>; patternNo: string; assortId: string
  sizeBreakdown: Record<string, number>
  totalPcsPerCarton: number; innerBundle: number
  orderQty: number; shipQty: number
  shortExcessQty: number; shortExcessPct: number
  grossWeight: number; netWeight: number
  totalGrossWeight: number; totalNetWeight: number
  ctnLength: number; ctnWidth: number; ctnHeight: number
  ctnCbm: number; totalCbm: number
}

export interface PackingList {
  id: string; sisterProfile: string; sisterProfilePoReference: string
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
  product: string; styleNo: string; cartonNoFrom: number; cartonNoTo: number
  colorBreakdown: Record<string, number>; patternNo: string; assortId: string
  sizeBreakdown: Record<string, number>; innerBundle: number
  orderQty: number; grossWeight: number; netWeight: number
  ctnLength: number; ctnWidth: number; ctnHeight: number
}

export interface PackingListCreateInput {
  sisterProfile: string; packingRule: string | null
  poNo: string; brandName: string; date: string | null
  frontMark: string; sideMark: string
  cartons: CartonInput[]
}

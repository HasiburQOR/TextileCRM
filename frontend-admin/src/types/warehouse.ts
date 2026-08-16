export interface WarehouseCostCustomCost {
  fieldName: string
  amount: number
  remarks?: string
}

export interface WarehouseCost {
  id: string
  sisterProfile: string
  sisterProfilePoReference: string
  packingList: string | null
  packingListReferenceCode: string
  loaderCost: string
  extraWorkerCost: string
  labelsCost: string
  htakeCost: string
  stickersCost: string
  cartonsCost: string
  polyBagsCost: string
  gamtapeCost: string
  customCosts: WarehouseCostCustomCost[]
  extraCost: string
  extraCostRemarks: string
  totalCost: string
  createdBy: string
  createdAt: string
}

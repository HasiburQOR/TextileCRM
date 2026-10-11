import type { InvoiceLineItem, InvoicePayment, InvoiceStatus } from "@/types/invoicing"

export interface PortalBuyerProfile {
  id: string
  name: string
  branding: string
}

export interface PortalKpis {
  totalOrders: number
  ordersInProgress: number
  ordersCompleted: number
  /** What this buyer still owes on Issued invoices, one row per currency
   * (converted to the buyer's currency at each invoice's locked rate) —
   * never a single number, since orders can be in different currencies. */
  invoicesOutstanding: { currency: string; amount: string }[]
}

export interface PortalActiveCost {
  id: string
  sisterProfileId: string
  poReference: string
  itemsCount: number
  totalAmount: string
  currency: string
}

export interface PortalNotification {
  id: string
  sisterProfile: string | null
  sisterProfilePoReference: string | null
  title: string
  message: string
  type: string
  isRead: boolean
  createdAt: string
}

export interface PortalDashboard {
  buyerProfile: PortalBuyerProfile
  kpis: PortalKpis
  activeSourcingCosts: PortalActiveCost[]
  recentActivity: PortalNotification[]
}

export type PortalOrderStatus = "active" | "completed" | "cancelled"

export interface PortalOrder {
  id: string
  referenceCode: string
  buyerProfileName: string
  poReference: string
  agreementType: string
  status: PortalOrderStatus
  createdAt: string
  currentBalance: string
}

export type PortalOrderDetail = Omit<PortalOrder, "currentBalance">

export interface PortalLocation {
  locationName: string
  quantity: number
  advanceAmount: string
  status: "pending" | "reported"
  reportedAt: string | null
}

export interface PortalCost {
  status: "open" | "closed"
  fullPaymentConfirmedAt: string | null
  locations: PortalLocation[]
}

export interface PortalProductImage {
  id: string
  image: string
  label: string
  customLabelName: string
}

export interface PortalProduct {
  id: string
  styleNumber: string
  name: string
  brandName: string
  poNo: string
  status: string
  goodsName: string
  fabricDetails: string
  images: PortalProductImage[]
  totalOrderQty: number
  createdAt: string
}

export interface PortalProductProgress {
  product: PortalProduct
  cost: PortalCost | null
}

export interface PortalCostItem {
  id: string
  sourceType: string
  amount: string
  currency: string
  remarks: string
  createdAt: string
}

export interface PortalCosts {
  bySourceType: { sourceType: string; total: string }[]
  total: string
  items: PortalCostItem[]
}

export interface PortalLedger {
  sisterProfile: string
  sisterProfilePoReference: string
  buyerName: string
  agreementType: string
  totalAdvance: string
  totalExpense: string
  amountOwed: string
  netPosition: string
  negativeBalance: boolean
  updatedAt: string
}

/** Since the Sourcing-Intake-as-Packing-List merge, the buyer portal's
 * packing data is the order's Products (each Product's intake record is one
 * packing list: header fields + per-color variant rows). */
export interface PortalPackingList {
  id: string
  styleNumber: string
  name: string
  brandName: string
  poNo: string
  packingDate: string | null
  frontMark: string
  sideMark: string
  totalOrderQty: number
  variants: PortalPackingVariant[]
  createdAt: string
}

export interface PortalPackingVariant {
  id: string
  colorName: string
  patternNo: string
  poNo: string
  ctnSl: string
  orderQty: number
  shipQty: number
  shortExcessQty: number
  shortExcessPct: number
  cartonNoFrom: number | null
  cartonNoTo: number | null
  noOfCartons: number
  pcsPerCarton: number
  totalGrossWeight: number
  totalNetWeight: number
  totalCbm: number
}

export interface PortalInvoice {
  id: string
  invoiceNo: string
  status: InvoiceStatus
  totalValue: string
  grandTotal: string
  convertedTotal: string
  targetCurrency: string
  outstandingBalance: string
  lineItems: InvoiceLineItem[]
  payments: InvoicePayment[]
  createdAt: string
}

export interface PortalDocument {
  id: string
  sisterProfile: string
  documentType: string
  file: string
  fileName: string
  fileSize: number
  createdAt: string
}

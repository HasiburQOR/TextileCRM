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
  /** Costs are incurred in the supplier currency and charged to the buyer
   * in theirs, at `exchangeRate` ("1 buyer = X supplier"). */
  supplierCurrency: string
  buyerCurrency: string
  exchangeRate: string | null
  createdAt: string
}

export type PortalOrderDetail = PortalOrder

/** One sourcing location of a product, as returned by
 * /portal/orders/{id}/sourcing-progress/ (amounts in the supplier currency). */
export interface PortalCostLocation {
  locationName: string
  quantity: number
  customCostFields: { name: string; amount: number | string }[] | null
}

export interface PortalCost {
  status: "open" | "closed"
  fullPaymentConfirmedAt: string | null
  items: PortalCostLocation[]
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
  /** What this cost took off the buyer's wallet, in the buyer's currency. */
  amountInBuyerCurrency: string
  buyerCurrency: string
  remarks: string
  createdAt: string
}

export interface PortalCosts {
  bySourceType: { sourceType: string; total: string; totalBuyer: string }[]
  /** As incurred, supplier currency. */
  total: string
  /** As charged to the buyer, buyer currency. */
  totalBuyer: string
  supplierCurrency: string
  buyerCurrency: string
  items: PortalCostItem[]
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
  sourceCurrency: string
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

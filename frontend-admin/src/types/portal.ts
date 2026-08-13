import type { InvoiceLineItem, InvoicePayment, InvoiceStatus } from "@/types/invoicing"
import type { PackingCarton } from "@/types/packing"

export interface PortalBuyerProfile {
  id: string
  name: string
  branding: string
}

export interface PortalKpis {
  totalOrders: number
  ordersInProgress: number
  ordersCompleted: number
  outstandingBalance: string
}

export interface PortalActiveTrip {
  id: string
  productName: string
  sisterProfileId: string
  poReference: string
  locationsReported: number
  locationsTotal: number
}

export interface PortalAlert {
  sisterProfileId: string
  poReference: string
  netPosition: string
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
  activeSourcingTrips: PortalActiveTrip[]
  recentActivity: PortalNotification[]
  alerts: PortalAlert[]
}

export type PortalOrderStatus = "active" | "completed" | "cancelled"

export interface PortalOrder {
  id: string
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

export interface PortalTrip {
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
  trip: PortalTrip | null
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

export interface PortalPackingList {
  id: string
  poNo: string
  brandName: string
  date: string | null
  totalOrderQty: number
  totalShipQty: number
  shortExcessQty: number
  shortExcessPct: number
  totalCartonQty: number
  totalGrossWeight: number
  totalNetWeight: number
  totalCbm: number
  cartons: PackingCarton[]
  createdAt: string
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

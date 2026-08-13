export type InvoiceStatus = "pending_approval" | "issued" | "rejected" | "void"
export type CommissionType = "none" | "percentage" | "flat"

export interface ExchangeRate {
  id: string
  sourceCurrency: string
  targetCurrency: string
  rate: string
  effectiveDate: string
  publishedBy: string
  createdAt: string
}

export interface ExchangeRateCreateInput {
  sourceCurrency: string
  targetCurrency: string
  rate: number
  effectiveDate: string
}

export interface InvoiceLineItem {
  id: string
  invoice: string
  product: string | null
  packingCarton: string | null
  description: string
  brand: string
  ctn: number
  qtyPerCtn: number
  totalQty: number
  unitPrice: string
  amount: string
  netWeight: string
  grossWeight: string
  cbm: string
  material: string
  styleItemCode: string
  remarks: string
}

export interface InvoiceLineItemInput {
  product?: string | null
  packingCarton?: string | null
  description: string
  brand: string
  ctn: number
  qtyPerCtn: number
  totalQty: number
  unitPrice: number
  amount: number
  netWeight: number
  grossWeight: number
  cbm: number
  material: string
  styleItemCode: string
  remarks: string
}

export interface InvoicePayment {
  id: string
  invoice: string
  amount: string
  currency: string
  paymentDate: string
  bankReference: string
  recordedBy: string
  createdAt: string
}

export interface Invoice {
  id: string
  sisterProfile: string
  sisterProfilePoReference: string
  buyerName: string
  invoiceNo: string
  status: InvoiceStatus
  rejectionReason: string
  voidReason: string
  exchangeRate: string | null
  exchangeRateValueLocked: string
  targetCurrency: string
  commissionType: CommissionType
  commissionValue: string
  commissionAmount: string
  totalValue: string
  grandTotal: string
  convertedTotal: string
  outstandingBalance: string
  createdBy: string
  approvedBy: string | null
  approvedAt: string | null
  lineItems: InvoiceLineItem[]
  payments: InvoicePayment[]
  createdAt: string
  updatedAt: string
}

export interface InvoiceCreateInput {
  sisterProfile: string
  exchangeRate?: string | null
  commissionType: CommissionType
  commissionValue: number
  lineItems: InvoiceLineItemInput[]
}

export interface InvoicePaymentInput {
  amount: number
  currency: string
  paymentDate: string
  bankReference: string
}

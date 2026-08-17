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
  warehouseCost: string | null
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
  packingListRef: string
  remarks: string
}

export interface InvoiceLineItemInput {
  product?: string | null
  packingCarton?: string | null
  warehouseCost?: string | null
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
  packingListRef: string
  remarks: string
  // ── Commercial Invoice / Packing List columns ──────────────────────
  colorSizeNote: string
  markRef: string
  hsCode: string
  netWeightPerCtn: number
  grossWeightPerCtn: number
  cbmPerCtn: number
  ctnLengthCm: number
  ctnWidthCm: number
  ctnHeightCm: number
  /** Tells the server whether the three dimensions above are already in
   * centimetres. Packing cartons store inches, so lines built from them
   * send false and the server converts on the way in. */
  dimensionsInCm?: boolean
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

export interface BuyerDetails {
  id?: string
  companyName: string
  idNumber: string
  address: string
  cityCountry: string
  contactPerson: string
  phone: string
  /** List of {label, value} pairs for custom fields. */
  customFields: { label: string; value: string }[]
}

export interface Invoice {
  id: string
  sisterProfile: string
  sisterProfilePoReference: string
  buyerName: string
  buyerDetails: BuyerDetails | null
  invoiceNo: string
  status: InvoiceStatus
  rejectionReason: string
  voidReason: string
  exchangeRate: string | null
  exchangeRateValueLocked: string
  targetCurrency: string
  sourceCurrency: string
  /** Which way `exchangeRateValueLocked` reads: "multiply" (a published
   * rate: target = source × rate) or "divide" ("1 target = rate source",
   * how hand-typed rates are written on the document). */
  rateQuote: "multiply" | "divide"
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
  sourceCurrency?: string
  targetCurrency?: string
  manualRate?: string | null
  rateQuote?: string | null
  buyerDetails?: BuyerDetails
}

export interface InvoicePaymentInput {
  amount: number
  currency: string
  paymentDate: string
  bankReference: string
}

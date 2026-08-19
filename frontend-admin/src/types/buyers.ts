export interface BuyerProfile {
  id: string
  referenceCode: string
  name: string
  contactInfo: string
  branding: string
  sisterProfileCount: number
  createdAt: string
  updatedAt: string
}

export interface BuyerProfileCreateInput {
  name: string
  contactInfo: string
  branding: string
  /** Optional — leave blank to auto-generate BUY-0001, BUY-0002, ... */
  referenceCode?: string
}

export type AgreementType = "1" | "2" | "3"

export type SisterProfileStatus = "active" | "completed" | "cancelled"

export interface SisterProfile {
  id: string
  referenceCode: string
  buyerProfile: string
  buyerProfileName: string
  poReference: string
  /** Label only — the commission rate is entered per invoice. */
  agreementType: AgreementType
  /** Where costs are incurred and priced, e.g. "BDT". */
  supplierCurrency: string
  /** What the buyer funds and reads totals in, e.g. "USD". */
  buyerCurrency: string
  /** Quoted "1 buyerCurrency = <rate> supplierCurrency". 0 = not agreed yet. */
  exchangeRate: string
  status: SisterProfileStatus
  /** True once cost entries exist — the currency config is then frozen. */
  rateLocked: boolean
  createdAt: string
  updatedAt: string
}

export interface SisterProfileCreateInput {
  buyerProfile: string
  poReference: string
  agreementType: AgreementType
  supplierCurrency: string
  buyerCurrency: string
  exchangeRate: string
  /** Optional — leave blank to auto-generate SIS-0001, SIS-0002, ... */
  referenceCode?: string
}

/** GET /sister-profiles/{id}/cost-breakdown/ — where the order's money went. */
export interface CostBreakdown {
  supplierCurrency: string
  buyerCurrency: string
  exchangeRate: string
  /** e.g. "1 USD = 120 BDT"; empty when no rate is set. */
  rateLabel: string
  groups: Record<"sourcing" | "warehouse" | "qc" | "other", { amount: string; amountBuyer: string }>
  bySourceType: {
    sourceType: string; label: string; group: string; currency: string
    amount: string; amountBuyer: string; count: number
  }[]
  total: { amount: string; amountBuyer: string }
  units: { totalOrderQty: number; unitCost: string | null; unitCostBuyer: string | null }
}

export type SisterProfileUpdateInput = Partial<
  Pick<SisterProfile, "poReference" | "supplierCurrency" | "buyerCurrency" | "exchangeRate" | "status">
>

/**
 * The three deal shapes, in the operator's own words. One source of truth
 * for the picker, the list filter and the invoice builder — the backend
 * carries the same copy on AgreementType's labels.
 */
export const AGREEMENTS: Record<
  AgreementType,
  { short: string; title: string; explanation: string; rateLabel: string; rateSuffix: string }
> = {
  "1": {
    short: "Supplier-funded",
    title: "Supplier funds everything, buyer pays a percentage",
    explanation:
      "The supplier buys the goods and covers every expense out of their own pocket. The buyer pays the supplier an agreed percentage of the total purchase.",
    rateLabel: "Percentage of the purchase",
    rateSuffix: "%",
  },
  "2": {
    short: "Per piece",
    title: "Supplier takes a fixed rate per piece",
    explanation:
      "The supplier earns a fixed amount on every single piece produced, regardless of what the goods or the expenses cost.",
    rateLabel: "Rate per piece",
    rateSuffix: "/pc",
  },
  "3": {
    short: "Cost + commission",
    title: "Buyer reimburses all costs, plus a commission",
    explanation:
      "The supplier sources everything and fronts the costs. The buyer pays back every expense in full and adds an agreed commission percentage on top.",
    rateLabel: "Commission percentage",
    rateSuffix: "%",
  },
}

export type WalletTransactionType = "top_up" | "deduction" | "refund" | "adjustment"

export interface BuyerWallet {
  buyerProfile: string
  buyerProfileName: string
  currency: string
  balance: string
  negativeBalance: boolean
  lowBalance: boolean
  lowBalanceThreshold: string | null
  createdAt: string
  updatedAt: string
}

export interface BuyerWalletSelf {
  currency: string
  balance: string
  negativeBalance: boolean
  updatedAt: string
}

/**
 * `amount`/`currency` is always what moved on the wallet (the buyer's own
 * currency, and what `balance` sums). `sourceAmount`/`sourceCurrency` is the
 * cost as it was actually incurred on the supplier side, when the two differ
 * — null on top-ups and adjustments, which are made in the wallet's currency.
 */
export interface WalletTransaction {
  id: string
  wallet: string
  type: WalletTransactionType
  amount: string
  currency: string
  sourceAmount: string | null
  sourceCurrency: string
  exchangeRateUsed: string | null
  /** e.g. "1 USD = 120 BDT"; empty when no conversion applied. */
  rateLabel: string
  sourceType: string
  description: string
  sourceExpense: string | null
  sisterProfile: string | null
  sisterProfilePoReference: string | null
  methodReference: string
  reason: string
  createdBy: string
  createdByName: string | null
  createdAt: string
}

export interface WalletTransactionSelf {
  id: string
  type: WalletTransactionType
  amount: string
  currency: string
  sourceAmount: string | null
  sourceCurrency: string
  exchangeRateUsed: string | null
  rateLabel: string
  description: string
  sisterProfilePoReference: string | null
  createdAt: string
}

/** GET /wallets/summary/ — the supplier-side money view. */
export interface WalletSummary {
  byCurrency: { currency: string; balance: string; topUps: string; charged: string; refunded: string }[]
  bySupplierCurrency: { currency: string; spent: string }[]
}

export interface WalletTopUpInput {
  amount: number
  currency: string
  methodReference: string
}

export interface WalletAdjustInput {
  amount: number
  reason: string
  sisterProfile?: string
}

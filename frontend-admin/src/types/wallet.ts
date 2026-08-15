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

export interface WalletTransaction {
  id: string
  wallet: string
  type: WalletTransactionType
  amount: string
  currency: string
  exchangeRateUsed: string | null
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
  description: string
  sisterProfilePoReference: string | null
  createdAt: string
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

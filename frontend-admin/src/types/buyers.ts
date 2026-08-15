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
  agreementType: AgreementType
  agreementRateConfig: Record<string, number>
  status: SisterProfileStatus
  rateLocked: boolean
  createdAt: string
  updatedAt: string
}

export interface SisterProfileCreateInput {
  buyerProfile: string
  poReference: string
  agreementType: AgreementType
  agreementRateConfig: Record<string, number>
  /** Optional — leave blank to auto-generate SIS-0001, SIS-0002, ... */
  referenceCode?: string
}

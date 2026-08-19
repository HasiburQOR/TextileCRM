/** Our own company identity + bank details, printed on every Commercial
 * Invoice / Packing List. A singleton on the backend — one row, always. */
export interface CompanyProfile {
  name: string
  tagline: string
  logo: string | null
  /** Company seal + signature, printed bottom-right of every invoice above
   * the "Authorized Signatory" caption. */
  sealSignature: string | null
  addressLine: string
  email: string
  phone: string
  /** Named contact printed on the invoice header ("Contact: … / TEL: …"). */
  contactPerson: string
  registrationNo: string
  bankName: string
  bankAccountTitle: string
  bankAccountNo: string
  bankSwiftCode: string
  bankAddress: string
  updatedAt: string
  updatedByName: string
  /** Human-readable labels of the fields a customer-facing document needs
   * but doesn't have yet — drives the "invoices will print with gaps"
   * warning on the invoice screens. */
  missingFields: string[]
  isComplete: boolean
}

export type CompanyProfileInput = Omit<
  CompanyProfile,
  "logo" | "sealSignature" | "updatedAt" | "updatedByName" | "missingFields" | "isComplete"
>

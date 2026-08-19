/** Converts an amount in a Sister Profile's supplier currency into its buyer
 * currency, using the rate captured when the profile was created (or edited,
 * before any cost entry locks it — see SisterProfile.is_rate_locked). Same
 * "1 buyer = X supplier" convention as the backend's
 * SisterProfile.convert_to_buyer_currency (apps.buyers.models) — dividing
 * converts supplier → buyer. Returns null when there's nothing to convert
 * (no rate set, or no amount), so callers can render "—" instead of a
 * misleading 0.00. */
export function convertToBuyerCurrency(
  amount: number | null | undefined,
  exchangeRate: string | number | null | undefined,
): number | null {
  const rate = Number(exchangeRate)
  if (!rate || amount == null) return null
  return amount / rate
}

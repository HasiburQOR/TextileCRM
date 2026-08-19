export function extractErrorMessage(err: unknown): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data
  if (!data) return "Something went wrong."
  if (typeof data === "string") return data
  if (Array.isArray(data)) return data.join(" ")
  if (typeof data === "object") return Object.values(data as Record<string, unknown>).flat().join(" ")
  return "Something went wrong."
}

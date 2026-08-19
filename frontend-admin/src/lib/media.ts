/** Always resolves against the browser's current origin, never the host/scheme
 * baked into an absolute URL from the API (request.build_absolute_uri() on the
 * backend bakes in whatever Host/scheme it internally perceived, which can be
 * wrong behind a proxy/tunnel and silently fail to load as a mixed-content
 * block). Stripping to a path and re-resolving locally sidesteps that class
 * of bug entirely. */
export function resolveMediaUrl(path: string): string {
  if (!path) return path
  try {
    const url = new URL(path, window.location.origin)
    return url.pathname + url.search
  } catch {
    return path
  }
}

/** Picks the image for one color of a Product. Sourcing Intake uploads one
 * image per variant with `customLabelName` set to that variant's color name
 * (see ProductsPage's per-color upload), so any place downstream (Packing
 * List, Invoice) that shows "the product's photo" for a specific carton/line
 * must match on color, not just grab images[0] — otherwise a multi-color
 * product always shows its first color's photo on every row. Falls back to
 * the first image when there's no color match (single-image products, or the
 * row's color name doesn't line up with what was typed at intake). */
export function pickProductImage<T extends { image: string; customLabelName: string }>(
  images: T[],
  colorName?: string,
): T | undefined {
  if (!images.length) return undefined
  const needle = colorName?.trim().toLowerCase()
  if (needle) {
    const match = images.find((img) => img.customLabelName.trim().toLowerCase() === needle)
    if (match) return match
  }
  return images[0]
}

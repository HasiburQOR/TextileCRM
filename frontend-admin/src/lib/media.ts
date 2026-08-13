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

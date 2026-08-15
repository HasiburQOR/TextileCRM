import { api } from "@/lib/api"

/** Downloads a file from an authenticated API endpoint. Plain `window.open`/
 * `<a href>` can't carry the JWT bearer token, so this fetches the file as a
 * blob through the same axios instance every other request uses (picking up
 * the Authorization header and refresh-token retry automatically), then
 * triggers a save via a throwaway object URL. */
export async function downloadFile(url: string, fallbackFilename: string): Promise<void> {
  const response = await api.get(url, { responseType: "blob" })
  const disposition = response.headers["content-disposition"] as string | undefined
  const match = disposition?.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] || fallbackFilename

  const blobUrl = window.URL.createObjectURL(response.data as Blob)
  const link = document.createElement("a")
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(blobUrl)
}

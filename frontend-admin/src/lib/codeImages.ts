import JsBarcode from "jsbarcode"
import QRCode from "qrcode"

/** Renders a CODE128 barcode to a PNG data URL.
 *
 * The quiet zone (margin) and bar width matter as much as the barcode data
 * itself — most phone scanner apps refuse to lock onto a barcode whose quiet
 * zone is too thin or whose bars are sub-2px, which is what made these
 * un-scannable before (margin: 2, width: 1.5). CODE128 needs roughly a
 * 10-module quiet zone on each side. */
export function makeBarcodeDataUrl(text: string): string | null {
  if (!text) return null
  try {
    const c = document.createElement("canvas")
    JsBarcode(c, text, {
      format: "CODE128",
      width: 2.2,
      height: 60,
      displayValue: false,
      margin: 12,
      background: "#ffffff",
      lineColor: "#0f172a",
    })
    return c.toDataURL("image/png")
  } catch {
    return null
  }
}

/** Renders a JSON payload to a QR code PNG data URL.
 *
 * Two things made these fail to scan before:
 *  1. `margin: 1` — a 1-module quiet zone is below the QR spec minimum of 4;
 *     phones' native camera scanners are strict about this and simply won't
 *     detect the code.
 *  2. `width: 120` — a fixed pixel width regardless of payload size. Once the
 *     payload pushed the QR to a higher version (more modules, e.g. a
 *     variant with several custom fields), 120px squeezed each module below
 *     1 physical pixel — visually a grey blur with nothing to decode, even
 *     before it ever reached a camera.
 * `scale` (pixels per module) fixes both: the image grows with the data
 * instead of the data getting crushed into a fixed frame. */
export async function makeQrDataUrl(payload: Record<string, unknown>): Promise<string | null> {
  const json = JSON.stringify(payload)
  if (!json || json.length === 2) return null
  try {
    return await QRCode.toDataURL(json, {
      errorCorrectionLevel: "L",
      margin: 4,
      scale: 6,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
  } catch {
    return null
  }
}

/** Load an image from a data URL. Handlers are set BEFORE src to
 *  avoid a race condition where data-URL onload fires synchronously
 *  before the Promise callback is registered. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = src
  })
}

/** Draws the code image onto a new canvas with a label at the bottom, then
 *  triggers a PNG download. */
export async function downloadWithLabel(codeDataUrl: string, label: string, filename: string) {
  const img = await loadImage(codeDataUrl)
  const textH = 28
  const pad = 6
  const canvas = document.createElement("canvas")
  canvas.width = img.width
  canvas.height = img.height + textH + pad
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  ctx.fillStyle = "#0f172a"
  ctx.font = "bold 16px monospace"
  ctx.textAlign = "center"
  ctx.fillText(label, canvas.width / 2, img.height + textH - 4)
  const a = document.createElement("a")
  a.download = filename
  a.href = canvas.toDataURL("image/png")
  a.click()
}

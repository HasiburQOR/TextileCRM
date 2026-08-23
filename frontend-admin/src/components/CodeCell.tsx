import { Download, AlertCircle, Maximize2 } from "lucide-react"
import { useEffect, useState, useCallback, useRef } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { makeBarcodeDataUrl, makeQrDataUrl, downloadWithLabel } from "@/lib/codeImages"

interface CodeCellProps {
  /** Text encoded into the CODE128 barcode (usually the style number). */
  barcodeText: string
  /** Structured payload encoded into the QR code, or null to skip QR generation entirely. */
  qrPayload: Record<string, unknown> | null
  /** Short label printed under both codes and used as the on-screen caption. */
  label: string
  /** Prefix used for the downloaded PNG filenames, e.g. "STY-001". */
  downloadPrefix: string
}

/** Barcode + QR code pair for one row, with click-to-enlarge (for phone
 * scanning) and PNG download. Used by Sourcing Intake (per color variant)
 * and Packing Lists (per carton row) so both modules share one fix for
 * scannability and one visual style. */
export function CodeCell({ barcodeText, qrPayload, label, downloadPrefix }: CodeCellProps) {
  const [barcodeUrl, setBarcodeUrl] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [qrError, setQrError] = useState("")
  const [enlarged, setEnlarged] = useState<"barcode" | "qr" | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    setBarcodeUrl(makeBarcodeDataUrl(barcodeText))
  }, [barcodeText])

  useEffect(() => {
    cancelledRef.current = false
    setQrUrl(null)
    setQrError("")
    if (!qrPayload) return
    const jsonLen = JSON.stringify(qrPayload).length
    if (jsonLen > 2800) { setQrError("Too much data"); return }
    makeQrDataUrl(qrPayload).then((url) => {
      if (!cancelledRef.current) {
        if (url) setQrUrl(url)
        else setQrError("Generation failed")
      }
    })
    return () => { cancelledRef.current = true }
  }, [qrPayload])

  const dlBarcode = useCallback(() => {
    if (barcodeUrl) downloadWithLabel(barcodeUrl, label, `${downloadPrefix}-barcode.png`)
  }, [barcodeUrl, label, downloadPrefix])

  const dlQr = useCallback(() => {
    if (qrUrl) downloadWithLabel(qrUrl, label, `${downloadPrefix}-qrcode.png`)
  }, [qrUrl, label, downloadPrefix])

  return (
    <td className="px-3 py-2">
      <div className="flex items-start gap-4">
        {/* Barcode */}
        <div className="flex flex-col items-center gap-1">
          {barcodeUrl ? (
            <button
              type="button"
              onClick={() => setEnlarged("barcode")}
              className="group relative rounded-md border border-slate-200 bg-white p-2 transition hover:border-indigo-300 hover:shadow-sm"
              title="Enlarge for scanning"
            >
              <img src={barcodeUrl} alt="Barcode" className="h-12 w-auto" />
              <Maximize2 className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full bg-white p-0.5 text-slate-400 opacity-0 shadow-sm ring-1 ring-slate-200 transition group-hover:opacity-100" />
            </button>
          ) : (
            <span className="flex h-12 w-24 items-center justify-center text-[10px] text-slate-300" title={barcodeText ? "Barcode unavailable" : "No style number"}>—</span>
          )}
          <span className="text-[11px] font-mono font-semibold text-slate-700 leading-tight">{barcodeText || "—"}</span>
          {barcodeUrl && (
            <button type="button" onClick={dlBarcode} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-600" title="Download barcode PNG">
              <Download className="h-3.5 w-3.5" /> PNG
            </button>
          )}
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center gap-1">
          {qrUrl ? (
            <button
              type="button"
              onClick={() => setEnlarged("qr")}
              className="group relative rounded-md border border-slate-200 bg-white p-1.5 transition hover:border-indigo-300 hover:shadow-sm"
              title="Enlarge for scanning"
            >
              <img src={qrUrl} alt="QR Code" className="h-20 w-20" />
              <Maximize2 className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full bg-white p-0.5 text-slate-400 opacity-0 shadow-sm ring-1 ring-slate-200 transition group-hover:opacity-100" />
            </button>
          ) : qrError ? (
            <span className="flex h-20 w-20 flex-col items-center justify-center gap-1 text-amber-500" title={qrError}>
              <AlertCircle className="h-4 w-4" />
              <span className="text-[10px]">{qrError}</span>
            </span>
          ) : qrPayload ? (
            <span className="flex h-20 w-20 items-center justify-center text-[10px] text-slate-300 animate-pulse">…</span>
          ) : (
            <span className="flex h-20 w-20 items-center justify-center text-[10px] text-slate-300">—</span>
          )}
          <span className="text-[11px] font-mono font-semibold text-slate-700 leading-tight">{label || "—"}</span>
          {qrUrl && (
            <button type="button" onClick={dlQr} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-600" title="Download QR code PNG">
              <Download className="h-3.5 w-3.5" /> PNG
            </button>
          )}
        </div>
      </div>

      {enlarged && (
        <Dialog open onClose={() => setEnlarged(null)} title={enlarged === "barcode" ? "Barcode" : "QR Code"} className="max-w-md">
          <div className="flex flex-col items-center gap-4">
            {/* Rendered at its native resolution (only capped, never stretched) —
             * a dense QR from a data-heavy row needs more physical pixels to stay
             * scannable, so forcing every code to the same fixed box here would
             * reintroduce the sub-pixel-module problem this fix is for. */}
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <img
                src={enlarged === "barcode" ? barcodeUrl! : qrUrl!}
                alt={enlarged === "barcode" ? "Barcode" : "QR code"}
                className={enlarged === "barcode" ? "h-28 w-auto max-w-full" : "h-auto w-auto max-h-[60vh] max-w-full"}
              />
            </div>
            <p className="text-center text-sm font-mono font-semibold text-slate-700">{label}</p>
            <p className="text-center text-xs text-slate-400">
              Point your phone camera at this code to scan it. If it still won't scan, tap Download and print
              it — screen glare, reflections, and low screen brightness are the most common causes on-screen.
            </p>
            <Button type="button" onClick={enlarged === "barcode" ? dlBarcode : dlQr}>
              <Download className="h-4 w-4" /> Download PNG
            </Button>
          </div>
        </Dialog>
      )}
    </td>
  )
}

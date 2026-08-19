import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

export interface LightboxImage {
  src: string
  label?: string
}

export function Lightbox({ images, initialIndex, onClose }: {
  images: LightboxImage[]
  initialIndex: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + images.length) % images.length)
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % images.length)
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [images.length, onClose])

  useEffect(() => setFailed(false), [index])

  const current = images[index]
  if (!current) return null

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="truncate text-sm text-slate-300">
          {current.label}
          {images.length > 1 && <span className="ml-2 text-slate-400">{index + 1} / {images.length}</span>}
        </span>
        <button onClick={onClose} className="shrink-0 rounded-md p-1.5 text-white hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 pb-6" onClick={(e) => e.stopPropagation()}>
        {images.length > 1 && (
          <button
            onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:left-4"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {failed ? (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <span className="text-sm">Couldn't load this image.</span>
            <a href={current.src} target="_blank" rel="noreferrer" className="text-xs text-sky-400 underline">
              Open the file directly
            </a>
          </div>
        ) : (
          <img
            src={current.src}
            alt={current.label ?? ""}
            className="max-h-full max-w-full rounded-md object-contain"
            onError={() => setFailed(true)}
          />
        )}
        {images.length > 1 && (
          <button
            onClick={() => setIndex((i) => (i + 1) % images.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:right-4"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex justify-center gap-2 overflow-x-auto px-4 pb-4" onClick={(e) => e.stopPropagation()}>
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={cn(
                "h-14 w-14 shrink-0 overflow-hidden rounded border-2 transition-opacity",
                i === index ? "border-white" : "border-transparent opacity-50 hover:opacity-90",
              )}
            >
              <img src={img.src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}

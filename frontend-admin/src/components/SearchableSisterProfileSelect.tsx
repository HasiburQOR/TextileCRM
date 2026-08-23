import { ChevronDown, Search, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

export interface SisterProfileOption {
  id: string
  referenceCode: string
  poReference: string
  buyerProfileName: string
  name?: string
}

interface SearchableSisterProfileSelectProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  options: SisterProfileOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  searchPlaceholder?: string
  className?: string
  required?: boolean
  disabled?: boolean
}

export function SearchableSisterProfileSelect({
  options,
  value,
  onChange,
  placeholder = "Select sister profile…",
  emptyMessage = "No profile found.",
  searchPlaceholder = "Search by name or PO…",
  className,
  required,
  disabled,
  ...rest
}: SearchableSisterProfileSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(() => options.find(o => o.id === value), [options, value])

  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter(
      o =>
        (o.name ?? "").toLowerCase().includes(q) ||
        o.poReference.toLowerCase().includes(q) ||
        o.buyerProfileName.toLowerCase().includes(q),
    )
  }, [options, search])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function handleSelect(id: string) {
    onChange(id)
    setOpen(false)
    setSearch("")
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange("")
  }

  function displayLabel(opt: SisterProfileOption) {
    return `${opt.poReference || opt.referenceCode} — ${opt.buyerProfileName}`
  }

  return (
    <div ref={containerRef} className={cn("relative", className)} {...rest}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          setOpen(prev => !prev)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 disabled:cursor-not-allowed disabled:opacity-50 text-left",
          required && !value && "border-red-300",
        )}
      >
        {selected ? (
          <span className="truncate">{displayLabel(selected)}</span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <span className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" onClick={clear} />
          )}
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </span>
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center border-b border-slate-100 px-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full border-0 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <ul className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-400">{emptyMessage}</li>
            )}
            {filtered.map(opt => (
              <li
                key={opt.id}
                onClick={() => handleSelect(opt.id)}
                className={cn(
                  "cursor-pointer px-3 py-1.5 text-sm hover:bg-slate-50",
                  opt.id === value && "bg-slate-50 font-medium",
                )}
              >
                {displayLabel(opt)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

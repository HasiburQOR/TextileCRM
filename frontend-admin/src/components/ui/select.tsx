import { ChevronDown } from "lucide-react"
import { type SelectHTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/utils"

// Layout-sizing utilities (w-44, max-w-sm, sm:w-56, flex-1, …) have to size
// the wrapper, not the <select>: the chevron is positioned against the
// wrapper, so a narrowed <select> inside a full-width wrapper left its arrow
// floating at the far right of the row.
const WRAPPER_CLASS = /^(?:[\w-]+:)*(?:(?:w|min-w|max-w|basis)-|flex-1$|flex-none$|shrink-0$|grow$)/

function splitClassName(className?: string): [string, string] {
  const wrapper: string[] = []
  const select: string[] = []
  for (const token of (className ?? "").split(/\s+/).filter(Boolean)) {
    ;(WRAPPER_CLASS.test(token) ? wrapper : select).push(token)
  }
  return [wrapper.join(" "), select.join(" ")]
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    const [wrapperClass, selectClass] = splitClassName(className)
    return (
      <div className={cn("relative", wrapperClass)}>
        <select
          ref={ref}
          className={cn(
            "flex h-9 w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-1 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 disabled:cursor-not-allowed disabled:opacity-50",
            selectClass,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </div>
    )
  },
)
Select.displayName = "Select"

import { type InputHTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/utils"

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, value, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      // App-wide UX rule: a number input never displays a lone 0. Fields
      // start blank and can be backspaced clear. Every number onChange in
      // this codebase keeps the state numeric (Number("") === 0), so the
      // submitted payloads are unchanged — only what's displayed becomes
      // empty. `required` number inputs therefore also flag an untouched
      // field properly instead of silently submitting 0.
      value={type === "number" && (value === 0 || value === "0") ? "" : value}
      className={cn(
        "flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = "Input"

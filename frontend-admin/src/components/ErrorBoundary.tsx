import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
  /** Changing this resets the boundary — pass the current route so
   * navigating away from a broken page clears the error instead of
   * leaving the user stuck on it. */
  resetKey?: string
}

interface State {
  error: Error | null
}

/** Without this, a single render error anywhere under the router unmounts
 * the whole React tree and the user gets a blank white page with no way
 * back — which is what an expired session used to produce (a failed query
 * left a nested array undefined, some `.map` threw, and the entire app
 * disappeared). A boundary contains the damage to the routed content and
 * keeps the shell/navigation usable.
 *
 * Error boundaries have to be class components: there is still no hook
 * equivalent for componentDidCatch. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack)
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <AlertTriangle className="h-10 w-10 text-red-500" />
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Something went wrong on this page</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            The rest of the app is still fine — use the menu to go elsewhere, or reload to try again.
          </p>
        </div>
        <pre className="max-w-xl overflow-x-auto rounded-md bg-slate-100 px-3 py-2 text-left text-xs text-slate-600">
          {this.state.error.message}
        </pre>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => this.setState({ error: null })}>Try again</Button>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    )
  }
}

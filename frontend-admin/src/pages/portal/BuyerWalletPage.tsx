import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Wallet as WalletIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"
import type { BuyerWalletSelf, WalletTransactionSelf, WalletTransactionType } from "@/types/wallet"

const WALLET_TXN_TYPE_LABEL: Record<WalletTransactionType, string> = {
  top_up: "Top-up", deduction: "Deduction", refund: "Refund", adjustment: "Adjustment",
}
const WALLET_TXN_TYPE_BADGE: Record<WalletTransactionType, "success" | "danger" | "info" | "default"> = {
  top_up: "success", deduction: "danger", refund: "info", adjustment: "default",
}

interface PortalWalletResponse {
  wallet: BuyerWalletSelf
  transactions: WalletTransactionSelf[]
}

export function BuyerWalletPage() {
  const walletQuery = useQuery({
    queryKey: ["portal", "wallet"],
    queryFn: async () => {
      const { data } = await api.get<PortalWalletResponse>("/portal/wallet/")
      return data
    },
  })

  if (walletQuery.isLoading) {
    return <div className="flex justify-center py-16"><Spinner className="text-slate-400" /></div>
  }
  if (!walletQuery.data) {
    return <p className="py-16 text-center text-sm text-slate-400">Unable to load your wallet.</p>
  }

  const { wallet, transactions } = walletQuery.data

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><WalletIcon className="h-5 w-5" /> Wallet</h1>
        <p className="text-sm text-slate-500">Your cash balance and transaction history with us.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-3xl font-semibold ${Number(wallet.balance) < 0 ? "text-red-600" : "text-emerald-600"}`}>
              {Number(wallet.balance).toLocaleString()} {wallet.currency}
            </span>
            {wallet.negativeBalance && <Badge variant="danger">Negative Balance</Badge>}
          </div>
          {wallet.negativeBalance && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Your wallet balance is currently negative — please reach out if you'd like to top up.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No transactions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Order</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-3 text-slate-500">{new Date(t.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3"><Badge variant={WALLET_TXN_TYPE_BADGE[t.type]}>{WALLET_TXN_TYPE_LABEL[t.type]}</Badge></td>
                      <td className="px-4 py-3 text-slate-700">{t.description}</td>
                      <td className="px-4 py-3 text-slate-500">{t.sisterProfilePoReference || "—"}</td>
                      <td className={`px-4 py-3 font-medium ${Number(t.amount) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {Number(t.amount) > 0 ? "+" : ""}{Number(t.amount).toLocaleString()} {t.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

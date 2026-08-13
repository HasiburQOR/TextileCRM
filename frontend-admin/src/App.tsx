import { Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { BuyerShell } from "@/components/layout/BuyerShell"
import { useAuthStore } from "@/lib/auth-store"
import { BuyerDashboardPage } from "@/pages/portal/BuyerDashboardPage"
import { BuyerOrdersPage } from "@/pages/portal/BuyerOrdersPage"
import { BuyerOrderDetailPage } from "@/pages/portal/BuyerOrderDetailPage"
import { LoginPage } from "@/pages/LoginPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { BuyersPage } from "@/pages/BuyersPage"
import { BuyerDetailPage } from "@/pages/BuyerDetailPage"
import { SisterProfilesPage } from "@/pages/SisterProfilesPage"
import { SisterProfileDetailPage } from "@/pages/SisterProfileDetailPage"
import { ProductsPage } from "@/pages/ProductsPage"
import { ProductDetailPage } from "@/pages/ProductDetailPage"
import { ApprovalsPage } from "@/pages/ApprovalsPage"
import { SourcingTripsPage } from "@/pages/SourcingTripsPage"
import { SourcingTripDetailPage } from "@/pages/SourcingTripDetailPage"
import { PackingListsPage } from "@/pages/PackingListsPage"
import { FinalQCPage } from "@/pages/FinalQCPage"
import { QCCostsPage } from "@/pages/QCCostsPage"
import { WarehouseCostsPage } from "@/pages/WarehouseCostsPage"
import { ExpensesPage } from "@/pages/ExpensesPage"
import { SettlementLedgerPage } from "@/pages/SettlementLedgerPage"
import { InvoicesPage } from "@/pages/InvoicesPage"
import { InvoiceDetailPage } from "@/pages/InvoiceDetailPage"
import { ExchangeRatesPage } from "@/pages/ExchangeRatesPage"
import { DocumentVaultPage } from "@/pages/DocumentVaultPage"
import { AuditLogPage } from "@/pages/AuditLogPage"
import { UsersPage } from "@/pages/UsersPage"
import { NotificationsPage } from "@/pages/NotificationsPage"
import { ProtectedRoute } from "@/routes/ProtectedRoute"

function ProtectedApp() {
  const user = useAuthStore((s) => s.user)

  if (user?.role === "buyer") {
    return (
      <BuyerShell>
        <Routes>
          <Route path="/" element={<Navigate to="/portal" replace />} />
          <Route path="/portal" element={<BuyerDashboardPage />} />
          <Route path="/portal/orders" element={<BuyerOrdersPage />} />
          <Route path="/portal/orders/:id" element={<BuyerOrderDetailPage />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </BuyerShell>
    )
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/buyers" element={<BuyersPage />} />
        <Route path="/buyers/:id" element={<BuyerDetailPage />} />
        <Route path="/sister-profiles" element={<SisterProfilesPage />} />
        <Route path="/sister-profiles/:id" element={<SisterProfileDetailPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/sourcing-trips" element={<SourcingTripsPage />} />
        <Route path="/sourcing-trips/:id" element={<SourcingTripDetailPage />} />
        <Route path="/packing-lists" element={<PackingListsPage />} />
        <Route path="/final-qc" element={<FinalQCPage />} />
        <Route path="/qc-reports" element={<QCCostsPage />} />
        <Route path="/warehouse-costs" element={<WarehouseCostsPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/settlements" element={<SettlementLedgerPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/exchange-rates" element={<ExchangeRatesPage />} />
        <Route path="/documents" element={<DocumentVaultPage />} />
        <Route path="/audit-log" element={<AuditLogPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <ProtectedApp />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App

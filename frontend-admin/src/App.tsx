import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { AppShell } from "@/components/layout/AppShell"
import { BuyerShell } from "@/components/layout/BuyerShell"
import { useAuthStore } from "@/lib/auth-store"
import { BuyerDashboardPage } from "@/pages/portal/BuyerDashboardPage"
import { BuyerOrdersPage } from "@/pages/portal/BuyerOrdersPage"
import { BuyerOrderDetailPage } from "@/pages/portal/BuyerOrderDetailPage"
import { BuyerWalletPage } from "@/pages/portal/BuyerWalletPage"
import { LoginPage } from "@/pages/LoginPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { BuyersPage } from "@/pages/BuyersPage"
import { BuyerDetailPage } from "@/pages/BuyerDetailPage"
import { SisterProfilesPage } from "@/pages/SisterProfilesPage"
import { SisterProfileDetailPage } from "@/pages/SisterProfileDetailPage"
import { ProductsPage } from "@/pages/ProductsPage"
import { ProductDetailPage } from "@/pages/ProductDetailPage"
import { ProductTemplatesPage } from "@/pages/ProductTemplatesPage"
import { ApprovalsPage } from "@/pages/ApprovalsPage"
import { SourcingCostsPage } from "@/pages/SourcingCostsPage"
import { SourcingCostDetailPage } from "@/pages/SourcingCostDetailPage"
import { PackingListsPage } from "@/pages/PackingListsPage"
// Temporarily disabled — see the commented-out routes below.
// import { FinalQCPage } from "@/pages/FinalQCPage"
// import { QCCostsPage } from "@/pages/QCCostsPage"
import { WarehouseCostsPage } from "@/pages/WarehouseCostsPage"
import { ExpensesPage } from "@/pages/ExpensesPage"
import { SettlementLedgerPage } from "@/pages/SettlementLedgerPage"
import { InvoicesPage } from "@/pages/InvoicesPage"
import { InvoiceDetailPage } from "@/pages/InvoiceDetailPage"
import { ExchangeRatesPage } from "@/pages/ExchangeRatesPage"
import { DocumentVaultPage } from "@/pages/DocumentVaultPage"
import { AuditLogPage } from "@/pages/AuditLogPage"
import { UsersPage } from "@/pages/UsersPage"
import { CompanyProfilePage } from "@/pages/CompanyProfilePage"
import { NotificationsPage } from "@/pages/NotificationsPage"
import { ProtectedRoute } from "@/routes/ProtectedRoute"

function ProtectedApp() {
  const user = useAuthStore((s) => s.user)
  // Keyed on the path so navigating away from a page that errored clears
  // the boundary, rather than stranding the user on the error screen.
  const { pathname } = useLocation()

  if (user?.role === "buyer") {
    return (
      <BuyerShell>
        <ErrorBoundary resetKey={pathname}>
          <Routes>
            <Route path="/" element={<Navigate to="/portal" replace />} />
            <Route path="/portal" element={<BuyerDashboardPage />} />
            <Route path="/portal/orders" element={<BuyerOrdersPage />} />
            <Route path="/portal/orders/:id" element={<BuyerOrderDetailPage />} />
            <Route path="/portal/wallet" element={<BuyerWalletPage />} />
            <Route path="*" element={<Navigate to="/portal" replace />} />
          </Routes>
        </ErrorBoundary>
      </BuyerShell>
    )
  }

  return (
    <AppShell>
      <ErrorBoundary resetKey={pathname}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/buyers" element={<BuyersPage />} />
        <Route path="/buyers/:id" element={<BuyerDetailPage />} />
        <Route path="/sister-profiles" element={<SisterProfilesPage />} />
        <Route path="/sister-profiles/:id" element={<SisterProfileDetailPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/product-templates" element={<ProductTemplatesPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/sourcing-costs" element={<SourcingCostsPage />} />
        <Route path="/sourcing-costs/:id" element={<SourcingCostDetailPage />} />
        <Route path="/packing-lists" element={<PackingListsPage />} />
        {/* Final QC & QR / QC Costs temporarily disabled — still under active
            work. Also hidden from nav (see lib/nav-items.ts). The pages and
            their backend endpoints are untouched; re-enable by uncommenting
            these two routes, their imports above, and the nav entries. Until
            then the catch-all below redirects these URLs to the dashboard. */}
        {/* <Route path="/final-qc" element={<FinalQCPage />} /> */}
        {/* <Route path="/qc-reports" element={<QCCostsPage />} /> */}
        <Route path="/warehouse-costs" element={<WarehouseCostsPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/settlements" element={<SettlementLedgerPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/exchange-rates" element={<ExchangeRatesPage />} />
        <Route path="/documents" element={<DocumentVaultPage />} />
        <Route path="/audit-log" element={<AuditLogPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/company-profile" element={<CompanyProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
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

from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views import MeView, TokenObtainPairWithClaimsView, UserViewSet
from apps.audit.views import AuditLogEntryViewSet
from apps.buyers.portal_views import (
    BuyerPortalDashboardView,
    PortalDashboardView,
    PortalOrderCostsView,
    PortalOrderDetailView,
    PortalOrderDocumentsView,
    PortalOrderInvoicesView,
    PortalOrderLedgerView,
    PortalOrderPackingListView,
    PortalOrderSourcingProgressView,
    PortalOrdersListView,
)
from apps.buyers.views import BuyerProfileViewSet, SisterProfileViewSet
from apps.documents.views import DocumentVaultItemViewSet
from apps.expenses.views import ExpenseViewSet
from apps.invoicing.views import ExchangeRateViewSet, InvoiceViewSet
from apps.ledger.views import SettlementLedgerViewSet
from apps.notifications.views import NotificationViewSet
from apps.packing.views import PackingCartonViewSet, PackingListViewSet, PackingRuleViewSet
from apps.qc.views import QCReportViewSet
from apps.sourcing.views import ProductViewSet, SourcingLocationEntryViewSet, SourcingTripViewSet
from apps.warehouse.views import WarehouseCostViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("buyers", BuyerProfileViewSet, basename="buyer-profile")
router.register("sister-profiles", SisterProfileViewSet, basename="sister-profile")
router.register("products", ProductViewSet, basename="product")
router.register("sourcing-trips", SourcingTripViewSet, basename="sourcing-trip")
router.register("packing-rules", PackingRuleViewSet, basename="packing-rule")
router.register("packing-lists", PackingListViewSet, basename="packing-list")
router.register("qc-reports", QCReportViewSet, basename="qc-report")
router.register("warehouse-costs", WarehouseCostViewSet, basename="warehouse-cost")
router.register("expenses", ExpenseViewSet, basename="expense")
router.register("exchange-rates", ExchangeRateViewSet, basename="exchange-rate")
router.register("invoices", InvoiceViewSet, basename="invoice")
router.register("settlements", SettlementLedgerViewSet, basename="settlement")
router.register("audit-log", AuditLogEntryViewSet, basename="audit-log")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("documents", DocumentVaultItemViewSet, basename="document")

trip_locations_list = SourcingLocationEntryViewSet.as_view({"get": "list", "post": "create"})
trip_locations_detail = SourcingLocationEntryViewSet.as_view({"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"})
trip_locations_report = SourcingLocationEntryViewSet.as_view({"post": "report"})

packing_cartons_list = PackingCartonViewSet.as_view({"get": "list", "post": "create"})
packing_cartons_detail = PackingCartonViewSet.as_view({"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"})

urlpatterns = [
    path("auth/token/", TokenObtainPairWithClaimsView.as_view(), name="token_obtain_pair"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("sourcing-trips/<uuid:trip_pk>/locations/", trip_locations_list, name="sourcing-trip-locations-list"),
    path("sourcing-trips/<uuid:trip_pk>/locations/<uuid:pk>/", trip_locations_detail, name="sourcing-trip-locations-detail"),
    path("sourcing-trips/<uuid:trip_pk>/locations/<uuid:pk>/report/", trip_locations_report, name="sourcing-trip-locations-report"),
    path("packing-lists/<uuid:list_pk>/cartons/", packing_cartons_list, name="packing-list-cartons-list"),
    path("packing-lists/<uuid:list_pk>/cartons/<uuid:pk>/", packing_cartons_detail, name="packing-list-cartons-detail"),
    path("buyer-portal/dashboard/", BuyerPortalDashboardView.as_view(), name="buyer-portal-dashboard"),
    path("portal/dashboard/", PortalDashboardView.as_view(), name="portal-dashboard"),
    path("portal/orders/", PortalOrdersListView.as_view(), name="portal-orders"),
    path("portal/orders/<uuid:order_id>/", PortalOrderDetailView.as_view(), name="portal-order-detail"),
    path("portal/orders/<uuid:order_id>/sourcing-progress/", PortalOrderSourcingProgressView.as_view(), name="portal-order-sourcing-progress"),
    path("portal/orders/<uuid:order_id>/costs/", PortalOrderCostsView.as_view(), name="portal-order-costs"),
    path("portal/orders/<uuid:order_id>/ledger/", PortalOrderLedgerView.as_view(), name="portal-order-ledger"),
    path("portal/orders/<uuid:order_id>/packing-list/", PortalOrderPackingListView.as_view(), name="portal-order-packing-list"),
    path("portal/orders/<uuid:order_id>/invoices/", PortalOrderInvoicesView.as_view(), name="portal-order-invoices"),
    path("portal/orders/<uuid:order_id>/documents/", PortalOrderDocumentsView.as_view(), name="portal-order-documents"),
    path("", include(router.urls)),
]

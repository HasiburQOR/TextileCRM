from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.api_views import UserViewSet
from audit.api_views import AuditLogViewSet
from buyers.api_views import BuyerProfileViewSet, SisterProfileViewSet
from documents.api_views import DocumentVaultViewSet
from expenses.api_views import ExpenseViewSet, settlement_api
from invoicing.api_views import ExchangeRateViewSet, InvoiceViewSet
from notifications.api_views import NotificationViewSet
from packing.api_views import PackingListViewSet
from qc.api_views import QCReportViewSet
from sourcing.api_views import SourcingRequestViewSet
from trips.api_views import SourcingTripViewSet, TripLocationViewSet
from warehouse.api_views import WarehouseCostViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="api-users")
router.register("buyers", BuyerProfileViewSet, basename="api-buyers")
router.register("sister-profiles", SisterProfileViewSet, basename="api-sister-profiles")
router.register("requests", SourcingRequestViewSet, basename="api-requests")
router.register("sourcing-trips", SourcingTripViewSet, basename="api-sourcing-trips")
router.register("qc-reports", QCReportViewSet, basename="api-qc-reports")
router.register("warehouse-costs", WarehouseCostViewSet, basename="api-warehouse-costs")
router.register("packing-lists", PackingListViewSet, basename="api-packing-lists")
router.register("invoices", InvoiceViewSet, basename="api-invoices")
router.register("exchange-rates", ExchangeRateViewSet, basename="api-exchange-rates")
router.register("expenses", ExpenseViewSet, basename="api-expenses")
router.register("notifications", NotificationViewSet, basename="api-notifications")
router.register("documents", DocumentVaultViewSet, basename="api-documents")
router.register("audit-log", AuditLogViewSet, basename="api-audit-log")

trip_locations_list = TripLocationViewSet.as_view({"get": "list", "post": "create"})
trip_locations_detail = TripLocationViewSet.as_view({"get": "retrieve", "put": "update", "patch": "partial_update"})

urlpatterns = [
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("sourcing-trips/<uuid:trip_pk>/locations/", trip_locations_list, name="api-trip-locations-list"),
    path("sourcing-trips/<uuid:trip_pk>/locations/<uuid:pk>/", trip_locations_detail, name="api-trip-locations-detail"),
    path("settlement/<uuid:sister_profile_id>/", settlement_api, name="api-settlement"),
    path("", include(router.urls)),
]

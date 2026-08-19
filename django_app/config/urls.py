from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("i18n/", include("django.conf.urls.i18n")),
    path("accounts/", include("accounts.urls")),
    path("", include("dashboard.urls")),
    path("buyers/", include("buyers.urls")),
    path("sourcing/", include("sourcing.urls")),
    path("trips/", include("trips.urls")),
    path("qc/", include("qc.urls")),
    path("warehouse/", include("warehouse.urls")),
    path("packing/", include("packing.urls")),
    path("invoicing/", include("invoicing.urls")),
    path("expenses/", include("expenses.urls")),
    path("notifications/", include("notifications.urls")),
    path("documents/", include("documents.urls")),
    path("audit/", include("audit.urls")),
    path("portal/", include("buyers.portal_urls")),
    path("api/", include("config.api_urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

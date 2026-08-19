import re

from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("api.v1.urls")),
]

# Always served by Django — not django.conf.urls.static.static(), which
# silently no-ops whenever DEBUG=False regardless of any guard around it
# (it's Django's own safety default for exactly this helper). This stack
# has no separate static-file server or CDN in front of MEDIA_ROOT — nginx
# (see frontend-admin/nginx.conf) proxies /media/ straight to this
# container, so every uploaded image/document 404ed in production (DEBUG
# off) while working fine locally (dev settings set DEBUG=True).
urlpatterns += [
    re_path(
        r"^%s(?P<path>.*)$" % re.escape(settings.MEDIA_URL.lstrip("/")),
        serve,
        {"document_root": settings.MEDIA_ROOT},
    ),
]

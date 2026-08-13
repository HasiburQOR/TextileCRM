from django.urls import path

from buyers import portal

app_name = "portal"

urlpatterns = [
    path("logout/", portal.portal_logout, name="logout"),
    path("", portal.portal_dashboard, name="dashboard"),
]

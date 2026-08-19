from django.urls import path

from dashboard import views

app_name = "dashboard"

urlpatterns = [
    path("", views.index, name="index"),
    path("cost-reports/", views.cost_reports, name="cost_reports"),
]

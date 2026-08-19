from django.urls import path

from packing import views

app_name = "packing"

urlpatterns = [
    path("", views.packing_list_view, name="list"),
]

from django.urls import path

from warehouse import views

app_name = "warehouse"

urlpatterns = [
    path("", views.warehouse_list, name="list"),
]

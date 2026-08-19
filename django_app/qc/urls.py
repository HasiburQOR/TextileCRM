from django.urls import path

from qc import views

app_name = "qc"

urlpatterns = [
    path("", views.qc_list, name="list"),
]

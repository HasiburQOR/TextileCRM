from django.urls import path

from sourcing import views

app_name = "sourcing"

urlpatterns = [
    path("", views.request_list, name="list"),
    path("<uuid:pk>/", views.request_detail, name="detail"),
    path("<uuid:pk>/approve/", views.approve_request, name="approve"),
    path("<uuid:pk>/reject/", views.reject_request, name="reject"),
    path("approval/", views.approval_queue, name="approval"),
    path("catalog/", views.catalog, name="catalog"),
]

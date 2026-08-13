from django.urls import path

from invoicing import views

app_name = "invoicing"

urlpatterns = [
    path("", views.invoice_list, name="list"),
    path("<uuid:pk>/", views.invoice_detail, name="detail"),
    path("<uuid:pk>/approve/", views.approve, name="approve"),
    path("<uuid:pk>/reject/", views.reject, name="reject"),
    path("<uuid:pk>/void/", views.void, name="void"),
    path("<uuid:pk>/payments/", views.add_payment, name="add_payment"),
    path("exchange-rates/", views.exchange_rate_list, name="exchange_rates"),
]

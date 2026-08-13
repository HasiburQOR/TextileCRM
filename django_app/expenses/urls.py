from django.urls import path

from expenses import views

app_name = "expenses"

urlpatterns = [
    path("", views.expense_list, name="list"),
    path("settlement/", views.settlement_view, name="settlement"),
]

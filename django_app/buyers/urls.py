from django.urls import path

from buyers import views
from buyers.portal import portal_login

app_name = "buyers"

urlpatterns = [
    path("", views.buyer_list, name="list"),
    path("<uuid:pk>/delete/", views.buyer_delete, name="delete"),
    path("sister-profiles/", views.sister_list, name="sister_list"),
    path("sister-profiles/<uuid:pk>/", views.sister_detail, name="sister_detail"),
    path("sister-profiles/<uuid:pk>/edit/", views.sister_update, name="sister_update"),
    path("portal/login/", portal_login, name="portal_login"),
]

from django.urls import path

from trips import views

app_name = "trips"

urlpatterns = [
    path("", views.trip_list, name="list"),
    path("create/", views.create_trip, name="create"),
    path("<uuid:pk>/close/", views.close_trip, name="close"),
    path("<uuid:pk>/locations/<uuid:loc_pk>/report/", views.report_location, name="report_location"),
]

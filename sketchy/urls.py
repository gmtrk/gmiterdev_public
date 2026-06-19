from django.urls import path

from . import views

app_name = "sketchy"

urlpatterns = [
    path("", views.game, name="game"),
]

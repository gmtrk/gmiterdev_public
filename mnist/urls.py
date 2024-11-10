from django.urls import path
from . import views

app_name = 'mnist'

urlpatterns = [
    path('', views.index, name='index'),
]
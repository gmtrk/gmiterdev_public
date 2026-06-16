from django.urls import path
from . import views

app_name = 'ricochet'

urlpatterns = [
    path('', views.game, name='game'),
]

from django.urls import path
from . import views

app_name = 'mnist'

urlpatterns = [
    path('', views.game, name='game'),
    path('random-game/', views.get_random_game, name='random_game'),
]
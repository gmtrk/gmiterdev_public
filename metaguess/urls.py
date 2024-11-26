from django.urls import path
from . import views

app_name = 'mnist'

urlpatterns = [
    path('', views.game, name='game'),
    path('random-game/', views.get_random_game, name='random_game'),
    path('get-high-scores/', views.get_high_scores, name='get_high_scores'),
    path('add-high-score/', views.add_high_score, name='add_high_score'),
]
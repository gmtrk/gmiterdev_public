from django.shortcuts import render
from django.http import HttpResponse
import random
from django.http import JsonResponse
from .models import Games
from django.views.decorators.cache import never_cache

def game(request):
    return render(request, 'metaguess/game.html')

@never_cache
def get_random_game(request):
    # Get the total number of games
    game_count = Games.objects.count()

    if game_count == 0:
        return JsonResponse({"error": "No games found in the database"}, status=404)

    # Choose a random offset and retrieve a game
    random_index = random.randint(0, game_count - 1)
    game = Games.objects.all()[random_index]

    game_data = {
        "game_name": game.game_name,
        "platform": game.platform,
        "release_year": game.release_year,
        "score": float(game.score),
        "cover_url": game.cover_url or "/static/metaguess/img/nocover.png",
    }
    return JsonResponse(game_data)

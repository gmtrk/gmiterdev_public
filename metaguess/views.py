from django.shortcuts import render
from django.http import HttpResponse
import random
from django.http import JsonResponse
from .models import Games, HighScore
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
import json

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

@never_cache
def get_high_scores(request):
    high_scores = HighScore.objects.all()[:5]  # Get top 5 scores
    data = [{"initials": score.initials, "score": score.score} for score in high_scores]
    return JsonResponse(data, safe=False)

@csrf_exempt
def add_high_score(request):
    if request.method == "POST":
        data = json.loads(request.body)
        initials = data.get("initials", "").upper()[:3]
        score = data.get("score", 0)
        HighScore.objects.create(initials=initials, score=score)
        return JsonResponse({"message": "High score added successfully!"})
    return JsonResponse({"error": "Invalid request method"}, status=400)
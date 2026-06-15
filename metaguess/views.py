from django.shortcuts import render
import random
from django.http import JsonResponse
from .models import Games, HighScore
from django.views.decorators.cache import never_cache
import json

def game(request):
    return render(request, 'metaguess/game.html')

@never_cache
def get_random_game(request):
    game = Games.objects.order_by('?').first()
    if game is None:
        return JsonResponse({"error": "No games found in the database"}, status=404)

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

def add_high_score(request):
    if request.method != "POST":
        return JsonResponse({"error": "Invalid request method"}, status=400)
    try:
        data = json.loads(request.body)
    except (ValueError, TypeError):
        return JsonResponse({"error": "Invalid JSON body"}, status=400)
    initials = str(data.get("initials", "")).upper()[:3]
    if len(initials) != 3 or not initials.isalpha():
        return JsonResponse({"error": "Initials must be exactly 3 letters"}, status=400)
    try:
        score = int(data.get("score", 0))
    except (ValueError, TypeError):
        return JsonResponse({"error": "Invalid score"}, status=400)
    if not (0 <= score <= 1_000_000):
        return JsonResponse({"error": "Score out of range"}, status=400)
    HighScore.objects.create(initials=initials, score=score)
    return JsonResponse({"message": "High score added successfully!"})
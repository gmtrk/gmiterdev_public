import json
import re

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.cache import never_cache

from .models import SketchyScore

# Speed-points: max ~6 prompts * 20s = 120. Loose anti-garbage cap.
HARD_MAX = 100_000


def game(request):
    return render(request, "sketchy/game.html")


@never_cache
def get_high_scores(request):
    scores = SketchyScore.objects.all()[:10]
    data = [{"initials": s.initials, "points": s.points} for s in scores]
    return JsonResponse(data, safe=False)


def add_high_score(request):
    if request.method != "POST":
        return JsonResponse({"error": "Invalid request method"}, status=400)
    try:
        data = json.loads(request.body)
    except (ValueError, TypeError):
        return JsonResponse({"error": "Invalid JSON body"}, status=400)
    initials = str(data.get("initials", "")).upper()[:3]
    if not re.fullmatch(r"[A-Z]{3}", initials):
        return JsonResponse({"error": "Initials must be exactly 3 letters"}, status=400)
    try:
        points = int(data.get("points", 0))
    except (ValueError, TypeError):
        return JsonResponse({"error": "Invalid points"}, status=400)
    if not (0 <= points <= HARD_MAX):
        return JsonResponse({"error": "Points out of range"}, status=400)
    player_id = str(data.get("player_id", ""))
    if player_id:
        if not re.fullmatch(r"[A-Za-z0-9-]{1,64}", player_id):
            return JsonResponse({"error": "Invalid player_id"}, status=400)
        obj, created = SketchyScore.objects.get_or_create(
            player_id=player_id,
            defaults={"initials": initials, "points": points},
        )
        if not created and points > obj.points:
            obj.initials = initials
            obj.points = points
            obj.save(update_fields=["initials", "points"])
    else:
        SketchyScore.objects.create(initials=initials, points=points)
    return JsonResponse({"message": "High score added successfully!"})

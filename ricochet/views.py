import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.cache import never_cache

from .models import RicochetScore

# HARD_MAX is a loose anti-garbage filter sized against the *Cores* prestige
# formula (not credits), pinned <= 2**53 so client Number/JSON stay exact.
HARD_MAX = int(1e12)


def game(request):
    return render(request, 'ricochet/game.html')


@never_cache
def get_high_scores(request):
    high_scores = RicochetScore.objects.all()[:10]  # top 10, Meta.ordering = ['-cores','created_at']
    data = [{"initials": s.initials, "cores": s.cores} for s in high_scores]
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
        cores = int(data.get("cores", 0))
    except (ValueError, TypeError):
        return JsonResponse({"error": "Invalid cores"}, status=400)
    if not (0 <= cores <= HARD_MAX):
        return JsonResponse({"error": "Cores out of range"}, status=400)
    RicochetScore.objects.create(initials=initials, cores=cores)
    return JsonResponse({"message": "High score added successfully!"})

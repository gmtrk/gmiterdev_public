import json
import re

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
    # Strict ASCII A-Z only (matches the client regex /^[A-Z]{3}$/). str.isalpha()
    # accepts Unicode letters (e.g. "ÉÀÜ"), which we reject here.
    if not re.fullmatch(r"[A-Z]{3}", initials):
        return JsonResponse({"error": "Initials must be exactly 3 letters"}, status=400)
    try:
        cores = int(data.get("cores", 0))
    except (ValueError, TypeError):
        return JsonResponse({"error": "Invalid cores"}, status=400)
    if not (0 <= cores <= HARD_MAX):
        return JsonResponse({"error": "Cores out of range"}, status=400)
    player_id = str(data.get("player_id", ""))
    if player_id:
        if not re.fullmatch(r"[A-Za-z0-9-]{1,64}", player_id):
            return JsonResponse({"error": "Invalid player_id"}, status=400)
        # get_or_create (not update_or_create) so a stale/out-of-order/forged submit
        # carrying a LOWER cores value can never regress a player's recorded high
        # score — only a strictly higher value updates the row. The partial unique
        # constraint on player_id (see models.RicochetScore.Meta) makes the
        # get_or_create create-path race-safe: a concurrent double-submit hits an
        # IntegrityError that get_or_create catches and resolves to the existing row,
        # instead of leaving two rows that later 500 on MultipleObjectsReturned.
        obj, created = RicochetScore.objects.get_or_create(
            player_id=player_id,
            defaults={"initials": initials, "cores": cores},
        )
        if not created and cores > obj.cores:
            obj.initials = initials
            obj.cores = cores
            obj.save(update_fields=["initials", "cores"])
    else:
        RicochetScore.objects.create(initials=initials, cores=cores)
    return JsonResponse({"message": "High score added successfully!"})

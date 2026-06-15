import json
import os
import time
from pathlib import Path

import requests
from django.core.management.base import BaseCommand, CommandError

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "games.json"
RAWG_URL = "https://api.rawg.io/api/games"


def to_record(result):
    """Map a RAWG game result to a fixture record, or None if it has no Metascore."""
    score = result.get("metacritic")
    if score is None:
        return None
    released = result.get("released") or ""
    year = int(released[:4]) if len(released) >= 4 and released[:4].isdigit() else None
    platforms = [
        p["platform"]["name"]
        for p in (result.get("platforms") or [])
        if p.get("platform")
    ]
    return {
        "external_id": result["id"],
        "game_name": result.get("name"),
        "platform": ", ".join(platforms) or None,
        "release_year": year,
        "score": score,
        "cover_url": result.get("background_image"),
    }


class Command(BaseCommand):
    help = "Build metaguess/fixtures/games.json from the RAWG API (dev-only; needs RAWG_API_KEY)."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=1000, help="How many games to fetch.")

    def handle(self, *args, **options):
        key = os.getenv("RAWG_API_KEY")
        if not key:
            raise CommandError("RAWG_API_KEY is not set (add it to .env).")

        limit = options["limit"]
        records = {}
        page = 1
        while len(records) < limit:
            resp = requests.get(
                RAWG_URL,
                params={
                    "key": key,
                    "ordering": "-added",        # most-added == most recognizable
                    "metacritic": "1,100",       # only games with a positive Metascore
                    "page": page,
                    "page_size": 40,             # RAWG max
                },
                timeout=30,
            )
            if resp.status_code != 200:
                raise CommandError(f"RAWG request failed: {resp.status_code} {resp.text[:200]}")
            results = resp.json().get("results", [])
            if not results:
                break
            for r in results:
                rec = to_record(r)
                if rec:
                    records[rec["external_id"]] = rec
            self.stdout.write(f"page {page}: {len(records)} games collected")
            page += 1
            time.sleep(0.3)  # be polite to the API

        out = sorted(records.values(), key=lambda r: r["external_id"])[:limit]
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
        self.stdout.write(self.style.SUCCESS(f"Wrote {len(out)} games to {FIXTURE}"))

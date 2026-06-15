"""Smoke tests for the metaguess app.

All endpoints are tested against a clean test database; tests that need
game rows create them inline via the ORM.
"""

import json

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from .models import Games

pytestmark = pytest.mark.django_db


def test_metaguess_page_loads(client):
    resp = client.get("/metaguess/")
    assert resp.status_code == 200


def test_high_scores_endpoint_returns_empty_json(client):
    resp = client.get("/metaguess/get-high-scores/")
    assert resp.status_code == 200
    assert resp.json() == []  # empty leaderboard on a fresh DB


def test_random_game_returns_404_when_no_games(client):
    resp = client.get("/metaguess/random-game/")
    assert resp.status_code == 404


def test_random_game_endpoint(client):
    Games.objects.create(external_id=1, game_name="A", platform="PC", release_year=2020, score=90)
    resp = client.get("/metaguess/random-game/")
    assert resp.status_code == 200
    assert resp.json()["game_name"] == "A"


def test_deck_returns_games(client):
    Games.objects.create(external_id=1, game_name="A", platform="PC", release_year=2020, score=90)
    Games.objects.create(external_id=2, game_name="B", platform="PC", release_year=2019, score=80)
    resp = client.get("/metaguess/deck/")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert {"game_name", "platform", "release_year", "score", "cover_url"} <= set(data[0].keys())
    assert isinstance(data[0]["score"], float)


def test_deck_empty_when_no_games(client):
    resp = client.get("/metaguess/deck/")
    assert resp.status_code == 200
    assert resp.json() == []


def test_games_model_is_usable():
    """The games table exists on a fresh DB and rows round-trip (landmine #2 fixed)."""
    Games.objects.create(
        external_id=1, game_name="Tetris", platform="Game Boy",
        release_year=1989, score=92, cover_url="http://img/tetris.jpg",
    )
    assert Games.objects.count() == 1
    assert Games.objects.get(external_id=1).game_name == "Tetris"


def test_seed_games_is_idempotent(tmp_path):
    fixture = tmp_path / "games.json"
    fixture.write_text(json.dumps([
        {"external_id": 1, "game_name": "A", "platform": "PC", "release_year": 2020, "score": 90, "cover_url": "http://x/a.jpg"},
        {"external_id": 2, "game_name": "B", "platform": "PC", "release_year": 2019, "score": 80, "cover_url": None},
    ]))
    call_command("seed_games", path=str(fixture))
    assert Games.objects.count() == 2
    call_command("seed_games", path=str(fixture))  # run again: no duplicates
    assert Games.objects.count() == 2
    assert Games.objects.get(external_id=1).game_name == "A"


def test_seed_games_missing_file_is_noop(tmp_path):
    call_command("seed_games", path=str(tmp_path / "nope.json"))
    assert Games.objects.count() == 0


def test_seed_games_rejects_malformed_json(tmp_path):
    bad = tmp_path / "games.json"
    bad.write_text("{not valid json")
    with pytest.raises(CommandError):
        call_command("seed_games", path=str(bad))

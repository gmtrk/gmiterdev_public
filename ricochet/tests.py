"""Smoke tests for the ricochet app."""

import json

import pytest

from .models import RicochetScore

pytestmark = pytest.mark.django_db


def test_ricochet_config_name():
    from ricochet.apps import RicochetConfig

    assert RicochetConfig.name == "ricochet"


def test_ricochet_score_round_trips():
    from ricochet.models import RicochetScore

    RicochetScore.objects.create(initials="ABC", cores=1234567890123)
    row = RicochetScore.objects.get(initials="ABC")
    assert row.cores == 1234567890123
    assert row.created_at is not None


def test_ricochet_score_ordering_is_cores_desc():
    from ricochet.models import RicochetScore

    RicochetScore.objects.create(initials="LOW", cores=10)
    RicochetScore.objects.create(initials="TOP", cores=500)
    RicochetScore.objects.create(initials="MID", cores=100)
    ordered = list(RicochetScore.objects.all().values_list("initials", flat=True))
    assert ordered == ["TOP", "MID", "LOW"]


def test_ricochet_page_loads(client):
    resp = client.get("/ricochet/")
    assert resp.status_code == 200


def test_ricochet_page_contains_canvas(client):
    resp = client.get("/ricochet/")
    assert resp.status_code == 200
    html = resp.content.decode()
    assert 'id="ricochet-canvas"' in html
    assert '<canvas' in html


def test_ricochet_page_loads_main_module(client):
    resp = client.get("/ricochet/")
    html = resp.content.decode()
    assert 'type="module"' in html
    assert 'ricochet/js/main.js' in html


def test_ricochet_page_has_csrf_token(client):
    resp = client.get("/ricochet/")
    html = resp.content.decode()
    assert 'name="csrfmiddlewaretoken"' in html


def test_ricochet_page_has_home_logo_link(client):
    resp = client.get("/ricochet/")
    html = resp.content.decode()
    assert 'href="/"' in html


def test_high_scores_endpoint_returns_empty_json(client):
    resp = client.get("/ricochet/get-high-scores/")
    assert resp.status_code == 200
    assert resp.json() == []  # empty leaderboard on a fresh DB


def test_high_scores_returns_top_ten_ordered_by_cores_desc(client):
    # 12 rows; endpoint must return the top 10 ordered by -cores.
    for i in range(12):
        RicochetScore.objects.create(initials="AAA", cores=i)
    resp = client.get("/ricochet/get-high-scores/")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 10
    cores_list = [row["cores"] for row in data]
    assert cores_list == sorted(cores_list, reverse=True)
    assert cores_list[0] == 11  # highest
    assert cores_list[-1] == 2  # 10th highest of 0..11
    assert set(data[0].keys()) == {"initials", "cores"}


def test_high_scores_ties_broken_by_created_at(client):
    first = RicochetScore.objects.create(initials="AAA", cores=100)
    second = RicochetScore.objects.create(initials="BBB", cores=100)
    resp = client.get("/ricochet/get-high-scores/")
    data = resp.json()
    # Meta.ordering = ['-cores', 'created_at'] -> earlier row first on a tie.
    assert data[0]["initials"] == "AAA"
    assert data[1]["initials"] == "BBB"
    assert first.created_at <= second.created_at


def test_add_high_score_valid_creates_row(client):
    resp = client.post(
        "/ricochet/add-high-score/",
        data=json.dumps({"initials": "abc", "cores": 412}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    assert RicochetScore.objects.count() == 1
    row = RicochetScore.objects.get()
    assert row.initials == "ABC"  # uppercased server-side
    assert row.cores == 412


def test_add_high_score_accepts_zero_cores(client):
    resp = client.post(
        "/ricochet/add-high-score/",
        data=json.dumps({"initials": "XYZ", "cores": 0}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    assert RicochetScore.objects.get().cores == 0


def test_add_high_score_accepts_hard_max(client):
    resp = client.post(
        "/ricochet/add-high-score/",
        data=json.dumps({"initials": "ZZZ", "cores": 1_000_000_000_000}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    assert RicochetScore.objects.get().cores == 1_000_000_000_000


def test_add_high_score_rejects_get(client):
    resp = client.get("/ricochet/add-high-score/")
    assert resp.status_code == 400
    assert RicochetScore.objects.count() == 0


def test_add_high_score_rejects_bad_initials_length(client):
    resp = client.post(
        "/ricochet/add-high-score/",
        data=json.dumps({"initials": "AB", "cores": 10}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert RicochetScore.objects.count() == 0


def test_add_high_score_rejects_non_alpha_initials(client):
    resp = client.post(
        "/ricochet/add-high-score/",
        data=json.dumps({"initials": "A1B", "cores": 10}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert RicochetScore.objects.count() == 0


def test_add_high_score_rejects_unicode_letter_initials(client):
    # str.isalpha() would accept these accented letters; the strict ASCII regex
    # (matching the client /^[A-Z]{3}$/) must reject them.
    resp = client.post(
        "/ricochet/add-high-score/",
        data=json.dumps({"initials": "ÉÀÜ", "cores": 10}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert RicochetScore.objects.count() == 0


def test_add_high_score_rejects_non_integer_cores(client):
    resp = client.post(
        "/ricochet/add-high-score/",
        data=json.dumps({"initials": "ABC", "cores": "lots"}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert RicochetScore.objects.count() == 0


def test_add_high_score_rejects_negative_cores(client):
    resp = client.post(
        "/ricochet/add-high-score/",
        data=json.dumps({"initials": "ABC", "cores": -1}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert RicochetScore.objects.count() == 0


def test_add_high_score_rejects_cores_over_hard_max(client):
    resp = client.post(
        "/ricochet/add-high-score/",
        data=json.dumps({"initials": "ABC", "cores": 1_000_000_000_001}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert RicochetScore.objects.count() == 0


def test_add_high_score_rejects_malformed_json(client):
    resp = client.post(
        "/ricochet/add-high-score/",
        data="{not valid json",
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert RicochetScore.objects.count() == 0


def test_hard_max_is_within_safe_integer_range():
    from .views import HARD_MAX

    assert HARD_MAX == int(1e12)
    assert HARD_MAX <= 2 ** 53

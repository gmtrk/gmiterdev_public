import json

import pytest
from django.urls import reverse

from sketchy.models import SketchyScore

pytestmark = pytest.mark.django_db


def test_game_page_renders(client):
    resp = client.get(reverse("sketchy:game"))
    assert resp.status_code == 200
    assert b"Sketchy" in resp.content


def test_get_high_scores_sorted(client):
    SketchyScore.objects.create(initials="LOW", points=5, player_id="x")
    SketchyScore.objects.create(initials="HIH", points=99, player_id="y")
    resp = client.get(reverse("sketchy:get_high_scores"))
    data = resp.json()
    assert [d["points"] for d in data] == [99, 5]
    assert data[0]["initials"] == "HIH"


def test_add_high_score_upsert_only_raises(client):
    url = reverse("sketchy:add_high_score")
    body = {"initials": "ABC", "points": 30, "player_id": "pid-1"}
    client.post(url, data=json.dumps(body), content_type="application/json")
    # lower resubmit must NOT regress
    client.post(url, data=json.dumps({**body, "points": 10}),
                content_type="application/json")
    # higher resubmit DOES update
    client.post(url, data=json.dumps({**body, "points": 77}),
                content_type="application/json")
    rows = SketchyScore.objects.filter(player_id="pid-1")
    assert rows.count() == 1
    assert rows.first().points == 77


def test_add_high_score_rejects_bad_initials(client):
    resp = client.post(reverse("sketchy:add_high_score"),
                       data=json.dumps({"initials": "a1", "points": 5, "player_id": "z"}),
                       content_type="application/json")
    assert resp.status_code == 400


def test_add_high_score_rejects_bad_player_id(client):
    resp = client.post(reverse("sketchy:add_high_score"),
                       data=json.dumps({"initials": "ABC", "points": 5, "player_id": "bad id!"}),
                       content_type="application/json")
    assert resp.status_code == 400

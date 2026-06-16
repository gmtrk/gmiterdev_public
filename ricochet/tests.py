"""Smoke tests for the ricochet app."""

import pytest

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

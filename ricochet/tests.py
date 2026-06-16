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

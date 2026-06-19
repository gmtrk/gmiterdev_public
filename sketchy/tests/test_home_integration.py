import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db


def test_sketchy_visit_is_tracked(client):
    from mnist.models import AppVisit
    client.get("/sketchy/")
    assert AppVisit.objects.filter(app_name="sketchy").exists()


def test_home_exposes_sketchy_tile(client):
    resp = client.get(reverse("main"))
    assert resp.status_code == 200
    assert b"/sketchy" in resp.content
    assert b"sketchy_visits" not in resp.content  # the var was rendered, not literal

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db


def test_game_page_renders(client):
    resp = client.get(reverse("sketchy:game"))
    assert resp.status_code == 200
    assert b"Sketchy" in resp.content

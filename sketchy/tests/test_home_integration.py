import pytest

pytestmark = pytest.mark.django_db


def test_sketchy_visit_is_tracked(client):
    from mnist.models import AppVisit
    client.get("/sketchy/")
    assert AppVisit.objects.filter(app_name="sketchy").exists()

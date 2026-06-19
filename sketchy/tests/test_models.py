import pytest
from django.db import IntegrityError

from sketchy.models import SketchyScore

pytestmark = pytest.mark.django_db


def test_ordering_is_points_desc():
    SketchyScore.objects.create(initials="AAA", points=10, player_id="a")
    SketchyScore.objects.create(initials="BBB", points=50, player_id="b")
    assert [s.points for s in SketchyScore.objects.all()] == [50, 10]


def test_nonblank_player_id_is_unique():
    SketchyScore.objects.create(initials="AAA", points=10, player_id="dup")
    with pytest.raises(IntegrityError):
        SketchyScore.objects.create(initials="BBB", points=20, player_id="dup")


def test_blank_player_id_allows_multiple():
    SketchyScore.objects.create(initials="AAA", points=10, player_id="")
    SketchyScore.objects.create(initials="BBB", points=20, player_id="")  # no raise
    assert SketchyScore.objects.filter(player_id="").count() == 2

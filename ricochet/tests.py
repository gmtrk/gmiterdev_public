"""Smoke tests for the ricochet app."""

import pytest

pytestmark = pytest.mark.django_db


def test_ricochet_config_name():
    from ricochet.apps import RicochetConfig

    assert RicochetConfig.name == "ricochet"

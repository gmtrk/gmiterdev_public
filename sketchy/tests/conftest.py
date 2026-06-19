"""Override the root conftest's Django-only autouse fixture.

The root conftest.py defines ``_plain_static_storage(settings)`` which requires
pytest-django (and therefore Django). That venv (.venv) is separate from the
training venv (.venv-train, which has Pillow/numpy/TF but not Django).

This local override replaces the autouse fixture with a no-op so the rasterizer
geometry tests run cleanly under .venv-train without needing Django at all.
"""
import pytest


@pytest.fixture(autouse=True)
def _plain_static_storage():  # noqa: PT004 — intentional no-op override
    """No-op override: rasterizer tests don't use Django static storage."""

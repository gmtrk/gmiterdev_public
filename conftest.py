"""Pytest fixtures shared across the suite."""

import pytest


@pytest.fixture(autouse=True)
def _plain_static_storage(request):
    """Use non-manifest static storage + disable SSL redirect for Django tests.

    settings.py selects WhiteNoise's CompressedManifestStaticFilesStorage whenever DEBUG is
    falsy. That backend requires a collectstatic manifest and raises on any ``{% static %}`` tag
    whose file isn't in it, which would break template-rendering tests in environments without a
    built manifest (e.g. CI). Swap in the plain backend so ``{% static %}`` just builds URLs.

    Tests run with DEBUG=False, which activates SECURE_SSL_REDIRECT in settings.py. That would
    make the test client receive 301 redirects instead of 200s, so disable it for the suite.

    Resilient to environments without pytest-django/Django (e.g. the .venv-train
    training venv that runs the rasterizer tests): no-op when the ``settings``
    fixture isn't available, so non-Django tests collect and run cleanly.
    """
    try:
        settings = request.getfixturevalue("settings")
    except pytest.FixtureLookupError:
        return  # no pytest-django (training env) -> nothing to configure
    settings.STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
    settings.SECURE_SSL_REDIRECT = False

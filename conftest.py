"""Pytest fixtures shared across the suite."""

import pytest


@pytest.fixture(autouse=True)
def _plain_static_storage(settings):
    """Use non-manifest static storage during tests.

    settings.py selects WhiteNoise's CompressedManifestStaticFilesStorage whenever DEBUG is
    falsy. That backend requires a collectstatic manifest and raises on any ``{% static %}`` tag
    whose file isn't in it, which would break template-rendering tests in environments without a
    built manifest (e.g. CI). Swap in the plain backend so ``{% static %}`` just builds URLs.
    """
    settings.STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }

    # Tests run with DEBUG=False, which activates SECURE_SSL_REDIRECT in settings.py. That would
    # make the test client receive 301 redirects instead of 200s, so disable it for the suite.
    settings.SECURE_SSL_REDIRECT = False

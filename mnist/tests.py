"""Smoke tests for the mnist app and site-wide pages.

These assert the rendered pages return 200 and contain expected markers, giving agents a fast
"did I break a page?" signal. See CLAUDE.md for what does/doesn't work without a populated DB.
"""

from pathlib import Path

import pytest

pytestmark = pytest.mark.django_db


def test_home_page_loads(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"My Apps" in resp.content


def test_mnist_page_loads(client):
    resp = client.get("/mnist/")
    assert resp.status_code == 200
    assert b"MNIST" in resp.content


def test_mnist_model_artifacts_present():
    """The browser loads these via TensorFlow.js; missing files = broken playground."""
    model_dir = Path(__file__).resolve().parent / "static" / "mnist" / "model"
    assert (model_dir / "model.json").exists()
    assert (model_dir / "group1-shard1of2.bin").exists()
    assert (model_dir / "group1-shard2of2.bin").exists()

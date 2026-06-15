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
    assert any(model_dir.glob("*.bin")), "expected at least one .bin shard in model dir"


def test_mnist_page_has_layer_pipeline(client):
    """The redesigned playground renders the live layer-visualization pipeline."""
    resp = client.get("/mnist/")
    assert resp.status_code == 200
    body = resp.content
    assert b'id="nn-pipeline"' in body          # the dark viewport container
    assert b'id="b1grid"' in body                # block 1 feature-map canvas
    assert b'id="b2grid"' in body                # block 2 feature-map canvas
    assert b'id="densefield"' in body            # dense activation canvas
    assert b'id="predictions"' in body           # prediction bars container
    assert b'data-pred="0"' in body              # first prediction row
    assert b'block 1' in body                    # teaching label
    assert b'high activation' in body            # legend
    assert b'type="module"' in body              # ES-module entrypoint


def test_slim_model_artifact():
    """The served model is the slim, named-tap model and stays under the size budget."""
    model_dir = Path(__file__).resolve().parent / "static" / "mnist" / "model"
    text = (model_dir / "model.json").read_text()
    for name in ("block1", "block2", "dense_reason"):
        assert name in text, f"expected tapped layer '{name}' in model.json"
    total = sum(p.stat().st_size for p in model_dir.glob("*.bin"))
    assert total < 500 * 1024, f"model weights {total} bytes exceed the 500KB slim budget"

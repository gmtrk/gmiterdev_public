"""Smoke tests for the mnist app and site-wide pages.

These assert the rendered pages return 200 and contain expected markers, giving agents a fast
"did I break a page?" signal. See CLAUDE.md for what does/doesn't work without a populated DB.
"""

import json
import re
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


def test_browser_tfjs_can_load_model_format():
    """The browser's tf.js runtime must be >= the converter that produced model.json.

    The model is exported in Keras 3 layers-format; a tf.js runtime older than the
    converter cannot deserialize it (batch_shape / DTypePolicy), which surfaces in the
    browser as 'The model failed to load'. This guards that the CDN version stays in sync.
    """
    base = Path(__file__).resolve().parent
    model = json.loads((base / "static" / "mnist" / "model" / "model.json").read_text())
    cm = re.search(r"(\d+)\.(\d+)\.(\d+)", model.get("convertedBy", ""))
    assert cm, f"could not parse converter version from {model.get('convertedBy')!r}"
    converter = tuple(int(x) for x in cm.groups())

    template = (base / "templates" / "mnist" / "index.html").read_text()
    tm = re.search(r"@tensorflow/tfjs@(\d+)\.(\d+)\.(\d+)", template)
    assert tm, "could not find the tf.js CDN version in index.html"
    browser = tuple(int(x) for x in tm.groups())

    assert browser >= converter, (
        f"browser tf.js {browser} is older than the converter {converter} that built "
        f"model.json; loadLayersModel will reject the newer (Keras 3) topology"
    )

"""Smoke tests for the mnist app and site-wide pages.

These assert the rendered pages return 200 and contain expected markers, giving agents a fast
"did I break a page?" signal. See CLAUDE.md for what does/doesn't work without a populated DB.
"""

from pathlib import Path

import pytest

from .models import AppVisit

pytestmark = pytest.mark.django_db


def test_visiting_ricochet_increments_its_counter(client):
    client.get("/ricochet/")
    visit = AppVisit.objects.get(app_name="ricochet")
    assert visit.visit_count == 1
    client.get("/ricochet/")
    visit.refresh_from_db()
    assert visit.visit_count == 2


def test_home_page_renders_ricochet_visits(client):
    AppVisit.objects.create(app_name="ricochet", visit_count=7)
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"visits 7" in resp.content


def test_home_page_loads(client):
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.content
    assert b'id="ud-lines"' in body                 # dialogue box typewriter target
    assert b"MNIST PLAYGROUND" in body              # battle-menu label
    assert b"METAGUESS" in body                     # battle-menu label
    assert b'href="/mnist"' in body                 # link to demo 1
    assert b'href="/metaguess"' in body             # link to demo 2
    assert b"visits" in body                        # visit-counter wiring


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


def test_model_json_is_tfjs_loadable_format():
    """model.json must be Keras-2 layers-format so the browser's tf.js can load it.

    Keras 3 (TF 2.16+) serializes InputLayer as `batch_shape` plus DTypePolicy dtype
    objects, which tfjs-layers cannot deserialize ("InputLayer should be passed
    batchInputShape") — the browser then shows 'The model failed to load'. The trainer
    sets TF_USE_LEGACY_KERAS=1 to emit Keras 2. This guards against regressing to Keras 3.
    """
    model_dir = Path(__file__).resolve().parent / "static" / "mnist" / "model"
    text = (model_dir / "model.json").read_text()
    assert "batch_input_shape" in text, "model.json is not Keras-2 format (no batch_input_shape)"
    assert '"batch_shape"' not in text, "model.json uses Keras-3 `batch_shape` (not tfjs-loadable)"
    assert "DTypePolicy" not in text, "model.json uses Keras-3 DTypePolicy dtype (not tfjs-loadable)"


def test_mnist_page_has_draw_hint(client):
    """The canvas shows a 'draw a digit' hint prompting first-time visitors."""
    resp = client.get("/mnist/")
    assert resp.status_code == 200
    body = resp.content
    assert b'id="draw-hint"' in body
    assert b"draw a digit" in body


def test_chrome_has_pixel_logo_and_save_footer(client):
    """Shared header/footer carry the Undertale pixel logo + save-point email."""
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.content
    assert b'class="ud-logo"' in body          # pixel logo in the header
    assert b'class="ud-soul"' in body           # the SOUL-heart dot
    assert b"gmtrkk@gmail.com" in body          # save-point footer email
    # MNIST inherits the default footer
    mnist = client.get("/mnist/")
    assert b"gmtrkk@gmail.com" in mnist.content

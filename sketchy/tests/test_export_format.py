import json
import os

MODEL_DIR = os.path.join(
    os.path.dirname(__file__), "..", "static", "sketchy", "model"
)


def _model_json():
    with open(os.path.join(MODEL_DIR, "model.json")) as f:
        return json.load(f)


def test_is_layers_model():
    assert _model_json()["format"] == "layers-model"


def test_input_layer_is_keras2_loadable():
    """tfjs-layers needs batch_input_shape (Keras 2), NOT batch_shape (Keras 3)."""
    mj = _model_json()
    layers = mj["modelTopology"]["model_config"]["config"]["layers"]
    first = layers[0]["config"]
    assert "batch_input_shape" in first or any(
        "batch_input_shape" in lyr["config"] for lyr in layers
    ), "no batch_input_shape -> Keras 3 export tfjs cannot load"
    assert not any("batch_shape" in lyr["config"] for lyr in layers), \
        "found batch_shape -> Keras 3 export; set TF_USE_LEGACY_KERAS=1 and re-export"


def test_labels_align_with_categories():
    from sketchy.categories import CATEGORIES
    with open(os.path.join(MODEL_DIR, "labels.json")) as f:
        labels = json.load(f)
    assert labels == CATEGORIES

import os

os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")  # set BEFORE tensorflow is imported

import pytest  # noqa: E402

pytest.importorskip("tensorflow")  # train-only dep: skip under the prod/dev .venv

from sketchy.sketchy_model import build_model  # noqa: E402


def test_input_and_output_shapes():
    m = build_model(120)
    assert tuple(m.input_shape) == (None, 64, 64, 1)
    assert tuple(m.output_shape) == (None, 120)


def test_output_layer_is_named():
    m = build_model(120)
    assert {layer.name for layer in m.layers} >= {"output"}


def test_param_count_is_slim():
    # client-side download budget; comfortably small.
    assert m_params(build_model(120)) < 3_000_000


def m_params(model):
    return model.count_params()

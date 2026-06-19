import pytest

pytest.importorskip("numpy")  # train-only deps: skip under the prod/dev .venv
pytest.importorskip("PIL")

import numpy as np  # noqa: E402

from sketchy.rasterizer import (  # noqa: E402
    SIZE, RENDER, RENDER_MARGIN, bbox, transform_params, strokes_to_input,
)

# A single horizontal line from (0,0) to (10,0).
LINE = [[[0.0, 10.0], [0.0, 0.0]]]


def test_bbox_basic():
    assert bbox(LINE) == (0.0, 0.0, 10.0, 0.0)


def test_bbox_empty_raises():
    with pytest.raises(ValueError):
        bbox([])


def test_transform_scales_to_inner_box_preserving_aspect():
    scale, offx, offy = transform_params(LINE)
    inner = RENDER - 2 * RENDER_MARGIN  # 224
    # width 10 is the long side -> scale fills the inner box
    assert scale == pytest.approx(inner / 10.0)
    # centered horizontally: left edge at margin
    assert (0.0 * scale + offx) == pytest.approx(RENDER_MARGIN)
    # zero-height line is centered vertically
    assert (0.0 * scale + offy) == pytest.approx(RENDER / 2)


def test_output_shape_and_range():
    out = strokes_to_input(LINE)
    assert out.shape == (SIZE, SIZE)
    assert out.dtype == np.float32
    assert 0.0 <= out.min() and out.max() <= 1.0
    assert out.max() > 0.5  # the line drew SOMETHING bright


def test_blank_returns_zeros():
    assert strokes_to_input([]).shape == (SIZE, SIZE)
    assert float(strokes_to_input([]).max()) == 0.0

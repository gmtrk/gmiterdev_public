import json
import os

import pytest

pytest.importorskip("numpy")  # train-only deps: skip under the prod/dev .venv
pytest.importorskip("PIL")

import numpy as np  # noqa: E402

from sketchy.rasterizer import strokes_to_input, SIZE  # noqa: E402

GOLDEN = os.path.join(
    os.path.dirname(__file__), "..", "static", "sketchy", "js", "rasterizer_golden.json"
)


def test_python_matches_golden():
    with open(GOLDEN) as f:
        data = json.load(f)
    assert data["size"] == SIZE
    for case in data["cases"]:
        out = strokes_to_input(case["strokes"]).flatten()
        exp = np.array(case["expected"], dtype=np.float32)
        # mean abs error is the parity metric used for JS too.
        mae = float(np.mean(np.abs(out - exp)))
        assert mae < 1e-3, f"{case['name']} mae={mae}"

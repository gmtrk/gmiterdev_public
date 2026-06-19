"""Strokes -> 64x64 grayscale model input. The SAME algorithm runs in JS
(static/sketchy/js/rasterizer.js); the two are pinned by rasterizer_golden.json.

Strokes are Quick Draw simplified format: a list of strokes, each stroke a
[xs, ys] pair of equal-length coordinate lists.
"""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

SIZE = 64            # model input edge
RENDER = 256         # supersample edge (4x); draw big, then box-downsample
RENDER_MARGIN = 16   # padding inside RENDER (in RENDER px)
LINE_WIDTH = 6       # stroke width in RENDER px


def _all_points(strokes):
    for xs, ys in strokes:
        for i in range(len(xs)):
            yield xs[i], ys[i]


def bbox(strokes):
    pts = list(_all_points(strokes))
    if not pts:
        raise ValueError("no points")
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def transform_params(strokes):
    minx, miny, maxx, maxy = bbox(strokes)
    w = max(maxx - minx, 1e-6)
    h = max(maxy - miny, 1e-6)
    inner = RENDER - 2 * RENDER_MARGIN
    scale = inner / max(w, h)
    drawn_w = (maxx - minx) * scale
    drawn_h = (maxy - miny) * scale
    offx = (RENDER - drawn_w) / 2.0 - minx * scale
    offy = (RENDER - drawn_h) / 2.0 - miny * scale
    return scale, offx, offy


def strokes_to_input(strokes):
    if not list(_all_points(strokes)):
        return np.zeros((SIZE, SIZE), dtype=np.float32)
    scale, offx, offy = transform_params(strokes)
    img = Image.new("L", (RENDER, RENDER), 0)
    draw = ImageDraw.Draw(img)
    r = LINE_WIDTH / 2.0
    for xs, ys in strokes:
        pts = [(xs[i] * scale + offx, ys[i] * scale + offy) for i in range(len(xs))]
        if len(pts) == 1:
            x, y = pts[0]
            draw.ellipse([x - r, y - r, x + r, y + r], fill=255)
            continue
        draw.line(pts, fill=255, width=LINE_WIDTH, joint="curve")
        # round caps: draw end dots so caps match the JS canvas lineCap="round"
        for x, y in (pts[0], pts[-1]):
            draw.ellipse([x - r, y - r, x + r, y + r], fill=255)
    small = img.resize((SIZE, SIZE), Image.BOX)
    return (np.asarray(small, dtype=np.float32) / 255.0)

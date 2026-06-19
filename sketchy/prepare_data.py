"""Download Quick Draw simplified strokes, subsample, and render to 64x64 shards.

Run in the train env:
    .venv-train/bin/python -m sketchy.prepare_data --per-class 6000

Each category -> sketchy/data/rendered/<idx>.npz with x:uint8[n,64,64], y:int.
Streams the .ndjson so we never hold a full multi-hundred-MB file in memory.
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
import requests

from sketchy.categories import CATEGORIES
from sketchy.rasterizer import strokes_to_input, SIZE

BASE = "https://storage.googleapis.com/quickdraw_dataset/full/simplified/{}.ndjson"
OUT_DIR = os.path.join(os.path.dirname(__file__), "data", "rendered")


def render_category(name: str, idx: int, per_class: int):
    url = BASE.format(name.replace(" ", "%20"))
    imgs = []
    with requests.get(url, stream=True, timeout=120) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if not line:
                continue
            rec = json.loads(line)
            if not rec.get("recognized", True):
                continue
            # rec["drawing"] = list of [xs, ys] strokes
            arr = strokes_to_input(rec["drawing"])
            imgs.append((arr * 255).astype(np.uint8))
            if len(imgs) >= per_class:
                break
    x = np.stack(imgs) if imgs else np.zeros((0, SIZE, SIZE), np.uint8)
    np.savez_compressed(os.path.join(OUT_DIR, f"{idx}.npz"), x=x, y=idx)
    print(f"[{idx:3d}] {name:16s} {len(imgs)} imgs")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=6000)
    args = ap.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    for idx, name in enumerate(CATEGORIES):
        out = os.path.join(OUT_DIR, f"{idx}.npz")
        if os.path.exists(out):
            print(f"[{idx:3d}] {name:16s} cached")
            continue
        render_category(name, idx, args.per_class)


if __name__ == "__main__":
    main()

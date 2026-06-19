"""Train Sketchy + export a tf.js LayersModel. Run in the train env:
    .venv-train/bin/python -m sketchy.train_sketchy

Keras-2 export gotcha: TF_USE_LEGACY_KERAS must be set before importing TF so
tfjs-layers can load the result (Keras 3 serializes InputLayer in a form
tfjs-layers rejects). Mirrors mnist/train_mnist.py.
"""
import json
import os

os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")  # MUST precede the TF import

import numpy as np  # noqa: E402
import tensorflow as tf  # noqa: E402
import tensorflowjs as tfjs  # noqa: E402

from sketchy.categories import CATEGORIES  # noqa: E402
from sketchy.sketchy_model import build_model  # noqa: E402

DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "rendered")
EXPORT_DIR = os.path.join(os.path.dirname(__file__), "static", "sketchy", "model")
TOP1_FLOOR = 0.55  # informational gate: refuse to export obvious garbage only.
EPOCHS = 18
BATCH = 256


def load_data():
    xs, ys = [], []
    for idx in range(len(CATEGORIES)):
        d = np.load(os.path.join(DATA_DIR, f"{idx}.npz"))
        xs.append(d["x"])
        ys.append(np.full(len(d["x"]), int(d["y"]), dtype=np.int64))
    x = np.concatenate(xs).astype(np.float32) / 255.0
    y = np.concatenate(ys)
    x = x[..., None]  # (N,64,64,1)
    rng = np.random.default_rng(0)
    perm = rng.permutation(len(x))
    x, y = x[perm], y[perm]
    n_test = int(len(x) * 0.1)
    return (x[n_test:], y[n_test:]), (x[:n_test], y[:n_test])


def main():
    (xtr, ytr), (xte, yte) = load_data()
    print(f"train {len(xtr)}  test {len(xte)}  classes {len(CATEGORIES)}")
    model = build_model(len(CATEGORIES))
    model.compile(
        optimizer="adam",
        loss="sparse_categorical_crossentropy",
        metrics=[
            "accuracy",
            tf.keras.metrics.SparseTopKCategoricalAccuracy(k=3, name="top3"),
            tf.keras.metrics.SparseTopKCategoricalAccuracy(k=5, name="top5"),
        ],
    )
    model.fit(xtr, ytr, validation_split=0.05, epochs=EPOCHS, batch_size=BATCH)
    metrics = model.evaluate(xte, yte, verbose=0, return_dict=True)
    print(f"TEST top1={metrics['accuracy']:.4f} "
          f"top3={metrics['top3']:.4f} top5={metrics['top5']:.4f}")
    if metrics["accuracy"] < TOP1_FLOOR:
        raise SystemExit(f"top1 {metrics['accuracy']:.4f} below floor {TOP1_FLOOR}")
    os.makedirs(EXPORT_DIR, exist_ok=True)
    tfjs.converters.save_keras_model(model, EXPORT_DIR)
    with open(os.path.join(EXPORT_DIR, "labels.json"), "w") as f:
        json.dump(CATEGORIES, f)
    print("exported model + labels to", EXPORT_DIR)


if __name__ == "__main__":
    main()

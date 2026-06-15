"""Train the slim MNIST showcase CNN and export it to TensorFlow.js.

Run from the repo root with the isolated training env (see requirements-train.txt):

    .venv-train/bin/python mnist/train_mnist.py

This is a build/train tool only — TensorFlow is NOT a runtime dependency. The script
is self-contained and also runs in Google Colab (upload mnist_model.py + this file).
It refuses to export unless test accuracy clears the gate, so the committed artifacts
are always known-good.
"""

import os

import numpy as np
import tensorflow as tf
import tensorflowjs as tfjs

try:  # works whether run as `python mnist/train_mnist.py` or imported
    from mnist_model import build_model
except ImportError:  # pragma: no cover
    from mnist.mnist_model import build_model

SEED = 42
ACC_GATE = 0.985
PARAM_BUDGET = 50_000
TAP_LAYERS = ("block1", "block2", "dense_reason", "output")
EXPORT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "mnist", "model")


def self_check(model):
    names = {layer.name for layer in model.layers}
    missing = [n for n in TAP_LAYERS if n not in names]
    if missing:
        raise SystemExit(f"architecture is missing tapped layers: {missing}")
    if model.count_params() > PARAM_BUDGET:
        raise SystemExit(f"{model.count_params()} params exceeds slim budget {PARAM_BUDGET}")
    print(f"self-check OK: {model.count_params()} params, all tapped layers present")


def clean_export_dir():
    os.makedirs(EXPORT_DIR, exist_ok=True)
    for name in os.listdir(EXPORT_DIR):
        if name.endswith(".bin") or name.endswith(".h5") or name == "model.json":
            os.remove(os.path.join(EXPORT_DIR, name))


def main():
    tf.random.set_seed(SEED)
    np.random.seed(SEED)

    (x_train, y_train), (x_test, y_test) = tf.keras.datasets.mnist.load_data()
    x_train = x_train.reshape(-1, 28, 28, 1).astype("float32") / 255.0
    x_test = x_test.reshape(-1, 28, 28, 1).astype("float32") / 255.0

    # shuffle before splitting so the validation set is class-representative
    # (MNIST ships class-ordered); keep the test set purely for the gate
    perm = np.random.default_rng(SEED).permutation(len(x_train))
    x_train, y_train = x_train[perm], y_train[perm]
    val_n = 6000
    x_val, y_val = x_train[:val_n], y_train[:val_n]
    x_tr, y_tr = x_train[val_n:], y_train[val_n:]

    model = build_model()
    self_check(model)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    augment = tf.keras.Sequential(
        [
            tf.keras.layers.RandomRotation(0.05),
            tf.keras.layers.RandomZoom(0.08),
            tf.keras.layers.RandomTranslation(0.08, 0.08),
        ]
    )
    train_ds = (
        tf.data.Dataset.from_tensor_slices((x_tr, y_tr))
        .shuffle(10_000, seed=SEED)
        .batch(128)
        .map(lambda x, y: (augment(x, training=True), y), num_parallel_calls=tf.data.AUTOTUNE)
        .prefetch(tf.data.AUTOTUNE)
    )

    model.fit(
        train_ds,
        epochs=25,
        validation_data=(x_val, y_val),
        callbacks=[
            tf.keras.callbacks.EarlyStopping(
                monitor="val_accuracy", patience=6, restore_best_weights=True
            ),
            tf.keras.callbacks.ReduceLROnPlateau(
                monitor="val_accuracy", factor=0.5, patience=3, min_lr=1e-5
            ),
        ],
        verbose=2,
    )

    _, acc = model.evaluate(x_test, y_test, verbose=0)
    print(f"test accuracy: {acc:.4f}")
    if acc < ACC_GATE:
        raise SystemExit(f"accuracy {acc:.4f} is below the gate {ACC_GATE}; not exporting")

    clean_export_dir()
    tfjs.converters.save_keras_model(model, EXPORT_DIR)
    print(f"exported TensorFlow.js model to {EXPORT_DIR}")


if __name__ == "__main__":
    main()

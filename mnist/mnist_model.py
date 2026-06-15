"""Slim MNIST CNN architecture for the playground's layer visualization.

`build_model()` is the single source of truth for the architecture; the training
script (`train_mnist.py`) imports it. Inference runs in the browser via TensorFlow.js,
so this module is used only at training/export time — TensorFlow is NOT a runtime
dependency of the site.

The four layers tapped by the front-end visualization are explicitly named so the JS
taps stay stable across retrains: block1, block2, dense_reason, output.
"""

import tensorflow as tf


def build_model():
    """Return the (uncompiled) slim CNN (~19K params)."""
    return tf.keras.Sequential(
        [
            tf.keras.Input(shape=(28, 28, 1)),
            tf.keras.layers.Conv2D(16, 3, padding="same", activation="relu"),
            tf.keras.layers.Conv2D(16, 3, padding="same", activation="relu", name="block1"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.MaxPooling2D(2),
            tf.keras.layers.Conv2D(32, 3, padding="same", activation="relu"),
            tf.keras.layers.Conv2D(32, 3, padding="same", activation="relu", name="block2"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.MaxPooling2D(2),
            tf.keras.layers.GlobalAveragePooling2D(),
            tf.keras.layers.Dense(64, activation="relu", name="dense_reason"),
            tf.keras.layers.Dense(10, activation="softmax", name="output"),
        ]
    )

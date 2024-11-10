import tensorflow as tf
import os
import tensorflowjs as tfjs
import numpy as np

# Where the model is saved
model_path = "your_path_here"

class MNISTModel:
    def __init__(self):
        # Ensure model has consistent input shape and preprocessing
        self.model = tf.keras.models.Sequential([
            # Input normalization layer to ensure consistent preprocessing
            tf.keras.Input(shape=(28, 28, 1)),

            # First convolution block
            tf.keras.layers.Conv2D(32, kernel_size=(3, 3), padding='same', activation="relu"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Conv2D(32, kernel_size=(3, 3), padding='same', activation="relu"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.MaxPooling2D(pool_size=(2, 2)),
            tf.keras.layers.Dropout(0.25),

            # Second convolution block
            tf.keras.layers.Conv2D(64, kernel_size=(3, 3), padding='same', activation="relu"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Conv2D(64, kernel_size=(3, 3), padding='same', activation="relu"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.MaxPooling2D(pool_size=(2, 2)),
            tf.keras.layers.Dropout(0.25),

            # Flatten and dense layers
            tf.keras.layers.Flatten(),
            tf.keras.layers.Dense(512, activation="relu"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Dropout(0.5),
            tf.keras.layers.Dense(10, activation="softmax")
        ])

        # Update paths
        self.model_dir = model_path
        self.h5_path = os.path.join(self.model_dir, 'mnist_model.h5')

        if os.path.exists(self.h5_path):
            print("Loading existing model...")
            self.model.load_weights(self.h5_path)
        else:
            print("Training new model...")
            self.train_model()

    def preprocess_data(self, x_data):
        """Ensure consistent preprocessing between training and inference"""
        x_processed = x_data.reshape(-1, 28, 28, 1).astype('float32') / 255.0
        return x_processed

    def train_model(self):
        # Create directory if it doesn't exist
        os.makedirs(self.model_dir, exist_ok=True)

        # Load and preprocess MNIST dataset
        print("Loading and preprocessing data...")
        (x_train, y_train), (x_test, y_test) = tf.keras.datasets.mnist.load_data()

        # Preprocess training data
        x_train = self.preprocess_data(x_train)
        x_test = self.preprocess_data(x_test)

        # Data augmentation for training
        data_augmentation = tf.keras.Sequential([
            tf.keras.layers.RandomRotation(0.1),
            tf.keras.layers.RandomZoom(0.1),
            tf.keras.layers.RandomTranslation(0.1, 0.1)
        ])

        # Compile model with fixed learning rate
        self.model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )

        # Callbacks
        callbacks = [
            tf.keras.callbacks.EarlyStopping(
                monitor='val_accuracy',
                patience=5,
                restore_best_weights=True
            ),
            tf.keras.callbacks.ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=3,
                min_lr=1e-6
            )
        ]

        # Train the model
        print("Starting training...")
        history = self.model.fit(
            x_train,  # Removed data augmentation for initial training
            y_train,
            batch_size=128,
            epochs=20,
            validation_split=0.1,  # Use 10% of training data for validation
            callbacks=callbacks,
            verbose=1
        )

        # Evaluate the model
        print("\nEvaluating model...")
        test_loss, test_accuracy = self.model.evaluate(x_test, y_test, verbose=0)
        print(f"Test accuracy: {test_accuracy:.4f}")

        # Save the model weights
        print("\nSaving model weights...")
        self.model.save_weights(self.h5_path)

        # Save for TensorFlow.js
        print("Converting model for TensorFlow.js...")
        tfjs.converters.save_keras_model(self.model, self.model_dir)
        print(f"Model saved to {self.model_dir}")

        # Verify conversion by running some predictions
        print("\nVerifying model predictions...")
        test_samples = x_test[:5]
        predictions = self.model.predict(test_samples, verbose=0)
        for i, pred in enumerate(predictions):
            print(f"Sample {i + 1} predictions:", pred.argmax(),
                  f"(confidence: {pred.max():.4f})")


if __name__ == "__main__":
    # Set random seeds for reproducibility
    tf.random.set_seed(42)
    np.random.seed(42)

    # Create and train model
    mnist_model = MNISTModel()
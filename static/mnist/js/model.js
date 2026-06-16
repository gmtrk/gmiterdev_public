// Loads the trained MNIST CNN (no retraining) and exposes a multi-output model
// that returns the four activations we visualise. `tf` is the global from the CDN.
const MODEL_URL = '/static/mnist/model/model.json';
const TAP_LAYERS = ['block1', 'block2', 'dense_reason', 'output'];

export async function loadVizModel() {
  const base = await tf.loadLayersModel(MODEL_URL);
  const outputs = TAP_LAYERS.map((name) => base.getLayer(name).output);
  return tf.model({ inputs: base.inputs, outputs });
}

// imageData: 28x28 ImageData from the drawing canvas.
// Returns { block1, block2, dense, preds }, each { data: Float32Array, shape }.
export function infer(model, imageData) {
  return tf.tidy(() => {
    const x = tf.browser.fromPixels(imageData, 1).toFloat().div(255).expandDims(0);
    const [b1, b2, dn, pr] = model.predict(x);
    return {
      block1: { data: b1.dataSync(), shape: b1.shape }, // [1,28,28,16]
      block2: { data: b2.dataSync(), shape: b2.shape }, // [1,14,14,32]
      dense: { data: dn.dataSync(), shape: dn.shape },  // [1,96]
      preds: { data: pr.dataSync(), shape: pr.shape },  // [1,10]
    };
  });
}

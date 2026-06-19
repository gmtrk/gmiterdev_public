import { strokesToInput, SIZE } from './rasterizer.js';

const MODEL_URL = '/static/sketchy/model/model.json';
const LABELS_URL = '/static/sketchy/model/labels.json';

export async function loadModel() {
  const [model, labels] = await Promise.all([
    tf.loadLayersModel(MODEL_URL),
    fetch(LABELS_URL).then((r) => r.json()),
  ]);
  return { model, labels };
}

export function predictTopK({ model, labels }, strokes, k = 6) {
  const flat = strokesToInput(strokes); // Float32Array(SIZE*SIZE)
  const probs = tf.tidy(() => {
    const x = tf.tensor(flat, [1, SIZE, SIZE, 1]);
    return model.predict(x).dataSync();
  });
  return Array.from(probs)
    .map((prob, i) => ({ label: labels[i], prob }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, k);
}

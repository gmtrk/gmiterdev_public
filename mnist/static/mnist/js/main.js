import { loadVizModel, infer } from './model.js';
import { createDrawCanvas } from './drawCanvas.js';

const $ = (id) => document.getElementById(id);

let model = null;
let pending = false;
let scheduled = false;
let draw = null;

function schedule() {
  pending = true;
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(frame);
  }
}

function frame() {
  scheduled = false;
  if (!pending || !model) return;
  pending = false;
  const out = infer(model, draw.getImageData());
  console.log('shapes', out.block1.shape, out.block2.shape, out.dense.shape, out.preds.shape);
}

window.addEventListener('load', async () => {
  draw = createDrawCanvas($('drawingCanvas'), schedule);
  $('clearButton').addEventListener('click', () => draw.clear());
  try {
    model = await loadVizModel();
    console.log('mnist viz: model ready');
  } catch (err) {
    console.error('model load failed', err);
    $('nn-error').style.display = 'block';
  }
});

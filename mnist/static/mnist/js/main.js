import { loadVizModel, infer } from './model.js';
import { createDrawCanvas } from './drawCanvas.js';
import { buildInfernoLUT } from './colormap.js';
import { createStageRenderer } from './featureMaps.js';

const $ = (id) => document.getElementById(id);

const lut = buildInfernoLUT();
let model = null;
let pending = false;
let scheduled = false;
let draw = null;
let block1 = null;
let block2 = null;

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
  block1.render(out.block1);
  block2.render(out.block2);
}

window.addEventListener('load', async () => {
  draw = createDrawCanvas($('drawingCanvas'), schedule);
  block1 = createStageRenderer({ gridCanvas: $('b1grid'), compositeCanvas: $('b1comp'), cols: 8, gap: 1, lut });
  block2 = createStageRenderer({ gridCanvas: $('b2grid'), compositeCanvas: $('b2comp'), cols: 8, gap: 1, lut });
  $('clearButton').addEventListener('click', () => { draw.clear(); block1.clear(); block2.clear(); });
  try {
    model = await loadVizModel();
    console.log('mnist viz: model ready');
  } catch (err) {
    console.error('model load failed', err);
    $('nn-error').style.display = 'block';
  }
});

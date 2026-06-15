import { loadVizModel, infer } from './model.js';
import { createDrawCanvas } from './drawCanvas.js';
import { buildInfernoLUT } from './colormap.js';
import { createStageRenderer } from './featureMaps.js';
import { createDenseField } from './denseField.js';
import { createPredictions } from './predictions.js';

const $ = (id) => document.getElementById(id);

const lut = buildInfernoLUT();
let model = null;
let pending = false;
let scheduled = false;
let draw = null;
let block1 = null;
let block2 = null;
let dense = null;
let preds = null;

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
  dense.render(out.dense);
  preds.render(out.preds);
}

function attachHover(canvas, renderer) {
  const pop = document.getElementById('nn-hover');
  const popCanvas = pop.querySelector('canvas');
  const popCap = pop.querySelector('.cap');
  const pctx = popCanvas.getContext('2d');

  canvas.addEventListener('mousemove', (e) => {
    const ch = renderer.channelAt(e);
    if (ch < 0) { pop.style.display = 'none'; return; }
    const img = renderer.channelImage(ch);
    popCanvas.width = img.canvasWidth;
    popCanvas.height = img.canvasHeight;
    pctx.putImageData(new ImageData(img.rgba, img.canvasWidth, img.canvasHeight), 0, 0);
    popCap.textContent = `map #${ch}`;
    pop.style.display = 'block';
    pop.style.left = Math.min(e.clientX + 16, window.innerWidth - 150) + 'px';
    pop.style.top = Math.min(e.clientY + 16, window.innerHeight - 160) + 'px';
  });
  canvas.addEventListener('mouseleave', () => { pop.style.display = 'none'; });
}

window.addEventListener('load', async () => {
  draw = createDrawCanvas($('drawingCanvas'), schedule);
  block1 = createStageRenderer({ gridCanvas: $('b1grid'), compositeCanvas: $('b1comp'), cols: 8, gap: 1, lut });
  block2 = createStageRenderer({ gridCanvas: $('b2grid'), compositeCanvas: $('b2comp'), cols: 8, gap: 1, lut });
  dense = createDenseField({ canvas: $('densefield'), cols: 32, lut });
  preds = createPredictions($('predictions'));
  attachHover($('b1grid'), block1);
  attachHover($('b2grid'), block2);
  $('clearButton').addEventListener('click', () => { draw.clear(); block1.clear(); block2.clear(); dense.clear(); preds.reset(); });
  try {
    model = await loadVizModel();
    console.log('mnist viz: model ready');
  } catch (err) {
    console.error('model load failed', err);
    $('nn-error').style.display = 'block';
  }
});

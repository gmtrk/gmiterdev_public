import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInfernoLUT, colorFor } from './colormap.js';
import { buildTiledRGBA, buildCompositeRGBA, buildChannelRGBA } from './tiling.js';

const lut = buildInfernoLUT();
const LOW = colorFor(lut, 0);   // [0,0,4]
const HIGH = colorFor(lut, 1);  // [252,255,164]

function px(rgba, w, x, y) {
  const p = (y * w + x) * 4;
  return [rgba[p], rgba[p + 1], rgba[p + 2]];
}

test('buildTiledRGBA: single 2x2 map, global normalization', () => {
  // channels=1, height=2, width=2; HWC index = h*2 + w
  const data = [0, 10 / 3, 20 / 3, 10]; // -> normalized 0, .333, .667, 1
  const { rgba, canvasWidth, canvasHeight } = buildTiledRGBA({
    data, height: 2, width: 2, channels: 1, cols: 1, gap: 0, lut,
  });
  assert.equal(canvasWidth, 2);
  assert.equal(canvasHeight, 2);
  assert.deepEqual(px(rgba, 2, 0, 0), LOW);   // value 0
  assert.deepEqual(px(rgba, 2, 1, 1), HIGH);  // value 10
});

test('buildTiledRGBA: two 1x1 maps with a 1px gap', () => {
  const data = [0, 10]; // channel0=0, channel1=10
  const { rgba, canvasWidth, canvasHeight } = buildTiledRGBA({
    data, height: 1, width: 1, channels: 2, cols: 2, gap: 1, lut,
  });
  assert.equal(canvasWidth, 3); // 2 tiles + 1 gap
  assert.equal(canvasHeight, 1);
  assert.deepEqual(px(rgba, 3, 0, 0), LOW);   // channel0
  assert.deepEqual(px(rgba, 3, 1, 0), LOW);   // gap = background (inferno 0)
  assert.deepEqual(px(rgba, 3, 2, 0), HIGH);  // channel1
});

test('buildCompositeRGBA: max-projection across channels', () => {
  // h=1, w=2, channels=2; HWC = [(p0c0,p0c1),(p1c0,p1c1)]
  const data = [1, 5, 9, 2]; // pixel0 max=5, pixel1 max=9
  const { rgba, canvasWidth, canvasHeight } = buildCompositeRGBA({
    data, height: 1, width: 2, channels: 2, lut,
  });
  assert.equal(canvasWidth, 2);
  assert.equal(canvasHeight, 1);
  assert.deepEqual(px(rgba, 2, 0, 0), LOW);   // 5 -> normalized 0
  assert.deepEqual(px(rgba, 2, 1, 0), HIGH);  // 9 -> normalized 1
});

test('buildChannelRGBA: pulls one channel out of HWC', () => {
  // h=1,w=2,channels=2; channel 1 values = [5, 2]
  const data = [1, 5, 9, 2];
  const { rgba, canvasWidth } = buildChannelRGBA({
    data, height: 1, width: 2, channels: 2, channel: 1, lut,
  });
  assert.equal(canvasWidth, 2);
  assert.deepEqual(px(rgba, 2, 0, 0), HIGH); // 5 is the max of [5,2] -> 1
  assert.deepEqual(px(rgba, 2, 1, 0), LOW);  // 2 -> 0
});

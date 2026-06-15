import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInfernoLUT, colorFor } from './colormap.js';

test('LUT has 256 RGB entries', () => {
  assert.equal(buildInfernoLUT().length, 256 * 3);
});

test('endpoints match inferno extremes', () => {
  const lut = buildInfernoLUT();
  assert.deepEqual(colorFor(lut, 0), [0, 0, 4]);
  assert.deepEqual(colorFor(lut, 1), [252, 255, 164]);
});

test('colorFor clamps out-of-range input', () => {
  const lut = buildInfernoLUT();
  assert.deepEqual(colorFor(lut, -5), [0, 0, 4]);
  assert.deepEqual(colorFor(lut, 5), [252, 255, 164]);
});

test('midpoint has ramped-up red and not-yet-peak blue', () => {
  const mid = colorFor(buildInfernoLUT(), 0.5);
  assert.ok(mid[0] > 100, `red was ${mid[0]}`);
  assert.ok(mid[2] < 164, `blue was ${mid[2]}`);
});

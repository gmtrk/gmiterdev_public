import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { strokesToInput, bbox, transformParams, SIZE, RENDER, RENDER_MARGIN } from './rasterizer.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'rasterizer_golden.json'), 'utf8'));

test('constants match the python rasterizer', () => {
  assert.equal(SIZE, 64);
  assert.equal(RENDER, 256);
  assert.equal(RENDER_MARGIN, 16);
});

test('bbox over all points', () => {
  assert.deepEqual(bbox([[[0, 10], [0, 0]]]), [0, 0, 10, 0]);
});

test('transformParams scales long side into inner box, centered', () => {
  const inner = RENDER - 2 * RENDER_MARGIN;
  const { scale, offx } = transformParams([[[0, 10], [0, 0]]]);
  assert.ok(Math.abs(scale - inner / 10) < 1e-6);
  assert.ok(Math.abs(0 * scale + offx - RENDER_MARGIN) < 1e-6);
});

test('output length and range', () => {
  const out = strokesToInput([[[0, 100], [50, 50]]]);
  assert.equal(out.length, SIZE * SIZE);
  let mx = 0;
  for (const v of out) { assert.ok(v >= 0 && v <= 1); if (v > mx) mx = v; }
  assert.ok(mx > 0.5);
});

test('blank input is all zeros', () => {
  const out = strokesToInput([]);
  assert.equal(out.length, SIZE * SIZE);
  assert.equal(Math.max(...out), 0);
});

test('matches python golden within tolerance (PARITY)', () => {
  for (const c of golden.cases) {
    const out = strokesToInput(c.strokes);
    let sum = 0;
    for (let i = 0; i < out.length; i++) sum += Math.abs(out[i] - c.expected[i]);
    const mae = sum / out.length;
    assert.ok(mae < 0.02, `${c.name} mae=${mae.toFixed(4)}`);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeNormalizer } from './normalize.js';

test('linear scaling to [0,1]', () => {
  const n = makeNormalizer([0, 5, 10]);
  assert.equal(n.min, 0);
  assert.equal(n.max, 10);
  assert.equal(n.scale(0), 0);
  assert.equal(n.scale(5), 0.5);
  assert.equal(n.scale(10), 1);
});

test('all-equal input maps everything to 0 (blank canvas)', () => {
  const n = makeNormalizer([3, 3, 3]);
  assert.equal(n.scale(3), 0);
});

test('works with a typed array', () => {
  const n = makeNormalizer(new Float32Array([2, 4, 6]));
  assert.equal(n.scale(4), 0.5);
});

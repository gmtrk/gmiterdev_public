import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPrompts } from './prompts.js';

const POOL = ['a', 'b', 'c', 'd', 'e'];

test('returns n distinct items', () => {
  const got = pickPrompts(POOL, 3, mkRand([0.1, 0.5, 0.9, 0.2, 0.7]));
  assert.equal(got.length, 3);
  assert.equal(new Set(got).size, 3);
  for (const g of got) assert.ok(POOL.includes(g));
});

test('n >= pool returns a full permutation', () => {
  const got = pickPrompts(POOL, 10, mkRand([0.3, 0.3, 0.3, 0.3, 0.3]));
  assert.equal(got.length, 5);
  assert.deepEqual([...got].sort(), [...POOL].sort());
});

// deterministic rand stub cycling fixed values
function mkRand(vals) {
  let i = 0;
  return () => vals[i++ % vals.length];
}

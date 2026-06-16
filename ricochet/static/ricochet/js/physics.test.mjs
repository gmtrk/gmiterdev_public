import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAG_GOLDEN, FLAG_CAP_EXEMPT,
  TYPE_NORMAL, TYPE_CLACKER, TYPE_SPLITTER, TYPE_BURSTER,
} from './physics.js';

test('flag constants are distinct power-of-two bits', () => {
  assert.equal(FLAG_GOLDEN, 1);
  assert.equal(FLAG_CAP_EXEMPT, 2);
  assert.equal(FLAG_GOLDEN & FLAG_CAP_EXEMPT, 0);
});

test('type constants are distinct small integers', () => {
  assert.equal(TYPE_NORMAL, 0);
  assert.equal(TYPE_CLACKER, 1);
  assert.equal(TYPE_SPLITTER, 2);
  assert.equal(TYPE_BURSTER, 3);
});

import { createPool, swapRemove } from './physics.js';

test('createPool allocates SoA typed arrays of the given capacity', () => {
  const p = createPool(10, false);
  assert.equal(p.capacity, 10);
  assert.equal(p.count, 0);
  assert.ok(p.x instanceof Float32Array && p.x.length === 10);
  assert.ok(p.y instanceof Float32Array && p.y.length === 10);
  assert.ok(p.vx instanceof Float32Array && p.vx.length === 10);
  assert.ok(p.vy instanceof Float32Array && p.vy.length === 10);
  assert.ok(p.radius instanceof Float32Array && p.radius.length === 10);
  assert.ok(p.type instanceof Uint8Array && p.type.length === 10);
  assert.ok(p.flags instanceof Uint8Array && p.flags.length === 10);
  assert.equal(p.charge, undefined);
  assert.equal(p.clackCooldown, undefined);
  assert.equal(p.envHits, undefined);
});

test('createPool with isSpecial adds charge/clackCooldown/envHits arrays', () => {
  const p = createPool(8, true);
  assert.ok(p.charge instanceof Float32Array && p.charge.length === 8);
  assert.ok(p.clackCooldown instanceof Float32Array && p.clackCooldown.length === 8);
  assert.ok(p.envHits instanceof Int32Array && p.envHits.length === 8);
});

test('swapRemove moves the last element into the hole and shrinks count (O(1))', () => {
  const p = createPool(4, false);
  // manually populate 3 distinguishable entries
  for (let i = 0; i < 3; i++) {
    p.x[i] = (i + 1) * 100; p.y[i] = (i + 1) * 10;
    p.vx[i] = i + 1; p.vy[i] = -(i + 1);
    p.radius[i] = 6; p.type[i] = 0; p.flags[i] = i;
    p.count++;
  }
  // remove index 0; the last (index 2) must be copied into slot 0
  swapRemove(p, 0);
  assert.equal(p.count, 2);
  assert.equal(p.x[0], 300);
  assert.equal(p.y[0], 30);
  assert.equal(p.vx[0], 3);
  assert.equal(p.vy[0], -3);
  assert.equal(p.flags[0], 2);
});

test('swapRemove of the last element just shrinks count without self-copy issues', () => {
  const p = createPool(4, false);
  for (let i = 0; i < 2; i++) {
    p.x[i] = i; p.y[i] = i; p.count++;
  }
  swapRemove(p, 1); // last index
  assert.equal(p.count, 1);
  assert.equal(p.x[0], 0);
});

test('swapRemove carries special-only fields (charge/clackCooldown/envHits) on a special pool', () => {
  const p = createPool(4, true);
  for (let i = 0; i < 3; i++) {
    p.charge[i] = (i + 1) * 5;
    p.clackCooldown[i] = (i + 1) * 0.1;
    p.envHits[i] = i + 1;
    p.count++;
  }
  swapRemove(p, 0);
  assert.equal(p.count, 2);
  assert.equal(p.charge[0], 15);
  assert.ok(Math.abs(p.clackCooldown[0] - 0.3) < 1e-6);
  assert.equal(p.envHits[0], 3);
});

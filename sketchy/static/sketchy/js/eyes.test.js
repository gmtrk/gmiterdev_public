import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pupilOffset } from './eyes.js';

test('pupilOffset clamps to maxR when cursor is far', () => {
  const o = pupilOffset(100, 0, 7); // dx=100,dy=0 → clamp to 7 on x
  assert.ok(Math.abs(o.x - 7) < 1e-9);
  assert.equal(o.y, 0);
});

test('pupilOffset is proportional when within maxR', () => {
  const o = pupilOffset(3, 4, 7); // hypot=5 < 7 → unchanged
  assert.ok(Math.abs(o.x - 3) < 1e-9 && Math.abs(o.y - 4) < 1e-9);
});

test('pupilOffset handles zero delta without NaN', () => {
  const o = pupilOffset(0, 0, 7);
  assert.equal(o.x, 0); assert.equal(o.y, 0);
});

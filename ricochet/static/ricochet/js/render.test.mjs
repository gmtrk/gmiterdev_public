import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketRadius,
  atlasKey,
  createFloatingTextPool,
  createParticleRing,
  specialHue,
  chargeRing,
} from './render.js';
import { CLACKER, SPLITTER, BURSTER, NORMAL } from './physics.js';
import { PALETTE } from './config.js';

test('bucketRadius rounds to nearest integer, min 1', () => {
  assert.equal(bucketRadius(6), 6);
  assert.equal(bucketRadius(6.4), 6);
  assert.equal(bucketRadius(6.5), 7);
  assert.equal(bucketRadius(0.2), 1);
});

test('atlasKey is stable and combines type name + bucket', () => {
  assert.equal(atlasKey('golden', 6), 'golden@6');
  assert.equal(atlasKey('clacker', 6.5), 'clacker@7');
  assert.equal(atlasKey('normal', 6), 'normal@6');
});

test('FloatingText pool: spawn, expire, and skip dead entries', () => {
  const pool = createFloatingTextPool(4);
  pool.spawn(10, 20, '+5');
  let seen = [];
  pool.forEach((ft) => seen.push(ft.text));
  assert.deepEqual(seen, ['+5']);
  pool.update(10); // long dt expires it (default life ~0.9s)
  seen = [];
  pool.forEach((ft) => seen.push(ft.text));
  assert.deepEqual(seen, []);
});

test('FloatingText pool: capped, overwrites oldest, never allocates beyond cap', () => {
  const pool = createFloatingTextPool(2);
  pool.spawn(0, 0, 'a');
  pool.spawn(0, 0, 'b');
  pool.spawn(0, 0, 'c'); // overwrites 'a'
  const seen = [];
  pool.forEach((ft) => seen.push(ft.text));
  assert.equal(seen.length, 2);
  assert.ok(seen.includes('b'));
  assert.ok(seen.includes('c'));
  assert.ok(!seen.includes('a'));
});

test('Particle ring: emit, live iteration, expiry', () => {
  const ring = createParticleRing(3);
  ring.emit(1, 1, 0, 0, 0.5);
  ring.emit(2, 2, 0, 0, 0.5);
  let count = 0;
  ring.forEach(() => { count += 1; });
  assert.equal(count, 2);
  ring.update(1); // both expire
  count = 0;
  ring.forEach(() => { count += 1; });
  assert.equal(count, 0);
});

test('Particle ring: overwrites oldest when full (fixed size)', () => {
  const ring = createParticleRing(2);
  ring.emit(1, 0, 0, 0, 9);
  ring.emit(2, 0, 0, 0, 9);
  ring.emit(3, 0, 0, 0, 9); // overwrites first
  const xs = [];
  ring.forEach((p) => xs.push(p.x));
  assert.equal(xs.length, 2);
  assert.ok(xs.includes(2));
  assert.ok(xs.includes(3));
  assert.ok(!xs.includes(1));
});

test('Particle update advances position by velocity * dt', () => {
  const ring = createParticleRing(2);
  ring.emit(0, 0, 10, 20, 9);
  ring.update(0.5);
  let px = 0; let py = 0;
  ring.forEach((p) => { px = p.x; py = p.y; });
  assert.ok(Math.abs(px - 5) < 1e-9);
  assert.ok(Math.abs(py - 10) < 1e-9);
});

test('specialHue maps each special type to its palette color', () => {
  assert.equal(specialHue(CLACKER, PALETTE), PALETTE.clacker);
  assert.equal(specialHue(SPLITTER, PALETTE), PALETTE.splitter);
  assert.equal(specialHue(BURSTER, PALETTE), PALETTE.burster);
});

test('specialHue falls back to the normal cyan for a NORMAL ball', () => {
  assert.equal(specialHue(NORMAL, PALETTE), PALETTE.ballCyan);
});

test('chargeRing returns a clamped fraction and a clockwise arc from 12 o\'clock', () => {
  const r = chargeRing(30, 60); // half charged
  assert.equal(r.frac, 0.5);
  assert.ok(Math.abs(r.startAngle - (-Math.PI / 2)) < 1e-9, 'starts at top (-PI/2)');
  assert.ok(Math.abs(r.endAngle - (-Math.PI / 2 + Math.PI)) < 1e-9, 'sweeps half a turn');
});

test('chargeRing clamps frac into [0,1] and guards divide-by-zero', () => {
  assert.equal(chargeRing(90, 60).frac, 1, 'overcharge clamps to full');
  assert.equal(chargeRing(-5, 60).frac, 0, 'negative clamps to empty');
  assert.equal(chargeRing(5, 0).frac, 0, 'zero threshold -> empty (no divide-by-zero)');
});

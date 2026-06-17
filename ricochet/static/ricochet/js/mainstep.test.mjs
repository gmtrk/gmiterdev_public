import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnTick, buildHudAdapter, snapSpawnX } from './mainstep.js';
import { FLAG_GOLDEN, FLAG_CAP_EXEMPT } from './physics.js';
import { MAX_SPAWNS_PER_TICK } from './config.js';

// Minimal fake world exposing exactly what spawnTick touches. We capture
// spawnNormal calls by giving the normal pool a tiny SoA + count.
// `baseCapacity` is optional: when absent, spawnTick falls back to ceiling-gating
// (the legacy behaviour these accumulator/clamp tests assert). `flags` is an
// optional per-ball flag array for cap-exempt accounting.
function fakeWorld(opts = {}) {
  const cap = opts.cap ?? 100;
  const spawned = [];
  const world = {
    W: 1000,
    H: 1500,
    ceiling: opts.ceiling ?? cap,
    baseCapacity: opts.baseCapacity, // undefined unless a test opts in
    goldenChance: opts.goldenChance ?? 0,
    _spawnAcc: opts.acc ?? 0,
    normal: {
      count: opts.count ?? 0,
      flags: opts.flags, // optional; undefined -> all balls counted as cap-bound
      // spawnTick must call the real spawnNormal; we stub it via __spawn hook below
    },
    __spawned: spawned,
  };
  return world;
}

test('spawnTick: spawns floor(acc) balls when slots and tick cap allow', () => {
  // Provide a fake spawnNormal by injecting through the optional 4th arg style:
  // spawnTick(world, dt, spawnRate, rng, spawnFn)
  const world = fakeWorld({ acc: 0, count: 0, ceiling: 100, goldenChance: 0 });
  const calls = [];
  const spawnFn = (w, x, y, flags) => { calls.push({ x, y, flags }); w.normal.count += 1; };
  // spawnRate*dt = 3 over one call -> acc=3 -> spawn 3
  const made = spawnTick(world, 1, 3, () => 0.99, spawnFn);
  assert.equal(made, 3);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => (c.flags & FLAG_GOLDEN) === 0)); // rng 0.99 never golden at chance 0
});

test('spawnTick: golden roll ORs in FLAG_GOLDEN when rng < goldenChance', () => {
  const world = fakeWorld({ acc: 0, count: 0, ceiling: 100, goldenChance: 1 }); // always golden
  const calls = [];
  const spawnFn = (w, x, y, flags) => { calls.push(flags); w.normal.count += 1; };
  spawnTick(world, 1, 1, () => 0, spawnFn);
  assert.equal(calls.length, 1);
  assert.equal(calls[0] & FLAG_GOLDEN, FLAG_GOLDEN);
});

test('spawnTick: clamps to free slots', () => {
  const world = fakeWorld({ acc: 0, count: 98, ceiling: 100, goldenChance: 0 });
  let made = 0;
  const spawnFn = (w) => { made += 1; w.normal.count += 1; };
  const n = spawnTick(world, 1, 50, () => 0.99, spawnFn);
  assert.equal(n, 2); // only 2 free slots
  assert.equal(made, 2);
});

test('spawnTick: timer fills only up to baseCapacity (slot-based capacity)', () => {
  // capacity 1, empty arena, generous spawn rate -> exactly one timer ball.
  const world = fakeWorld({ acc: 0, count: 0, ceiling: 5000, baseCapacity: 1, goldenChance: 0 });
  const calls = [];
  const spawnFn = (w, x, y, flags) => { calls.push(flags); w.normal.count += 1; };
  const made = spawnTick(world, 1, 10, () => 0.99, spawnFn);
  assert.equal(made, 1);
  assert.equal(calls.length, 1);
});

test('spawnTick: cap-exempt (power) balls do not consume capacity slots', () => {
  // 3 live cap-exempt balls + capacity 2 -> 0 cap-bound, so the timer still fills 2.
  const flags = new Uint8Array([FLAG_CAP_EXEMPT, FLAG_CAP_EXEMPT, FLAG_CAP_EXEMPT]);
  const world = fakeWorld({ acc: 0, count: 3, ceiling: 5000, baseCapacity: 2, goldenChance: 0, flags });
  let made = 0;
  const spawnFn = (w) => { made += 1; w.normal.count += 1; };
  const n = spawnTick(world, 1, 10, () => 0.99, spawnFn);
  assert.equal(n, 2);
  assert.equal(made, 2);
});

test('spawnTick: does not bank the accumulator while at capacity (respawn cadence)', () => {
  // capacity 1 with a ball already alive -> no free slot. Across many ticks the
  // accumulator must stay 0 (no banked reserve), so a freed slot waits a fresh
  // interval rather than refilling instantly.
  const world = fakeWorld({ acc: 0, count: 1, ceiling: 5000, baseCapacity: 1, goldenChance: 0 });
  const spawnFn = (w) => { w.normal.count += 1; };
  for (let i = 0; i < 100; i++) spawnTick(world, 1, 10, () => 0.99, spawnFn);
  assert.equal(world._spawnAcc, 0);
  // free the slot: one tick may refill at most the single open slot
  world.normal.count = 0;
  const made = spawnTick(world, 1, 10, () => 0.99, spawnFn);
  assert.equal(made, 1);
});

test('spawnTick: clamps to MAX_SPAWNS_PER_TICK', () => {
  const world = fakeWorld({ acc: 0, count: 0, ceiling: 10000, goldenChance: 0 });
  const spawnFn = (w) => { w.normal.count += 1; };
  const n = spawnTick(world, 1, 999, () => 0.99, spawnFn);
  assert.equal(n, MAX_SPAWNS_PER_TICK);
});

test('spawnTick: spawns x within the spawn band and y = SPAWN_Y', () => {
  const world = fakeWorld({ acc: 0, count: 0, ceiling: 100, goldenChance: 0 });
  const seen = [];
  const spawnFn = (w, x, y) => { seen.push({ x, y }); w.normal.count += 1; };
  spawnTick(world, 1, 1, () => 0.5, spawnFn);
  assert.equal(seen.length, 1);
  assert.ok(seen[0].x >= 40 && seen[0].x <= world.W - 40); // SPAWN_MARGIN = 40
  assert.equal(seen[0].y, 30); // SPAWN_Y = 30
});

test('buildHudAdapter returns the contract shape (plus cores for the Cores HUD stat)', () => {
  const state = { credits: 1234.5, cores: 17 };
  const world = {
    normal: { count: 42 },
    baseCapacity: 7,
    ceiling: 5000,
  };
  const run = { creditsPerSec: 88, comboBonus: 3.5, comboCapBonus: 9 };
  const a = buildHudAdapter(state, world, run);
  assert.deepEqual(Object.keys(a).sort(), [
    'ballCount', 'capacity', 'ceiling', 'comboBonus', 'comboCapBonus', 'cores', 'creditsPerSec', 'credits',
  ].sort());
  assert.equal(a.credits, 1234.5);
  assert.equal(a.creditsPerSec, 88);
  assert.equal(a.cores, 17);
  assert.equal(a.ballCount, 42);
  assert.equal(a.capacity, 7);
  assert.equal(a.comboBonus, 3.5);
  assert.equal(a.comboCapBonus, 9);
  assert.equal(a.ceiling, 5000);
});

test('snapSpawnX: leaves x alone when it already hits a peg (within hitRadius)', () => {
  const pegs = new Float32Array([500]);
  assert.equal(snapSpawnX(505, pegs, 1, 13, 24, 40, 1000), 505); // d=5 <= 13
});

test('snapSpawnX: snaps a near-miss to ~11px off-center on the approach side', () => {
  const pegs = new Float32Array([500]);
  // d=25 is in (13, 13+24]; snap to pegX + sign*(13*0.85)=500+11.05
  assert.ok(Math.abs(snapSpawnX(525, pegs, 1, 13, 24, 40, 1000) - 511.05) < 1e-6);
  // approached from the left -> stays on the left
  assert.ok(Math.abs(snapSpawnX(475, pegs, 1, 13, 24, 40, 1000) - 488.95) < 1e-6);
});

test('snapSpawnX: leaves x alone when the nearest peg is beyond hitRadius+helperDist', () => {
  const pegs = new Float32Array([500]);
  assert.equal(snapSpawnX(560, pegs, 1, 13, 24, 40, 1000), 560); // d=60 > 37
});

test('snapSpawnX: no-op with no pegs or zero helper distance', () => {
  assert.equal(snapSpawnX(525, new Float32Array([]), 0, 13, 24, 40, 1000), 525);
  assert.equal(snapSpawnX(525, new Float32Array([500]), 1, 13, 0, 40, 1000), 525);
});

test('snapSpawnX: clamps the snapped result into the spawn band', () => {
  const pegs = new Float32Array([960]); // near the right edge (W-margin = 960)
  // d=30 in band; raw snap = 960+11.05 = 971.05 -> clamp to 960
  assert.equal(snapSpawnX(990, pegs, 1, 13, 24, 40, 1000), 960);
});

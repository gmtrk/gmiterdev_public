import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnTick, buildHudAdapter } from './mainstep.js';
import { FLAG_GOLDEN } from './physics.js';
import { MAX_SPAWNS_PER_TICK } from './config.js';

// Minimal fake world exposing exactly what spawnTick touches. We capture
// spawnNormal calls by giving the normal pool a tiny SoA + count.
function fakeWorld(opts = {}) {
  const cap = opts.cap ?? 100;
  const spawned = [];
  const world = {
    W: 1000,
    H: 1500,
    ceiling: opts.ceiling ?? cap,
    goldenChance: opts.goldenChance ?? 0,
    _spawnAcc: opts.acc ?? 0,
    normal: {
      count: opts.count ?? 0,
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

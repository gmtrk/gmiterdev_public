import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coresFromRun } from './economy.js';
import { PRESTIGE } from './config.js';
import { projectPrestige, performBigBang } from './prestige.js';
import { reinitFreshRun } from './prestige.js';
import { STARTING_CREDITS } from './config.js';
import { applyUpgradeEffects } from './economy.js';
import { buildWorld } from './physics.js';

// Build a real world from a state so the clamp reads the actual post-reset budgets.
function worldFor(state) {
  const world = buildWorld(state);     // calls applyUpgradeEffects + rebuildColliders
  applyUpgradeEffects(world, state);   // ensure budgets/baseCapacity are derived
  return world;
}

function sampleState() {
  return {
    version: 1,
    credits: 4e9,
    cores: 7,
    lifetimeCores: 40,
    upgrades: { globalValueMult: 5, ballCapacity: 3 },
    specials: {
      clacker: { unlocked: true, capacity: 4 },
      splitter: { unlocked: false, capacity: 0 },
      burster: { unlocked: true, capacity: 2 },
    },
    coresShop: { power: 2, offline: 1 },
    placed: {
      pegs: [{ x: 100, y: 200 }, { x: 300, y: 400 }],
      blocks: [{ x: 400, y: 820, level: 9, respawnAt: 0, golden: false }],
      paddle: { x: 500, width: 120 },
    },
    stats: { recentEarnRate: 1234, lastSaveTime: 1781632292000, lastSubmittedCores: 30 },
  };
}

test('projectPrestige reports projected cores and a positive speedup', () => {
  const state = sampleState();
  const proj = projectPrestige(state);
  assert.equal(proj.cores, coresFromRun(state.credits));
  assert.equal(proj.cores, 20); // floor(1*sqrt(4e9/1e7)) = floor(20) = 20
  assert.equal(proj.lifetimeAfter, state.lifetimeCores + proj.cores);
  assert.ok(proj.speedup > 1, 'projected next-run speedup should exceed 1x');
});

test('projectPrestige speedup grows with more projected cores', () => {
  const small = projectPrestige({ ...sampleState(), credits: PRESTIGE.coreScale });
  const big = projectPrestige({ ...sampleState(), credits: PRESTIGE.coreScale * 100 });
  assert.ok(big.speedup > small.speedup);
});

test('performBigBang grants projected cores into cores and lifetimeCores', () => {
  const state = sampleState();
  const beforeCores = state.cores;
  const beforeLifetime = state.lifetimeCores;
  const gained = performBigBang(state);
  assert.equal(gained, 20);
  assert.equal(state.cores, beforeCores + 20);
  assert.equal(state.lifetimeCores, beforeLifetime + 20);
});

test('performBigBang resets run progress (credits/upgrades/specials)', () => {
  const state = sampleState();
  performBigBang(state);
  assert.equal(typeof state.credits, 'number');
  assert.equal(state.credits, 0);
  assert.deepEqual(state.upgrades, {});
  assert.equal(state.specials.clacker.unlocked, false);
  assert.equal(state.specials.clacker.capacity, 0);
  assert.equal(state.specials.burster.unlocked, false);
  assert.equal(state.specials.burster.capacity, 0);
});

test('performBigBang PERSISTS cores-shop, lifetimeCores baseline, and the blueprint', () => {
  const state = sampleState();
  const pegsBefore = JSON.parse(JSON.stringify(state.placed.pegs));
  const blocksBefore = JSON.parse(JSON.stringify(state.placed.blocks));
  const paddleBefore = JSON.parse(JSON.stringify(state.placed.paddle));
  performBigBang(state);
  // coresShop survives untouched (the reset/persist partition)
  assert.deepEqual(state.coresShop, { power: 2, offline: 1 });
  // placement blueprint survives (positions persist across Big Bang)
  assert.deepEqual(state.placed.pegs, pegsBefore);
  assert.deepEqual(state.placed.blocks, blocksBefore);
  assert.deepEqual(state.placed.paddle, paddleBefore);
});

test('performBigBang preserves stats but clears nothing it should not', () => {
  const state = sampleState();
  performBigBang(state);
  assert.equal(state.stats.lastSubmittedCores, 30);
  assert.equal(state.stats.recentEarnRate, 1234);
});

test('reinitFreshRun seeds starting credits from STARTING_CREDITS + Cores head-start', () => {
  const state = { ...sampleState(), credits: 0, upgrades: {}, coresShop: {} };
  const world = worldFor(state);
  reinitFreshRun(world, state);
  // With no head-start cores-shop levels, credits == base STARTING_CREDITS.
  assert.equal(state.credits, STARTING_CREDITS);
});

test('reinitFreshRun applies the blueprint CLAMPED to current (post-reset) peg budget', () => {
  // Blueprint has 2 pegs; force a post-reset peg budget of 1 to prove the clamp.
  const state = { ...sampleState(), credits: 0, upgrades: {}, coresShop: {} };
  const world = worldFor(state);
  world.budgets.pegs = 1;          // simulate a tiny post-reset budget
  world.budgets.blocks = 5;
  reinitFreshRun(world, state);
  // Only one peg fits: live colliders are clamped to budget.
  assert.ok(world.pegs.count <= world.budgets.pegs);
  assert.equal(world.pegs.count, 1);
});

test('reinitFreshRun keeps the saved blueprint intact (clamp is on the live world, not the blueprint)', () => {
  const state = { ...sampleState(), credits: 0, upgrades: {}, coresShop: {} };
  const world = worldFor(state);
  world.budgets.pegs = 1;
  reinitFreshRun(world, state);
  // The persisted blueprint still has both pegs even though only 1 is live.
  assert.equal(state.placed.pegs.length, 2);
});

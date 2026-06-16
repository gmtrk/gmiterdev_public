import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coresFromRun } from './economy.js';
import { PRESTIGE } from './config.js';
import { projectPrestige, performBigBang } from './prestige.js';

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
  assert.equal(proj.cores, 2); // floor(1*sqrt(4e9/1e9)) = floor(2) = 2
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
  assert.equal(gained, 2);
  assert.equal(state.cores, beforeCores + 2);
  assert.equal(state.lifetimeCores, beforeLifetime + 2);
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

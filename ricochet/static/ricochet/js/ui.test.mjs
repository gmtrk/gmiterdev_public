import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyUpgrade } from './ui.js';
import { UPGRADES } from './config.js';
import { upgradeCost } from './economy.js';

// buyUpgrade(world, state, id, applyEffects) -> boolean (true if bought).
// MUST read/write state.credits (NOT world.credits) and state.upgrades, then
// call applyEffects(world, state). Returns false (and changes nothing) if the
// player can't afford it or the upgrade is maxed.

const headline = UPGRADES.find((u) => u.id === 'globalValueMult');

function freshState(credits) {
  return { credits, upgrades: {} };
}

test('buyUpgrade: deducts cost, increments level, calls applyEffects', () => {
  const state = freshState(1e6);
  const cost = upgradeCost(headline, 0); // level 0 cost
  let applied = 0;
  const world = {};
  const ok = buyUpgrade(world, state, 'globalValueMult', () => { applied++; });
  assert.equal(ok, true);
  assert.equal(state.upgrades.globalValueMult, 1);
  assert.equal(state.credits, 1e6 - cost);
  assert.equal(applied, 1, 'applyEffects must be called exactly once');
});

test('buyUpgrade: refuses when credits are insufficient and changes nothing', () => {
  const state = freshState(0);
  let applied = 0;
  const ok = buyUpgrade({}, state, 'globalValueMult', () => { applied++; });
  assert.equal(ok, false);
  assert.equal(state.upgrades.globalValueMult, undefined);
  assert.equal(state.credits, 0);
  assert.equal(applied, 0, 'applyEffects must NOT be called on a failed buy');
});

test('buyUpgrade: cost grows with current level (reads state.upgrades)', () => {
  const state = freshState(1e9);
  state.upgrades.globalValueMult = 2; // already level 2
  const expected = upgradeCost(headline, 2);
  const before = state.credits;
  const ok = buyUpgrade({}, state, 'globalValueMult', () => {});
  assert.equal(ok, true);
  assert.equal(state.upgrades.globalValueMult, 3);
  // float64 catastrophic cancellation: 1e9 - (1e9 - cost) !== cost exactly.
  assert.ok(Math.abs((before - state.credits) - expected) < 1e-6);
});

test('buyUpgrade: unknown id returns false and changes nothing', () => {
  const state = freshState(1e9);
  const ok = buyUpgrade({}, state, 'no-such-upgrade', () => {});
  assert.equal(ok, false);
  assert.equal(state.credits, 1e9);
});

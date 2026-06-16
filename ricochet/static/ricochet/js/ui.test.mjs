import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyUpgrade, coresShopRows } from './ui.js';
import { UPGRADES, CORES_UPGRADES } from './config.js';
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

test('coresShopRows returns one row per Cores upgrade with its group', () => {
  const state = { cores: 0, coresShop: {} };
  const rows = coresShopRows(state);
  assert.equal(rows.length, CORES_UPGRADES.length);
  const groups = new Set(rows.map((r) => r.group));
  // The four authored Cores-shop groups must all be representable.
  for (const g of groups) {
    assert.ok(['power', 'headstart', 'unlocks', 'offline'].includes(g), `unexpected group ${g}`);
  }
});

test('coresShopRows reports current level and next-level cost from state.coresShop', () => {
  const def = CORES_UPGRADES[0];
  const state = { cores: 0, coresShop: { [def.id]: 3 } };
  const rows = coresShopRows(state);
  const row = rows.find((r) => r.id === def.id);
  assert.equal(row.level, 3);
  assert.equal(row.cost, upgradeCost(def, 3));
});

test('coresShopRows marks affordability against state.cores', () => {
  const def = CORES_UPGRADES[0];
  const cost = upgradeCost(def, 0);
  const poor = coresShopRows({ cores: cost - 1, coresShop: {} }).find((r) => r.id === def.id);
  const rich = coresShopRows({ cores: cost, coresShop: {} }).find((r) => r.id === def.id);
  assert.equal(poor.affordable, false);
  assert.equal(rich.affordable, true);
});

test('coresShopRows flags a maxed upgrade as not affordable', () => {
  const capped = CORES_UPGRADES.find((u) => u.max != null);
  if (!capped) return; // no capped cores upgrade in config; nothing to assert
  const state = { cores: 1e12, coresShop: { [capped.id]: capped.max } };
  const row = coresShopRows(state).find((r) => r.id === capped.id);
  assert.equal(row.maxed, true);
  assert.equal(row.affordable, false);
});

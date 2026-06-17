import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyUpgrade, coresShopRows, statCardLines, buySpecialUnlock, specialUnlockDef, effectLabel, creditsRowModel } from './ui.js';
import { UPGRADES, CORES_UPGRADES } from './config.js';
import { upgradeCost } from './economy.js';
import { unlockSpecial, specialSpawnPlan } from './specials.js';
import { SPECIAL_CAP } from './config.js';

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

// --- Special-ball unlocks (reachable in-game via the Credits shop) ---------
function freshSpecials() {
  return {
    clacker: { unlocked: false, capacity: 0 },
    splitter: { unlocked: false, capacity: 0 },
    burster: { unlocked: false, capacity: 0 },
  };
}

test('UPGRADES exposes special-unlock rows for clacker/splitter/burster', () => {
  for (const type of ['clacker', 'splitter', 'burster']) {
    const def = UPGRADES.find((u) => u.unlock === type);
    assert.ok(def, `missing unlock row for ${type}`);
    assert.equal(specialUnlockDef(def.id), def);
  }
});

test('buySpecialUnlock flips state.specials[type].unlocked true and debits credits', () => {
  const def = UPGRADES.find((u) => u.unlock === 'clacker');
  const cost = upgradeCost(def, 0);
  const state = { credits: cost + 100, upgrades: {}, specials: freshSpecials() };
  let grantedType = null;
  // main.js passes unlockSpecialAndSeed; here we use the real unlockSpecial which
  // flips unlocked + sizes capacity for the starter pack.
  const ok = buySpecialUnlock(state, def.id, (type) => {
    grantedType = type;
    unlockSpecial(state.specials, type);
  });
  assert.equal(ok, true);
  assert.equal(state.specials.clacker.unlocked, true, 'clacker must be unlocked after purchase');
  assert.ok(state.specials.clacker.capacity > 0, 'starter capacity seeded');
  assert.equal(grantedType, 'clacker');
  assert.equal(state.credits, 100, 'cost debited');
  assert.equal(state.upgrades[def.id], 1, 'row marked owned');

  // ...and the spawn planner now actually schedules clackers (feature is live).
  const plan = specialSpawnPlan(state.specials, { clacker: 0, splitter: 0, burster: 0 }, SPECIAL_CAP);
  assert.ok(plan.clacker > 0, 'specialSpawnPlan must schedule clackers after unlock');
});

test('buySpecialUnlock refuses when unaffordable and changes nothing', () => {
  const def = UPGRADES.find((u) => u.unlock === 'splitter');
  const state = { credits: 0, upgrades: {}, specials: freshSpecials() };
  let granted = 0;
  const ok = buySpecialUnlock(state, def.id, () => { granted++; });
  assert.equal(ok, false);
  assert.equal(state.specials.splitter.unlocked, false);
  assert.equal(granted, 0);
  assert.equal(state.credits, 0);
});

test('buySpecialUnlock refuses a re-buy of an already-unlocked type', () => {
  const def = UPGRADES.find((u) => u.unlock === 'burster');
  const state = { credits: 1e9, upgrades: {}, specials: freshSpecials() };
  state.specials.burster.unlocked = true;
  let granted = 0;
  const ok = buySpecialUnlock(state, def.id, () => { granted++; });
  assert.equal(ok, false);
  assert.equal(granted, 0);
  assert.equal(state.credits, 1e9, 'no debit on a refused re-buy');
});

test('buySpecialUnlock returns false for a non-unlock upgrade id', () => {
  const state = { credits: 1e9, upgrades: {}, specials: freshSpecials() };
  const ok = buySpecialUnlock(state, 'globalValueMult', () => {});
  assert.equal(ok, false);
});

test('statCardLines formats the four headline numbers', () => {
  const lines = statCardLines({
    lifetimeCores: 1234,
    peakCombo: 9,
    biggestBallCount: 4500,
    runEarnings: 4.5e15,
  });
  assert.deepEqual(lines, [
    'Lifetime Cores  1.2K',
    'Peak Combo  x10',
    'Most Balls  4.5K',
    'Run Earnings  4.5Qa',
  ]);
});

test('statCardLines is resilient to missing stats (treats as 0)', () => {
  const lines = statCardLines({});
  assert.deepEqual(lines, [
    'Lifetime Cores  0',
    'Peak Combo  x1',
    'Most Balls  0',
    'Run Earnings  0',
  ]);
});

test('effectLabel: mul shows ×N.NN', () => {
  const def = { effectKind: 'mul', effectStep: 0.5 };
  assert.equal(effectLabel(def, 1), '×1.50'); // (1+0.5)^1
  assert.equal(effectLabel(def, 0), '×1.00');
});

test('effectLabel: integer additive shows +N', () => {
  assert.equal(effectLabel({ effectKind: 'add', effectStep: 1 }, 4), '+4');
});

test('effectLabel: fractional additive shows the real value (the +0 bug)', () => {
  const valueMult = { effectKind: 'add', effectStep: 0.25 };
  assert.equal(effectLabel(valueMult, 6), '+1.5'); // was floored to "+1"/"+0"
  assert.equal(effectLabel(valueMult, 4), '+1');   // exactly integer
  const golden = { effectKind: 'add', effectStep: 0.0025 };
  assert.equal(effectLabel(golden, 1), '+0.0025'); // was hidden as "+0"
});

test('effectLabel: unlock rows have no effect label', () => {
  assert.equal(effectLabel({ unlock: 'clacker', effectKind: 'add', effectStep: 0 }, 0), '');
});

test('effectLabel renders the respawn interval for interval upgrades', () => {
  const def = { effectKind: 'interval', intervalBase: 1.0, effectStep: 0.1 };
  assert.equal(effectLabel(def, 0), '1.0s');
  assert.equal(effectLabel(def, 5), '0.5s');
  assert.equal(effectLabel(def, 10), '0.0s');
});

function shopState() {
  return { credits: 1e9, upgrades: { globalValueMult: 4 },
    specials: { clacker: { unlocked: true }, splitter: { unlocked: false }, burster: { unlocked: false } } };
}
test('creditsRowModel: one row per UPGRADES entry with derived display fields', () => {
  const rows = creditsRowModel(shopState());
  assert.equal(rows.length, UPGRADES.length);
  const vm = rows.find((r) => r.id === 'globalValueMult');
  assert.equal(vm.label, 'Value Multiplier (Lv 4)');
  assert.equal(vm.effectText, '+1'); // 0.25*4, via effectLabel
  assert.equal(vm.afford, true);     // 1e9 credits
  const clk = rows.find((r) => r.id === 'unlockClacker');
  assert.equal(clk.isUnlock, true);
  assert.equal(clk.effectText, 'OWNED'); // already unlocked in shopState
  assert.equal(clk.maxed, true);
});

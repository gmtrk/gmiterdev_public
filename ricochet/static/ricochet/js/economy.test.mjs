import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEventMult, creditsFromCounters, updateCombo, upgradeCost, upgradeEffect,
  applyUpgradeEffects, coresFromRun, canPrestige,
} from './economy.js';
import { buildWorld } from './physics.js';
import { EVENT_CAP, SURFACE_BASE, COMBO, UPGRADES, BASE_CAPACITY, GOLDEN, KICK, ARENA_W, PRESTIGE, SPAWN_RATE_MAX } from './config.js';

test('computeEventMult is 1 + sum of bonuses when under the cap', () => {
  assert.equal(computeEventMult(2, 3, 1), 1 + 6);
});

test('computeEventMult caps at 1 + EVENT_CAP with huge inputs', () => {
  assert.equal(computeEventMult(1e9, 1e9, 1e9), 1 + EVENT_CAP);
});

test('computeEventMult honors an explicit cap override', () => {
  assert.equal(computeEventMult(100, 100, 100, 5), 1 + 5);
});

test('computeEventMult is exactly 1 with no events', () => {
  assert.equal(computeEventMult(0, 0, 0), 1);
});

test('creditsFromCounters sums surface*base*globalValueMult*eventMult', () => {
  const counters = { wall: 2, peg: 3, block: 1, goldenBonus: 0, breakBonus: 0 };
  // (2*1 + 3*2 + 1*25) = 33 ; *2 *3 = 198
  assert.equal(creditsFromCounters(counters, SURFACE_BASE, 2, 3), 198);
});

test('creditsFromCounters ignores bonus fields on the counters object', () => {
  const counters = { wall: 0, peg: 0, block: 0, goldenBonus: 99, breakBonus: 99 };
  assert.equal(creditsFromCounters(counters, SURFACE_BASE, 5, 5), 0);
});

const COMBO_CFG = {
  gainPerSec: COMBO.gainPerSec,
  decayPerSec: COMBO.decayPerSec,
  perStepGainCap: COMBO.perStepGainCap,
  gainFalloff: COMBO.gainFalloff,
  cap: COMBO.capBonusStart,
};

test('updateCombo gains gradually, never instantly to the cap', () => {
  const next = updateCombo(0, true, 1 / 60, COMBO_CFG);
  assert.ok(next > 0, `expected gain, got ${next}`);
  assert.ok(next <= COMBO.perStepGainCap, `gain per step must be capped, got ${next}`);
  assert.ok(next < COMBO.capBonusStart, 'one step must not reach the cap');
});

test('updateCombo gain shrinks as combo rises (diminishing returns)', () => {
  const dt = 1 / 60;
  const lowGain = updateCombo(0, true, dt, COMBO_CFG) - 0;
  const highGain = updateCombo(10, true, dt, COMBO_CFG) - 10;
  assert.ok(highGain > 0, `still gains at high combo, got ${highGain}`);
  assert.ok(highGain < lowGain, `gain at combo 10 (${highGain}) must be < at combo 0 (${lowGain})`);
});

test('updateCombo decays gradually but never hard-resets below 0', () => {
  const start = 5;
  const next = updateCombo(start, false, 1 / 60, COMBO_CFG);
  assert.ok(next < start, 'should decay when not scoring');
  assert.ok(next > 0, `must not hard-reset to 0 in one step, got ${next}`);
});

test('updateCombo clamps decay at 0 (never negative)', () => {
  const next = updateCombo(0.001, false, 1, COMBO_CFG);
  assert.equal(next, 0);
});

test('updateCombo clamps gain at cap (regression: capBonus/capBonusStart key mismatch)', () => {
  const next = updateCombo(COMBO.capBonusStart, true, 1, COMBO_CFG);
  assert.equal(next, COMBO.capBonusStart);
});

const VALUE_DEF = UPGRADES.find((u) => u.id === 'globalValueMult');
const CAP_DEF = UPGRADES.find((u) => u.id === 'ballCapacity');

test('upgradeCost is baseCost at level 0 and grows geometrically', () => {
  assert.equal(upgradeCost(VALUE_DEF, 0), 50);
  assert.ok(Math.abs(upgradeCost(VALUE_DEF, 1) - 50 * 1.18) < 1e-9);
  assert.ok(Math.abs(upgradeCost(VALUE_DEF, 3) - 50 * 1.18 ** 3) < 1e-9);
});

test('upgradeEffect additive: step*level', () => {
  assert.equal(upgradeEffect(CAP_DEF, 0), 0);
  assert.equal(upgradeEffect(CAP_DEF, 3), 3);
  assert.ok(Math.abs(upgradeEffect(VALUE_DEF, 4) - 1.0) < 1e-9); // 0.25*4
});

test('upgradeEffect multiplicative: (1+step)^level', () => {
  const mulDef = { id: 'x', effectKind: 'mul', effectStep: 0.5 };
  assert.equal(upgradeEffect(mulDef, 0), 1);
  assert.equal(upgradeEffect(mulDef, 1), 1.5);
  assert.ok(Math.abs(upgradeEffect(mulDef, 2) - 2.25) < 1e-9);
});

test('marginal ROI of globalValueMult lever is monotonically decreasing', () => {
  let prevRoi = Infinity;
  for (let level = 0; level < 25; level++) {
    const dEffect = upgradeEffect(VALUE_DEF, level + 1) - upgradeEffect(VALUE_DEF, level);
    const dCost = upgradeCost(VALUE_DEF, level + 1) - upgradeCost(VALUE_DEF, level);
    const roi = dEffect / dCost;
    assert.ok(roi < prevRoi, `ROI must strictly decrease at level ${level}: ${roi} !< ${prevRoi}`);
    prevRoi = roi;
  }
});

test('upgradeEffect interval returns the respawn interval, floored at 0', () => {
  const def = { effectKind: 'interval', intervalBase: 1.0, effectStep: 0.1 };
  assert.ok(Math.abs(upgradeEffect(def, 0) - 1.0) < 1e-9);
  assert.ok(Math.abs(upgradeEffect(def, 5) - 0.5) < 1e-9);
  assert.equal(upgradeEffect(def, 10), 0);
  assert.equal(upgradeEffect(def, 20), 0); // never negative past max
});

test('applyUpgradeEffects maps spawnRate level to balls/sec via interval', () => {
  const state = freshState();
  const world = buildWorld(state);
  state.upgrades.spawnRate = 0; applyUpgradeEffects(world, state);
  assert.ok(Math.abs(world.spawnRate - 1) < 1e-9, '1.0s interval -> 1 ball/sec');
  state.upgrades.spawnRate = 5; applyUpgradeEffects(world, state);
  assert.ok(Math.abs(world.spawnRate - 2) < 1e-9, '0.5s interval -> 2 balls/sec');
  state.upgrades.spawnRate = 10; applyUpgradeEffects(world, state);
  assert.equal(world.spawnRate, SPAWN_RATE_MAX, 'interval 0 -> instant (sentinel)');
});

function freshState() {
  return {
    version: 1,
    credits: 0,
    cores: 0,
    lifetimeCores: 0,
    upgrades: {},
    specials: {
      clacker: { unlocked: false, capacity: 0 },
      splitter: { unlocked: false, capacity: 0 },
      burster: { unlocked: false, capacity: 0 },
    },
    coresShop: {},
    placed: { pegs: [], blocks: [], paddle: { x: ARENA_W / 2, width: 120 } },
    stats: { recentEarnRate: 0, lastSaveTime: 0, lastSubmittedCores: 0 },
  };
}

test('applyUpgradeEffects sets baseline derived stats from an empty save', () => {
  const state = freshState();
  const world = buildWorld(state);
  applyUpgradeEffects(world, state);
  assert.equal(world.globalValueMult, 1, 'no upgrades -> mult 1');
  assert.equal(world.baseCapacity, BASE_CAPACITY);
  assert.ok(Math.abs(world.goldenChance - GOLDEN.chance) < 1e-12);
  assert.equal(world.kick, KICK);
  assert.ok(world.budgets.pegs >= 0);
  assert.ok(world.budgets.blocks >= 0);
});

test('buying globalValueMult levels raises world.globalValueMult (Credits shop)', () => {
  const state = freshState();
  const world = buildWorld(state);
  applyUpgradeEffects(world, state);
  const before = world.globalValueMult;
  state.upgrades.globalValueMult = 4; // +0.25*4 = +1.0
  applyUpgradeEffects(world, state);
  assert.ok(Math.abs(world.globalValueMult - (before + 1.0)) < 1e-9);
});

test('Cores power mult compounds multiplicatively into globalValueMult', () => {
  const state = freshState();
  state.upgrades.globalValueMult = 4;   // credits side -> base 2.0
  state.coresShop.globalValueMult = 1;  // cores mul -> (1+0.5)^1 = 1.5
  const world = buildWorld(state);
  applyUpgradeEffects(world, state);
  // (1 + 0.25*4) * (1.5) = 2.0 * 1.5 = 3.0
  assert.ok(Math.abs(world.globalValueMult - 3.0) < 1e-9);
});

test('buying ballCapacity and Cores baseCapacity raises world.baseCapacity', () => {
  const state = freshState();
  const world = buildWorld(state);
  applyUpgradeEffects(world, state);
  state.upgrades.ballCapacity = 3;   // +3
  state.coresShop.baseCapacity = 2;  // +2*2 = +4
  applyUpgradeEffects(world, state);
  assert.equal(world.baseCapacity, BASE_CAPACITY + 3 + 4);
});

test('buying goldenChance (credits + cores) raises world.goldenChance', () => {
  const state = freshState();
  const world = buildWorld(state);
  state.upgrades.goldenChance = 2;   // +0.0025*2 = +0.005
  state.coresShop.goldenChance = 1;  // +0.005
  applyUpgradeEffects(world, state);
  assert.ok(Math.abs(world.goldenChance - (GOLDEN.chance + 0.005 + 0.005)) < 1e-12);
});

test('buying budgets/kick raises the matching derived stats', () => {
  const state = freshState();
  const world = buildWorld(state);
  applyUpgradeEffects(world, state);
  const pegB = world.budgets.pegs;
  const blockB = world.budgets.blocks;
  const kick = world.kick;
  state.upgrades.pegBudget = 2;     // +2
  state.upgrades.blockBudget = 3;   // +3
  state.upgrades.pegKick = 2;       // +20
  applyUpgradeEffects(world, state);
  assert.equal(world.budgets.pegs, pegB + 2);
  assert.equal(world.budgets.blocks, blockB + 3);
  assert.equal(world.kick, kick + 20);
});

test('buying Cores startCreditsMult raises world.startCreditsMult above 1 (multiplicative)', () => {
  const state = freshState();
  const world = buildWorld(state);
  applyUpgradeEffects(world, state);
  assert.equal(world.startCreditsMult, 1, 'unbought head-start multiplier is 1x');
  state.coresShop.startCreditsMult = 2; // mul, step 1 -> (1+1)^2 = 4
  applyUpgradeEffects(world, state);
  assert.ok(world.startCreditsMult > 1, 'buying the cores level increases the start multiplier');
  assert.ok(Math.abs(world.startCreditsMult - 4) < 1e-9);
});

test('buying Cores offline levels makes world.offline*Add non-zero', () => {
  const state = freshState();
  const world = buildWorld(state);
  applyUpgradeEffects(world, state);
  assert.equal(world.offlineEfficiencyAdd, 0, 'unbought offline efficiency add is 0');
  assert.equal(world.offlineCapAdd, 0, 'unbought offline cap add is 0');
  state.coresShop.offlineEfficiencyAdd = 3; // add, step 0.05 -> 0.15
  state.coresShop.offlineCapAdd = 2;        // add, step 3600 -> 7200
  applyUpgradeEffects(world, state);
  assert.ok(world.offlineEfficiencyAdd > 0, 'offline efficiency add becomes non-zero');
  assert.ok(world.offlineCapAdd > 0, 'offline cap add becomes non-zero');
  assert.ok(Math.abs(world.offlineEfficiencyAdd - 0.15) < 1e-9);
  assert.equal(world.offlineCapAdd, 7200);
});

test('coresFromRun matches the contract anchor values with defaults', () => {
  assert.equal(coresFromRun(1e9), 1);
  assert.equal(coresFromRun(1e12), 31);   // floor(sqrt(1000)) = 31
  assert.equal(coresFromRun(1e15), 1000); // floor(sqrt(1e6)) = 1000
});

test('coresFromRun floors and is 0 below one core', () => {
  assert.equal(coresFromRun(0), 0);
  assert.equal(coresFromRun(5e8), 0); // sqrt(0.5) < 1 -> floor 0
});

test('coresFromRun honors coreK and coreScale overrides', () => {
  assert.equal(coresFromRun(4e9, 2, 1e9), 4); // 2*sqrt(4) = 4
});

test('canPrestige gates at PRESTIGE.minCredits', () => {
  assert.equal(canPrestige(PRESTIGE.minCredits), true);
  assert.equal(canPrestige(PRESTIGE.minCredits - 1), false);
  assert.equal(canPrestige(0), false);
});

test('canPrestige honors an explicit min override', () => {
  assert.equal(canPrestige(100, 100), true);
  assert.equal(canPrestige(99, 100), false);
});

test('buying ramps raises world.rampsLevel', () => {
  const state = freshState();
  const world = buildWorld(state);
  applyUpgradeEffects(world, state);
  assert.equal(world.rampsLevel, 0);
  state.upgrades.midRamps = 1;
  applyUpgradeEffects(world, state);
  assert.equal(world.rampsLevel, 1);
});

test('buying rampAngleUnlock flips world.rampAngleUnlocked', () => {
  const state = freshState();
  const world = buildWorld(state);
  applyUpgradeEffects(world, state);
  assert.equal(world.rampAngleUnlocked, false);
  state.upgrades.rampAngleUnlock = 1;
  applyUpgradeEffects(world, state);
  assert.equal(world.rampAngleUnlocked, true);
});

test('pegBudget grants +1 peg per level (per-peg pricing)', () => {
  const state = freshState();
  const world = buildWorld(state);
  applyUpgradeEffects(world, state);
  const base = world.budgets.pegs;
  state.upgrades.pegBudget = 3;
  applyUpgradeEffects(world, state);
  assert.equal(world.budgets.pegs, base + 3); // +1 per level, not +4
});

test('pegSpread upgrade widens world.pegSpread pitchX/pitchY', () => {
  const state = freshState();
  const world = buildWorld(state);
  applyUpgradeEffects(world, state);
  const baseX = world.pegSpread.pitchX;
  const baseY = world.pegSpread.pitchY;
  state.upgrades.pegSpread = 2;
  applyUpgradeEffects(world, state);
  assert.equal(world.pegSpread.pitchX, baseX + 12); // +6/level
  assert.equal(world.pegSpread.pitchY, baseY + 12);
});

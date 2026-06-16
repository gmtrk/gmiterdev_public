import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEventMult, creditsFromCounters, updateCombo, upgradeCost, upgradeEffect } from './economy.js';
import { EVENT_CAP, SURFACE_BASE, COMBO, UPGRADES } from './config.js';

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
  // (2*1 + 3*5 + 1*25) = 42 ; *2 *3 = 252
  assert.equal(creditsFromCounters(counters, SURFACE_BASE, 2, 3), 252);
});

test('creditsFromCounters ignores bonus fields on the counters object', () => {
  const counters = { wall: 0, peg: 0, block: 0, goldenBonus: 99, breakBonus: 99 };
  assert.equal(creditsFromCounters(counters, SURFACE_BASE, 5, 5), 0);
});

test('updateCombo gains gradually, never instantly to the cap', () => {
  const next = updateCombo(0, true, 1 / 60, COMBO);
  assert.ok(next > 0, `expected gain, got ${next}`);
  assert.ok(next <= COMBO.perStepGainCap, `gain per step must be capped, got ${next}`);
  assert.ok(next < COMBO.capBonusStart, 'one step must not reach the cap');
});

test('updateCombo decays gradually but never hard-resets below 0', () => {
  const start = 5;
  const next = updateCombo(start, false, 1 / 60, COMBO);
  assert.ok(next < start, 'should decay when not scoring');
  assert.ok(next > 0, `must not hard-reset to 0 in one step, got ${next}`);
});

test('updateCombo clamps decay at 0 (never negative)', () => {
  const next = updateCombo(0.001, false, 1, COMBO);
  assert.equal(next, 0);
});

test('updateCombo clamps gain at capBonusStart', () => {
  const next = updateCombo(COMBO.capBonusStart, true, 1, COMBO);
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

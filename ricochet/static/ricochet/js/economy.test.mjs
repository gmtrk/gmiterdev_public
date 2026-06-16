import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEventMult, creditsFromCounters, updateCombo } from './economy.js';
import { EVENT_CAP, SURFACE_BASE, COMBO } from './config.js';

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

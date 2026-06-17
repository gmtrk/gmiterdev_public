import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFLINE } from './config.js';
import {
  updateEarnRate,
  smoothRate,
  clampAwaySeconds,
  offlineEfficiency,
  offlineCredits,
  computeOffline,
  grantOffline,
} from './offline.js';

test('updateEarnRate moves the EMA toward the steady sample', () => {
  // Steady input at 100/s should pull a 0 EMA upward but not all the way in one step.
  const next = updateEarnRate(0, 100, 1, OFFLINE.emaHalfLifeSec);
  assert.ok(next > 0 && next < 100);
});

test('updateEarnRate converges to a sustained rate over many samples', () => {
  let rate = 0;
  for (let i = 0; i < 6000; i++) rate = updateEarnRate(rate, 100, 1, OFFLINE.emaHalfLifeSec);
  assert.ok(Math.abs(rate - 100) < 1, `expected ~100, got ${rate}`);
});

test('updateEarnRate is spike-resistant: one jackpot moves the rate < 5%', () => {
  // Establish a steady 100/s baseline.
  let rate = 0;
  for (let i = 0; i < 6000; i++) rate = updateEarnRate(rate, 100, 1, OFFLINE.emaHalfLifeSec);
  const before = rate;
  // A single dt=1s sample 1000x the baseline (golden/burst jackpot) is down-weighted.
  const after = updateEarnRate(rate, 100000, 1, OFFLINE.emaHalfLifeSec);
  const movePct = (after - before) / before;
  assert.ok(movePct < 0.05, `single spike moved rate ${(movePct * 100).toFixed(2)}%, want < 5%`);
});

test('clampAwaySeconds: negative (future-dated save) -> 0', () => {
  const now = 1000;
  const lastSave = 5000; // save is in the "future" relative to now
  assert.equal(clampAwaySeconds(now, lastSave, OFFLINE.capSeconds), 0);
});

test('clampAwaySeconds: beyond the cap -> cap', () => {
  const now = (OFFLINE.capSeconds + 10000) * 1000; // ms
  const lastSave = 0;
  assert.equal(clampAwaySeconds(now, lastSave, OFFLINE.capSeconds), OFFLINE.capSeconds);
});

test('clampAwaySeconds: normal gap -> seconds elapsed', () => {
  const now = 60_000;      // ms
  const lastSave = 0;      // ms
  assert.equal(clampAwaySeconds(now, lastSave, OFFLINE.capSeconds), 60);
});

test('offlineEfficiency starts at base 0.30 and is raised by cores add', () => {
  assert.equal(offlineEfficiency(0), OFFLINE.efficiencyBase);
  assert.equal(offlineEfficiency(0.2), OFFLINE.efficiencyBase + 0.2);
});

test('offlineCredits = rate * away * efficiency', () => {
  // 50/s for 100s at base 0.30 efficiency.
  assert.equal(offlineCredits(50, 100, 0.30), 50 * 100 * 0.30);
});

test('computeOffline returns 0 credits and showModal=false with no rate', () => {
  const res = computeOffline({ recentEarnRate: 0, lastSaveTime: 0 }, 1_000_000, 0, 0);
  assert.equal(res.credits, 0);
  assert.equal(res.showModal, false);
});

test('computeOffline rejects a future-dated save (now < lastSaveTime) -> 0, no modal', () => {
  const res = computeOffline({ recentEarnRate: 100, lastSaveTime: 5_000_000 }, 1_000_000, 0, 0);
  assert.equal(res.awaySeconds, 0);
  assert.equal(res.credits, 0);
  assert.equal(res.showModal, false);
});

test('computeOffline computes credits for a normal gap with base efficiency', () => {
  // away = 100s, rate = 50/s, efficiency = base 0.30 (no cores add).
  const res = computeOffline({ recentEarnRate: 50, lastSaveTime: 0 }, 100_000, 0, 0);
  assert.equal(res.awaySeconds, 100);
  assert.equal(res.efficiency, OFFLINE.efficiencyBase);
  assert.equal(res.credits, 50 * 100 * 0.30);
  assert.equal(res.showModal, true);
});

test('grantOffline credits state.credits once and advances lastSaveTime', () => {
  const state = { credits: 1000, stats: { recentEarnRate: 50, lastSaveTime: 0 } };
  const now = 100_000; // ms
  const granted = grantOffline(state, 1500, now);
  assert.equal(granted, 1500);
  assert.equal(state.credits, 2500);
  assert.equal(state.stats.lastSaveTime, now);
});

test('grantOffline is grant-once: re-collecting after lastSaveTime advance yields ~0', () => {
  const state = { credits: 1000, stats: { recentEarnRate: 50, lastSaveTime: 0 } };
  const now = 100_000;
  grantOffline(state, 1500, now);
  // Re-running computeOffline with the advanced lastSaveTime and the same `now` -> 0 away.
  const again = computeOffline(state.stats, now, 0, 0);
  assert.equal(again.awaySeconds, 0);
  assert.equal(again.credits, 0);
});

test('smoothRate: converges toward a constant sample over many steps', () => {
  let r = 0;
  for (let i = 0; i < 600; i++) r = smoothRate(r, 100, 1 / 60, 1.0);
  assert.ok(Math.abs(r - 100) < 1, `expected ~100, got ${r}`);
});

test('smoothRate: a single zero sample after a high rate does NOT collapse to 0', () => {
  const r = smoothRate(100, 0, 1 / 60, 1.0);
  assert.ok(r > 98, `one zero step dropped the rate too far: ${r}`);
});

test('smoothRate: symmetric — rises and falls at the same alpha', () => {
  const up = smoothRate(0, 100, 1 / 60, 1.0);
  const down = 100 - smoothRate(100, 0, 1 / 60, 1.0);
  assert.ok(Math.abs(up - down) < 1e-9, 'EMA must be symmetric for a display value');
});

test('smoothRate: guards non-positive dt / halfLife (returns prev)', () => {
  assert.equal(smoothRate(50, 999, 0, 1.0), 50);
  assert.equal(smoothRate(50, 999, 1 / 60, 0), 50);
});

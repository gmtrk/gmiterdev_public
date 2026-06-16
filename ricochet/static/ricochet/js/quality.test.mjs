import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualityCeiling, QUALITY_LOW_FACTOR, QUALITY_MIN_CEILING } from './quality.js';
import { adaptCeiling } from './gameloop.js';
import { CEILING_DESKTOP, RESERVED_OWNED, FRAME_BUDGET_MS } from './config.js';

test('high quality keeps the full ceiling', () => {
  assert.equal(qualityCeiling(CEILING_DESKTOP, false), CEILING_DESKTOP);
});

test('low quality lowers the ceiling by QUALITY_LOW_FACTOR', () => {
  assert.equal(qualityCeiling(CEILING_DESKTOP, true), Math.floor(CEILING_DESKTOP * QUALITY_LOW_FACTOR));
});

test('low-quality ceiling never drops below QUALITY_MIN_CEILING', () => {
  const out = qualityCeiling(QUALITY_MIN_CEILING, true);
  assert.equal(out, QUALITY_MIN_CEILING);
  assert.ok(out >= QUALITY_MIN_CEILING);
});

test('low-quality ceiling always leaves room above RESERVED_OWNED', () => {
  assert.ok(qualityCeiling(CEILING_DESKTOP, true) > RESERVED_OWNED);
  assert.ok(QUALITY_MIN_CEILING > RESERVED_OWNED);
});

test('quality toggle composes with adaptive reducer: low quality + budget pressure both lower ceiling', () => {
  // start at desktop ceiling, low-quality clamp first, then adaptive pressure.
  // adaptCeiling's Phase 4 signature is (ceiling, frameMs, budgetMs, min, max) — positional.
  const lowQ = qualityCeiling(CEILING_DESKTOP, true);
  const underPressure = adaptCeiling(lowQ, FRAME_BUDGET_MS * 2, FRAME_BUDGET_MS, RESERVED_OWNED, CEILING_DESKTOP);
  assert.ok(underPressure < lowQ, `expected pressure to lower ${lowQ}, got ${underPressure}`);
  assert.ok(underPressure >= RESERVED_OWNED);
});

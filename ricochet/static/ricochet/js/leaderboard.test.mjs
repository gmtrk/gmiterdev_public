import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LB_HARD_MAX, clampCores } from './leaderboard.js';

test('LB_HARD_MAX matches the server bound and is a safe integer', () => {
  assert.equal(LB_HARD_MAX, 1e12);
  assert.ok(LB_HARD_MAX <= Number.MAX_SAFE_INTEGER);
});

test('clampCores floors fractional values to an integer', () => {
  assert.equal(clampCores(412.9), 412);
});

test('clampCores keeps in-range integers unchanged', () => {
  assert.equal(clampCores(0), 0);
  assert.equal(clampCores(380), 380);
  assert.equal(clampCores(LB_HARD_MAX), LB_HARD_MAX);
});

test('clampCores clamps negatives up to 0', () => {
  assert.equal(clampCores(-5), 0);
});

test('clampCores clamps values above the hard max down to the hard max', () => {
  assert.equal(clampCores(LB_HARD_MAX + 1), LB_HARD_MAX);
  assert.equal(clampCores(9e18), LB_HARD_MAX);
});

test('clampCores coerces non-finite / non-numeric input to 0', () => {
  assert.equal(clampCores(NaN), 0);
  assert.equal(clampCores(Infinity), LB_HARD_MAX);
  assert.equal(clampCores(-Infinity), 0);
  assert.equal(clampCores(undefined), 0);
  assert.equal(clampCores(null), 0);
  assert.equal(clampCores('abc'), 0);
});

test('clampCores reads numeric strings', () => {
  assert.equal(clampCores('500'), 500);
});

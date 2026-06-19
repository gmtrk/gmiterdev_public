import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointsForRecognition, roundTotal } from './scoring.js';

test('floors seconds left', () => {
  assert.equal(pointsForRecognition(13.9), 13);
  assert.equal(pointsForRecognition(0.4), 0);
});

test('clamps to [0, roundSeconds]', () => {
  assert.equal(pointsForRecognition(-2), 0);
  assert.equal(pointsForRecognition(999, 20), 20);
});

test('roundTotal sums points', () => {
  assert.equal(roundTotal([{ points: 13 }, { points: 0 }, { points: 17 }]), 30);
  assert.equal(roundTotal([]), 0);
});

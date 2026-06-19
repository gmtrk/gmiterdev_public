import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canJoin, clampPoints, validInitials } from './leaderboard.js';

test('canJoin requires not-joined and >=1 point', () => {
  assert.equal(canJoin({ playerId: '', bestPoints: 5 }), true);
  assert.equal(canJoin({ playerId: 'p', bestPoints: 5 }), false);
  assert.equal(canJoin({ playerId: '', bestPoints: 0 }), false);
});

test('clampPoints floors into range', () => {
  assert.equal(clampPoints(13.9), 13);
  assert.equal(clampPoints(-4), 0);
  assert.equal(clampPoints(NaN), 0);
});

test('validInitials matches 3 uppercase letters', () => {
  assert.equal(validInitials('ABC'), true);
  assert.equal(validInitials('ab'), false);
  assert.equal(validInitials('A1C'), false);
});

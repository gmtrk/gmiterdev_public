import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeThrottle } from './throttle.js';

// makeThrottle(intervalMs) -> (nowMs) => boolean.
// Returns true when at least intervalMs has elapsed since the last `true`,
// and the FIRST call always returns true (so the HUD paints immediately).
test('first call always passes', () => {
  const gate = makeThrottle(166); // ~6 Hz
  assert.equal(gate(1000), true);
});

test('a second call before the interval is blocked', () => {
  const gate = makeThrottle(166);
  gate(1000);
  assert.equal(gate(1100), false); // 100ms < 166ms
});

test('a call after the interval passes and re-arms the gate', () => {
  const gate = makeThrottle(166);
  gate(1000);
  assert.equal(gate(1200), true); // 200ms >= 166ms
  assert.equal(gate(1300), false); // 100ms since last pass -> blocked
});

test('passing exactly at the interval boundary is allowed', () => {
  const gate = makeThrottle(100);
  gate(0);
  assert.equal(gate(100), true);
});

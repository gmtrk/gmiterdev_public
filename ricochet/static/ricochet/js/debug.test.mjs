import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampLevel, sliderRange, clampSlider, SLIDER_KEYS } from './debug.js';
import { GRAVITY, DRAG, MAX_SPEED } from './config.js';

test('clampLevel clamps to [0, max]', () => {
  assert.equal(clampLevel(5, 9), 5);
  assert.equal(clampLevel(-3, 9), 0);   // never below 0
  assert.equal(clampLevel(12, 9), 9);   // capped at max
  assert.equal(clampLevel(9, 9), 9);    // inclusive upper bound
});

test('clampLevel with no max is unbounded above but still floored at 0', () => {
  assert.equal(clampLevel(1000, undefined), 1000);
  assert.equal(clampLevel(1000, null), 1000);
  assert.equal(clampLevel(-5, undefined), 0);
});

test('clampLevel rounds nothing — returns the integer arithmetic it is given', () => {
  // callers pass (level ± 1); confirm exact pass-through within range
  assert.equal(clampLevel(0 + 1, 1), 1);
  assert.equal(clampLevel(1 - 1, 1), 0);
  assert.equal(clampLevel(1 + 1, 1), 1); // max:1 unlock rows can't exceed 1
});

test('sliderRange returns a {worldKey,min,max,step,value} descriptor seeded from config', () => {
  const g = sliderRange('gravity');
  assert.equal(g.worldKey, 'gravity');
  assert.equal(g.value, GRAVITY);
  assert.ok(g.min <= GRAVITY && GRAVITY <= g.max);

  const d = sliderRange('drag');
  assert.equal(d.worldKey, 'drag');
  assert.equal(d.value, DRAG);
  assert.ok(d.min <= DRAG && DRAG <= d.max);

  const ms = sliderRange('maxSpeed');
  assert.equal(ms.value, MAX_SPEED);

  const sr = sliderRange('spawnRate');
  assert.equal(sr.worldKey, 'spawnRate');
});

test('sliderRange returns undefined for an unknown key', () => {
  assert.equal(sliderRange('nope'), undefined);
});

test('every SLIDER_KEYS entry has a valid range with min < max and positive step', () => {
  for (const key of SLIDER_KEYS) {
    const r = sliderRange(key);
    assert.ok(r, `missing range for ${key}`);
    assert.ok(r.min < r.max, `${key}: min < max`);
    assert.ok(r.step > 0, `${key}: step > 0`);
    assert.ok(r.min <= r.value && r.value <= r.max, `${key}: default in range`);
  }
});

test('clampSlider maps a raw value into the key range', () => {
  assert.equal(clampSlider('drag', 2), 1);        // drag max is 1
  assert.equal(clampSlider('drag', 0.5), 0.8);    // drag min is 0.8
  assert.equal(clampSlider('drag', 0.95), 0.95);  // in-range untouched
  assert.equal(clampSlider('gravity', -100), 0);  // gravity min is 0
});

test('clampSlider passes through an unknown key unchanged', () => {
  assert.equal(clampSlider('nope', 42), 42);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motionProfile, FULL_MOTION, REDUCED_MOTION } from './motion.js';

test('full motion when neither reduced-motion nor low-quality', () => {
  const p = motionProfile({ reducedMotion: false, lowQuality: false });
  assert.deepEqual(p, FULL_MOTION);
  assert.equal(p.trails, true);
  assert.equal(p.particles, true);
  assert.equal(p.shake, true);
  assert.equal(p.trailAlpha, 0.18);
});

test('reduced-motion disables trails and shake and zeros trailAlpha', () => {
  const p = motionProfile({ reducedMotion: true, lowQuality: false });
  assert.equal(p.trails, false);
  assert.equal(p.shake, false);
  assert.equal(p.trailAlpha, 0);
});

test('reduced-motion dampens but does not fully kill particles', () => {
  const p = motionProfile({ reducedMotion: true, lowQuality: false });
  assert.equal(p.particles, true);
  assert.equal(p.particleScale, 0.25);
});

test('low-quality disables fade/shake even with full motion preference', () => {
  const p = motionProfile({ reducedMotion: false, lowQuality: true });
  assert.equal(p.trails, false);
  assert.equal(p.shake, false);
  assert.equal(p.trailAlpha, 0);
  assert.equal(p.particles, true);
});

test('reduced-motion is the strongest constraint (matches REDUCED_MOTION export)', () => {
  assert.deepEqual(motionProfile({ reducedMotion: true, lowQuality: true }), REDUCED_MOTION);
  assert.equal(REDUCED_MOTION.shake, false);
  assert.equal(FULL_MOTION.shake, true);
});

test('missing/undefined input is treated as full motion (safe default)', () => {
  assert.deepEqual(motionProfile(), FULL_MOTION);
  assert.deepEqual(motionProfile({}), FULL_MOTION);
});

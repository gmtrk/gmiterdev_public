import { test } from 'node:test';
import assert from 'node:assert/strict';
import { benchTechnique, TECHNIQUES } from './trailsbench.js';

// A counting stub that records the per-frame canvas ops the bench performs.
function makeStubCtx() {
  const calls = { clearRect: 0, fillRect: 0, drawImage: 0 };
  return {
    calls,
    canvas: { width: 1000, height: 1500 },
    fillStyle: '#000',
    globalAlpha: 1,
    clearRect() { calls.clearRect++; },
    fillRect() { calls.fillRect++; },
    drawImage() { calls.drawImage++; },
    save() {}, restore() {}, setTransform() {}, translate() {},
  };
}

const FAKE_BALLS = { count: 500, xs: new Float32Array(500), ys: new Float32Array(500) };
const FAKE_SPRITE = { width: 16, height: 16 };

test('TECHNIQUES enumerates the three candidates from spec §11', () => {
  assert.deepEqual([...TECHNIQUES].sort(), ['clear', 'fade', 'pertrail'].sort());
});

test('clear technique: one clearRect, no fade fillRect, one blit per ball', () => {
  const ctx = makeStubCtx();
  const r = benchTechnique('clear', ctx, FAKE_BALLS, FAKE_SPRITE, 1);
  assert.equal(ctx.calls.clearRect, 1);
  assert.equal(ctx.calls.fillRect, 0);
  assert.equal(ctx.calls.drawImage, FAKE_BALLS.count);
  assert.ok(Number.isFinite(r.ms), 'must report a finite ms');
  assert.equal(r.technique, 'clear');
});

test('fade technique: a full-canvas fillRect (overdraw) plus one blit per ball', () => {
  const ctx = makeStubCtx();
  benchTechnique('fade', ctx, FAKE_BALLS, FAKE_SPRITE, 1);
  assert.equal(ctx.calls.clearRect, 0);
  assert.equal(ctx.calls.fillRect, 1, 'fade does one translucent full-canvas fillRect');
  assert.equal(ctx.calls.drawImage, FAKE_BALLS.count);
});

test('per-trail technique: clear once, then N short trail blits PLUS the head blit per ball', () => {
  const ctx = makeStubCtx();
  const TRAIL_LEN = 3;
  benchTechnique('pertrail', ctx, FAKE_BALLS, FAKE_SPRITE, TRAIL_LEN);
  assert.equal(ctx.calls.clearRect, 1);
  // head + TRAIL_LEN ghosts per ball
  assert.equal(ctx.calls.drawImage, FAKE_BALLS.count * (TRAIL_LEN + 1));
});

test('runs multiple frames and aggregates (frames argument)', () => {
  const ctx = makeStubCtx();
  benchTechnique('clear', ctx, FAKE_BALLS, FAKE_SPRITE, 1, 4);
  assert.equal(ctx.calls.drawImage, FAKE_BALLS.count * 4);
});

test('unknown technique throws (no silent sketch)', () => {
  assert.throws(() => benchTechnique('nope', makeStubCtx(), FAKE_BALLS, FAKE_SPRITE, 1));
});

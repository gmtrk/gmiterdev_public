import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintBackground, BG_COLOR } from './main.js';

function fakeCtx() {
  const calls = [];
  return {
    calls,
    set fillStyle(v) { calls.push(['fillStyle', v]); },
    fillRect(x, y, w, h) { calls.push(['fillRect', x, y, w, h]); },
  };
}

test('BG_COLOR is the neon void background', () => {
  assert.equal(BG_COLOR, '#0a0a16');
});

test('paintBackground fills the whole canvas with the bg color', () => {
  const ctx = fakeCtx();
  paintBackground(ctx, 1000, 1500, BG_COLOR);
  assert.deepEqual(ctx.calls, [
    ['fillStyle', '#0a0a16'],
    ['fillRect', 0, 0, 1000, 1500],
  ]);
});

test('paintBackground defaults to BG_COLOR when no color passed', () => {
  const ctx = fakeCtx();
  paintBackground(ctx, 10, 20);
  assert.deepEqual(ctx.calls, [
    ['fillStyle', '#0a0a16'],
    ['fillRect', 0, 0, 10, 20],
  ]);
});

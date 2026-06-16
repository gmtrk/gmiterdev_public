import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, createLoop } from './gameloop.js';

const DT = 1 / 60;

test('advance: no whole step when frameDt < dt, time accumulates', () => {
  const r = advance(0, DT / 2, DT, 2);
  assert.equal(r.steps, 0);
  assert.ok(Math.abs(r.acc - DT / 2) < 1e-12);
});

test('advance: exactly one step consumes one dt, keeps remainder', () => {
  const r = advance(0, DT * 1.25, DT, 2);
  assert.equal(r.steps, 1);
  assert.ok(Math.abs(r.acc - DT * 0.25) < 1e-9);
});

test('advance: caps steps at maxSubsteps and DROPS excess time', () => {
  // 5 dt of work, cap 2 -> run 2, drop the other 3 dt entirely
  const r = advance(0, DT * 5, DT, 2);
  assert.equal(r.steps, 2);
  // remainder is the sub-dt fraction only (here 0), NOT 3*dt of debt
  assert.ok(r.acc < DT, 'excess time must be dropped, not carried');
  assert.ok(Math.abs(r.acc) < 1e-9);
});

test('advance: cap with a fractional remainder keeps only sub-dt leftover', () => {
  const r = advance(0, DT * 4.7, DT, 2);
  assert.equal(r.steps, 2);
  assert.ok(r.acc < DT);
  assert.ok(Math.abs(r.acc - DT * 0.7) < 1e-9);
});

test('createLoop.tick: drives step exactly per whole-dt and renders once per frame', () => {
  let steps = 0;
  let renders = 0;
  const loop = createLoop({
    step: () => { steps += 1; },
    render: () => { renders += 1; },
    onFrameTime: () => {},
  });
  loop.tick(0);           // first frame seeds the clock, no steps
  assert.equal(steps, 0);
  assert.equal(renders, 1);
  loop.tick(1000 / 60);   // ~one dt elapsed -> one step
  assert.equal(steps, 1);
  assert.equal(renders, 2);
  loop.tick(1000 / 60 + 1000 / 60 * 5); // 5 dt elapsed but capped at 2
  assert.equal(steps, 3); // 1 + 2
  assert.equal(renders, 3);
});

test('createLoop.tick: reports frame time to onFrameTime in ms', () => {
  const seen = [];
  const loop = createLoop({
    step: () => {},
    render: () => {},
    onFrameTime: (ms) => seen.push(ms),
  });
  loop.tick(0);
  loop.tick(16.7);
  assert.equal(seen.length, 2);
  assert.equal(seen[1], 16.7);
});

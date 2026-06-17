import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from './grid.js';

test('constructs with the right number of cells', () => {
  const g = new Grid(100, 100, 50); // 2x2 = 4 cells
  assert.equal(g.cols, 2);
  assert.equal(g.rows, 2);
  assert.equal(g.cellCount.length, 4);
  assert.equal(g.cellStart.length, 4);
});

test('forEachNeighbor visits points in the query cell and adjacent cells', () => {
  const g = new Grid(100, 100, 50);
  // point 0 in cell (0,0); point 1 in cell (1,1) [adjacent diag]; point 2 far is N/A in 2x2
  const xs = new Float32Array([10, 60, 60]);
  const ys = new Float32Array([10, 60, 10]);
  g.rebuild(xs, ys, 3);

  const seen = [];
  g.forEachNeighbor(10, 10, (i) => seen.push(i));
  seen.sort((a, b) => a - b);
  // querying (0,0) scans cells (0,0),(1,0),(0,1),(1,1): all three points qualify
  assert.deepEqual(seen, [0, 1, 2]);
});

test('forEachNeighbor excludes points outside the 3x3 neighborhood', () => {
  const g = new Grid(300, 300, 50); // 6x6 cells
  const xs = new Float32Array([25, 275]); // cell (0,0) and cell (5,5)
  const ys = new Float32Array([25, 275]);
  g.rebuild(xs, ys, 2);

  const seen = [];
  g.forEachNeighbor(25, 25, (i) => seen.push(i));
  assert.deepEqual(seen, [0]); // far point in (5,5) is not a neighbor of (0,0)
});

test('rebuild is allocation-free: buffers are reused across rebuilds', () => {
  const g = new Grid(100, 100, 50);
  const startBuf = g.cellStart;
  const countBuf = g.cellCount;
  const indexBuf = g.ballIndex;

  g.rebuild(new Float32Array([10]), new Float32Array([10]), 1);
  g.rebuild(new Float32Array([10, 60]), new Float32Array([10, 60]), 2);

  assert.equal(g.cellStart, startBuf);
  assert.equal(g.cellCount, countBuf);
  assert.equal(g.ballIndex, indexBuf);
});

test('rebuild resets counts so stale points do not leak across rebuilds', () => {
  const g = new Grid(300, 300, 50); // 6x6 cells; (0,0) and (5,5) are not neighbors
  g.rebuild(new Float32Array([25, 275]), new Float32Array([25, 275]), 2);
  g.rebuild(new Float32Array([25]), new Float32Array([25]), 1); // only one point now

  const seen = [];
  g.forEachNeighbor(275, 275, (i) => seen.push(i));
  assert.deepEqual(seen, []); // the old point-in-(5,5) must not survive
});

test('points are clamped to the grid bounds', () => {
  const g = new Grid(300, 300, 50); // 6x6 cells
  // out-of-bounds coords clamp into edge cells rather than crashing
  g.rebuild(new Float32Array([-50, 9999]), new Float32Array([-50, 9999]), 2);

  const seenTL = [];
  g.forEachNeighbor(25, 25, (i) => seenTL.push(i));
  assert.deepEqual(seenTL, [0]); // negative coord clamped to cell (0,0)

  const seenBR = [];
  g.forEachNeighbor(275, 275, (i) => seenBR.push(i));
  assert.deepEqual(seenBR, [1]); // huge coord clamped to cell (5,5)
});

test('handles count of 0 without visiting anything', () => {
  const g = new Grid(100, 100, 50);
  g.rebuild(new Float32Array([10]), new Float32Array([10]), 0);
  const seen = [];
  g.forEachNeighbor(10, 10, (i) => seen.push(i));
  assert.deepEqual(seen, []);
});

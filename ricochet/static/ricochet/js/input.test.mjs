import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tryPlace, removeTopmost } from './input.js';
import { BLOCK_W, BLOCK_H } from './config.js';

// world: minimal stub carrying budgets, blockW/blockH, pegRadius.
function makeWorld(budgets) {
  return { budgets, blockW: BLOCK_W, blockH: BLOCK_H, pegRadius: 7 };
}
// state.placed with empty fields.
function makePlaced() {
  return { pegs: [], blocks: [], paddle: { x: 500, width: 120 } };
}

test('tryPlace: places a peg at a valid spot and grows state.placed.pegs', () => {
  const world = makeWorld({ pegs: 5, blocks: 5 });
  const placed = makePlaced();
  const ok = tryPlace(world, placed, 'peg', 200, 400);
  assert.equal(ok, true);
  assert.deepEqual(placed.pegs, [{ x: 200, y: 400 }]);
});

test('tryPlace: refuses a peg when the peg budget is full', () => {
  const world = makeWorld({ pegs: 1, blocks: 5 });
  const placed = makePlaced();
  placed.pegs.push({ x: 100, y: 400 });
  const ok = tryPlace(world, placed, 'peg', 800, 400);
  assert.equal(ok, false);
  assert.equal(placed.pegs.length, 1);
});

test('tryPlace: refuses a peg overlapping an existing peg', () => {
  const world = makeWorld({ pegs: 5, blocks: 5 });
  const placed = makePlaced();
  placed.pegs.push({ x: 200, y: 400 });
  const ok = tryPlace(world, placed, 'peg', 205, 402); // way too close
  assert.equal(ok, false);
  assert.equal(placed.pegs.length, 1);
});

test('tryPlace: refuses a peg inside the spawn band', () => {
  const world = makeWorld({ pegs: 5, blocks: 5 });
  const placed = makePlaced();
  const ok = tryPlace(world, placed, 'peg', 500, 10); // y=10 in spawn band
  assert.equal(ok, false);
});

test('tryPlace: refuses a peg out of bounds', () => {
  const world = makeWorld({ pegs: 5, blocks: 5 });
  const placed = makePlaced();
  const ok = tryPlace(world, placed, 'peg', 1500, 400); // x past right wall
  assert.equal(ok, false);
});

test('tryPlace: places a block with full HP and the canonical block shape', () => {
  const world = makeWorld({ pegs: 5, blocks: 5 });
  const placed = makePlaced();
  const ok = tryPlace(world, placed, 'block', 400, 820);
  assert.equal(ok, true);
  assert.equal(placed.blocks.length, 1);
  const b = placed.blocks[0];
  // Canonical shape: {x,y,level,respawnAt,golden} — NO per-block w/h/hw/hh.
  assert.deepEqual(Object.keys(b).sort(), ['golden', 'level', 'respawnAt', 'x', 'y']);
  assert.equal(b.x, 400);
  assert.equal(b.y, 820);
  assert.equal(b.respawnAt, null);
  assert.equal(b.golden, false);
});

test('tryPlace: refuses a block overlapping an existing block', () => {
  const world = makeWorld({ pegs: 5, blocks: 5 });
  const placed = makePlaced();
  placed.blocks.push({ x: 400, y: 820, level: 9, respawnAt: null, golden: false });
  const ok = tryPlace(world, placed, 'block', 410, 825); // overlaps (BLOCK_W=64)
  assert.equal(ok, false);
  assert.equal(placed.blocks.length, 1);
});

test('tryPlace: peg refused if it overlaps a block footprint (cross-type)', () => {
  const world = makeWorld({ pegs: 5, blocks: 5 });
  const placed = makePlaced();
  placed.blocks.push({ x: 400, y: 820, level: 9, respawnAt: null, golden: false });
  const ok = tryPlace(world, placed, 'peg', 405, 820); // inside the block AABB
  assert.equal(ok, false);
});

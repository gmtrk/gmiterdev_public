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

test('removeTopmost: removes the newest peg under the cursor', () => {
  const world = makeWorld({ pegs: 5, blocks: 5 });
  const placed = makePlaced();
  placed.pegs.push({ x: 200, y: 400 }); // older, same spot
  placed.pegs.push({ x: 200, y: 400 }); // newer, same spot
  const ok = removeTopmost(world, placed, 201, 401);
  assert.equal(ok, true);
  assert.equal(placed.pegs.length, 1); // only the newer one removed
});

test('removeTopmost: prefers a block over a peg at the same point', () => {
  const world = makeWorld({ pegs: 5, blocks: 5 });
  const placed = makePlaced();
  placed.pegs.push({ x: 400, y: 820 });
  placed.blocks.push({ x: 400, y: 820, level: 9, respawnAt: null, golden: false });
  const ok = removeTopmost(world, placed, 400, 820);
  assert.equal(ok, true);
  assert.equal(placed.blocks.length, 0);
  assert.equal(placed.pegs.length, 1); // peg survives — block removed first
});

test('removeTopmost: returns false when nothing is under the cursor', () => {
  const world = makeWorld({ pegs: 5, blocks: 5 });
  const placed = makePlaced();
  placed.pegs.push({ x: 200, y: 400 });
  assert.equal(removeTopmost(world, placed, 900, 900), false);
});

import { presetPositions } from './input.js';

test('presetPositions: triangle dispatch yields the auto-fill headroom count', () => {
  const world = makeWorld({ pegs: 12, blocks: 5 });
  const placed = makePlaced();
  placed.pegs.push({ x: 100, y: 400 }); // 1 already placed -> headroom 11
  const pos = presetPositions('triangle', world, placed);
  assert.equal(pos.length, 11);
});

test('presetPositions: diamond dispatch respects budget headroom', () => {
  const world = makeWorld({ pegs: 6, blocks: 5 });
  const placed = makePlaced();
  assert.equal(presetPositions('diamond', world, placed).length, 6);
});

test('presetPositions: funnel dispatch respects budget headroom', () => {
  const world = makeWorld({ pegs: 8, blocks: 5 });
  const placed = makePlaced();
  assert.equal(presetPositions('funnel', world, placed).length, 8);
});

test('presetPositions: unknown preset yields an empty array', () => {
  const world = makeWorld({ pegs: 8, blocks: 5 });
  const placed = makePlaced();
  assert.deepEqual(presetPositions('spiral', world, placed), []);
});

import { applyPreset, applyBlueprint } from './input.js';

test('applyPreset: replaces pegs with the preset, never exceeding budget', () => {
  const world = makeWorld({ pegs: 10, blocks: 5 });
  const placed = makePlaced();
  placed.pegs.push({ x: 100, y: 400 });
  applyPreset('triangle', world, placed);
  assert.ok(placed.pegs.length <= 10);
  assert.ok(placed.pegs.length >= 1);
});

test('applyBlueprint: clamps pegs/blocks to current budgets', () => {
  const world = makeWorld({ pegs: 2, blocks: 1 });
  const placed = makePlaced();
  const blueprint = {
    pegs: [{ x: 100, y: 400 }, { x: 300, y: 500 }, { x: 600, y: 600 }],
    blocks: [
      { x: 400, y: 820, level: 9, respawnAt: null, golden: false },
      { x: 600, y: 900, level: 9, respawnAt: null, golden: false },
    ],
    paddle: { x: 700, width: 140 },
  };
  applyBlueprint(world, placed, blueprint);
  assert.equal(placed.pegs.length, 2); // clamped from 3 -> 2
  assert.equal(placed.blocks.length, 1); // clamped from 2 -> 1
  assert.deepEqual(placed.paddle, { x: 700, width: 140 });
});

test('applyBlueprint: produces canonical block shapes (fresh copies)', () => {
  const world = makeWorld({ pegs: 5, blocks: 5 });
  const placed = makePlaced();
  const blueprint = {
    pegs: [],
    blocks: [{ x: 400, y: 820, level: 9, respawnAt: null, golden: false }],
    paddle: { x: 500, width: 120 },
  };
  applyBlueprint(world, placed, blueprint);
  const b = placed.blocks[0];
  assert.deepEqual(Object.keys(b).sort(), ['golden', 'level', 'respawnAt', 'x', 'y']);
  assert.notEqual(b, blueprint.blocks[0]); // a copy, not the same object
});

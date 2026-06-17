import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tryPlace, eraseWithinRadius, canPlacePeg, presetPositions } from './input.js';
import { previewPositions, commitToBudget } from './placement.js';
import { BLOCK_W, BLOCK_H } from './config.js';

// world: minimal stub carrying budgets, blockW/blockH, pegRadius.
function makeWorld(budgets) {
  return { budgets, blockW: BLOCK_W, blockH: BLOCK_H, pegRadius: 7 };
}
// state.placed with empty fields.
function makePlaced() {
  return { pegs: [], blocks: [], paddle: { x: 500, width: 120 } };
}

test('post-Big-Bang erase: commit-then-erase frees a slot and does NOT slide a hidden peg in', () => {
  // Budget 2, but the blueprint kept 5 pegs (the Big-Bang regrow tail); the first
  // 2 are the visible/live ones. A manual edit must commit the visible field first.
  const world = makeWorld({ pegs: 2, blocks: 0 });
  const placed = {
    pegs: [{ x: 100, y: 300 }, { x: 200, y: 400 }, { x: 300, y: 500 }, { x: 400, y: 600 }, { x: 500, y: 700 }],
    blocks: [], paddle: { x: 500, width: 120 },
  };
  commitToBudget(placed, world.budgets);          // what actAt does before an edit
  assert.equal(placed.pegs.length, 2, 'hidden regrow tail dropped on manual edit');
  const removed = eraseWithinRadius(world, placed, 200, 400, 10); // erase the 2nd visible peg
  assert.equal(removed, 1);
  // a genuine free slot now — the removed peg did NOT get replaced by a hidden one
  assert.deepEqual(placed.pegs, [{ x: 100, y: 300 }]);
});

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

test('eraseWithinRadius: erases all pegs and blocks within the radius, returns the count', () => {
  const world = makeWorld({ pegs: 10, blocks: 10 });
  const placed = {
    pegs: [{ x: 200, y: 400 }, { x: 230, y: 410 }, { x: 900, y: 900 }],
    blocks: [{ x: 215, y: 405, level: 9, respawnAt: null, golden: false }],
    paddle: { x: 500, width: 120 },
  };
  const n = eraseWithinRadius(world, placed, 210, 405, 50);
  assert.equal(n, 3);                 // 2 near pegs + 1 near block
  assert.deepEqual(placed.pegs, [{ x: 900, y: 900 }]); // far peg survives
  assert.equal(placed.blocks.length, 0);
});

test('eraseWithinRadius: returns 0 and mutates nothing when range is empty', () => {
  const world = makeWorld({ pegs: 10, blocks: 10 });
  const placed = { pegs: [{ x: 900, y: 900 }], blocks: [], paddle: { x: 500, width: 120 } };
  assert.equal(eraseWithinRadius(world, placed, 100, 100, 50), 0);
  assert.equal(placed.pegs.length, 1);
});

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

test('presetPositions delegates to previewPositions using world.pegSpread', () => {
  const world = { budgets: { pegs: 6 }, pegSpread: { pitchX: 120, pitchY: 130, fieldTop: 600 } };
  const placed = { pegs: [] };
  assert.deepEqual(
    presetPositions('triangle', world, placed),
    previewPositions('triangle', world.pegSpread, 6),
  );
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

test('canPlacePeg / tryPlace: refuses a peg within MIN_PEG_SPACING of another', () => {
  const world = makeWorld({ pegs: 10, blocks: 0 });
  const placed = { pegs: [{ x: 200, y: 400 }], blocks: [], paddle: { x: 500, width: 120 } };
  assert.equal(canPlacePeg(world, placed, 200, 430), false); // dist 30 < 110
  assert.equal(tryPlace(world, placed, 'peg', 200, 430), false);
  assert.equal(placed.pegs.length, 1);
});
test('canPlacePeg / tryPlace: allows a peg at or beyond MIN_PEG_SPACING', () => {
  const world = makeWorld({ pegs: 5, blocks: 5 });
  const placed = { pegs: [{ x: 200, y: 400 }], blocks: [], paddle: { x: 500, width: 120 } };
  assert.equal(canPlacePeg(world, placed, 200, 520), true); // dist 120 >= 110
  assert.equal(tryPlace(world, placed, 'peg', 200, 520), true);
  assert.equal(placed.pegs.length, 2);
});
test('canPlacePeg: honors a live world.minPegSpacing override', () => {
  const world = makeWorld({ pegs: 10, blocks: 0 });
  world.minPegSpacing = 100;
  const placed = { pegs: [{ x: 200, y: 400 }], blocks: [], paddle: { x: 500, width: 120 } };
  assert.equal(canPlacePeg(world, placed, 200, 480), false); // dist 80 < 100
});

test('clear-then-applyPreset regenerates the FULL formation at the new budget', () => {
  // applyPreset fills autoFillCount(placed.length, budget) = (budget - placed) NEW
  // pegs and REPLACES placed.pegs with them. So to fill to the full budget the
  // caller must clear placed.pegs first (this is what the preset handler and the
  // auto-place-on-buy do).
  const world = makeWorld({ pegs: 5, blocks: 0 });
  const placed = { pegs: [], blocks: [], paddle: { x: 500, width: 120 }, preset: 'triangle' };
  applyPreset('triangle', world, placed);
  assert.equal(placed.pegs.length, 5);
  world.budgets.pegs = 10;     // simulate buying Peg Budget
  placed.pegs = [];            // caller clears before re-applying
  applyPreset('triangle', world, placed);
  assert.equal(placed.pegs.length, 10); // full 10-peg formation, not 5

  // WITHOUT the clear, applyPreset would only add the 5-peg headroom and replace:
  world.budgets.pegs = 20;
  applyPreset('triangle', world, placed); // placed has 10 -> autoFillCount(10,20)=10
  assert.equal(placed.pegs.length, 10); // proves the clear is required to reach budget
});

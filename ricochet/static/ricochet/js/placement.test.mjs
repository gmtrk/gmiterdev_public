import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  overlaps,
  inSpawnBand,
  inBounds,
  trianglePegs,
  diamondPegs,
  funnelPegs,
  autoFillCount,
  clampBlueprintToBudget,
  unplacedCount,
  previewPositions,
} from './placement.js';
import { ARENA_W, ARENA_H } from './config.js';

// overlaps(a, b): each is {x, y, hx, hy} (center + half-extents). AABB separation.
test('overlaps: true when AABBs interpenetrate on both axes', () => {
  const a = { x: 100, y: 100, hx: 10, hy: 10 };
  const b = { x: 115, y: 105, hx: 10, hy: 10 }; // dx=15 < 20, dy=5 < 20 -> overlap
  assert.equal(overlaps(a, b), true);
});

test('overlaps: false when separated on the x axis', () => {
  const a = { x: 100, y: 100, hx: 10, hy: 10 };
  const b = { x: 130, y: 105, hx: 10, hy: 10 }; // dx=30 >= 20 -> no overlap
  assert.equal(overlaps(a, b), false);
});

test('overlaps: false when separated on the y axis', () => {
  const a = { x: 100, y: 100, hx: 10, hy: 10 };
  const b = { x: 105, y: 130, hx: 10, hy: 10 }; // dy=30 >= 20 -> no overlap
  assert.equal(overlaps(a, b), false);
});

test('overlaps: touching exactly at the boundary does NOT overlap', () => {
  const a = { x: 100, y: 100, hx: 10, hy: 10 };
  const b = { x: 120, y: 100, hx: 10, hy: 10 }; // dx=20 == 20 -> not < -> no overlap
  assert.equal(overlaps(a, b), false);
});

// inBounds(x, y, hx, hy): the element's AABB fits fully inside [0,ARENA_W]x[0,ARENA_H].
test('inBounds: true for a centered element', () => {
  assert.equal(inBounds(500, 750, 32, 14), true);
});

test('inBounds: false when the AABB pokes past the right wall', () => {
  // ARENA_W = 1000; x=990, hx=32 -> right edge 1022 > 1000
  assert.equal(inBounds(990, 750, 32, 14), false);
});

test('inBounds: false when the AABB pokes above the top', () => {
  // y=5, hy=14 -> top edge -9 < 0
  assert.equal(inBounds(500, 5, 32, 14), false);
});

// inSpawnBand(y, hy): true if the element's AABB intersects the spawn band
// [0, SPAWN_Y] where balls drop in. SPAWN_Y = 30.
test('inSpawnBand: true when the element top is at/above SPAWN_Y', () => {
  // y=40, hy=14 -> top edge 26 < SPAWN_Y(30) -> intersects band
  assert.equal(inSpawnBand(40, 14), true);
});

test('inSpawnBand: false when the element is clear below the band', () => {
  // y=100, hy=14 -> top edge 86 > SPAWN_Y(30)
  assert.equal(inSpawnBand(100, 14), false);
});

// Presets return EXACTLY `count` peg positions [{x,y}], all in bounds, none in the spawn band.
function assertValidPegs(pegs, count) {
  assert.equal(pegs.length, count);
  for (const p of pegs) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `non-finite ${JSON.stringify(p)}`);
    assert.equal(inBounds(p.x, p.y, 7, 7), true, `out of bounds ${JSON.stringify(p)}`);
    assert.equal(inSpawnBand(p.y, 7), false, `in spawn band ${JSON.stringify(p)}`);
  }
}

test('trianglePegs: yields exactly the requested count, all valid', () => {
  assertValidPegs(trianglePegs(15), 15);
});

test('trianglePegs: zero count yields empty array', () => {
  assert.deepEqual(trianglePegs(0), []);
});

test('trianglePegs: first row is centered (single peg near arena mid-x)', () => {
  const pegs = trianglePegs(10);
  // The apex peg is the topmost; it sits near the horizontal center.
  const top = pegs.reduce((a, b) => (b.y < a.y ? b : a), pegs[0]);
  assert.ok(Math.abs(top.x - ARENA_W / 2) < 1, `apex x was ${top.x}`);
});

test('diamondPegs: yields exactly the requested count, all valid', () => {
  assertValidPegs(diamondPegs(20), 20);
});

test('funnelPegs: yields exactly the requested count, all valid', () => {
  assertValidPegs(funnelPegs(18), 18);
});

test('funnelPegs: two columns converge inward going down', () => {
  const pegs = funnelPegs(8); // 4 rows x 2 walls
  // Topmost-left peg is farther from center than bottom-most-left peg.
  const left = pegs.filter((p) => p.x < ARENA_W / 2).sort((a, b) => a.y - b.y);
  const topGap = ARENA_W / 2 - left[0].x;
  const botGap = ARENA_W / 2 - left[left.length - 1].x;
  assert.ok(botGap < topGap, `expected funnel to narrow: top ${topGap} bot ${botGap}`);
});

// autoFillCount(placedCount, budget): how many NEW elements to add to reach budget.
test('autoFillCount: returns the remaining budget headroom', () => {
  assert.equal(autoFillCount(3, 10), 7);
});

test('autoFillCount: never negative when already over budget', () => {
  assert.equal(autoFillCount(12, 10), 0);
});

test('autoFillCount: full budget when nothing placed', () => {
  assert.equal(autoFillCount(0, 25), 25);
});

// clampBlueprintToBudget(blueprint, budgets): trims pegs/blocks arrays to the
// current budgets (keeping the earliest-placed), leaves paddle untouched.
test('clampBlueprintToBudget: trims pegs and blocks to budget, keeping order', () => {
  const blueprint = {
    pegs: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }],
    blocks: [
      { x: 10, y: 10, level: 9, respawnAt: null, golden: false },
      { x: 20, y: 20, level: 9, respawnAt: null, golden: false },
    ],
    paddle: { x: 500, width: 120 },
  };
  const out = clampBlueprintToBudget(blueprint, { pegs: 2, blocks: 1 });
  assert.deepEqual(out.pegs, [{ x: 1, y: 1 }, { x: 2, y: 2 }]);
  assert.deepEqual(out.blocks, [{ x: 10, y: 10, level: 9, respawnAt: null, golden: false }]);
  assert.deepEqual(out.paddle, { x: 500, width: 120 });
});

test('clampBlueprintToBudget: keeps everything when under budget', () => {
  const blueprint = {
    pegs: [{ x: 1, y: 1 }],
    blocks: [],
    paddle: { x: 500, width: 120 },
  };
  const out = clampBlueprintToBudget(blueprint, { pegs: 50, blocks: 10 });
  assert.equal(out.pegs.length, 1);
  assert.equal(out.blocks.length, 0);
});

test('clampBlueprintToBudget: does not mutate the input arrays', () => {
  const pegs = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
  const blueprint = { pegs, blocks: [], paddle: { x: 500, width: 120 } };
  clampBlueprintToBudget(blueprint, { pegs: 1, blocks: 0 });
  assert.equal(pegs.length, 2, 'input pegs array must not be mutated');
});

test('trianglePegs: the apex row now builds in the lower portion of the arena', () => {
  const apex = trianglePegs(3)[0]; // row 0, single peg, at FIELD_TOP
  assert.ok(apex.y >= ARENA_H * 0.3, `apex y ${apex.y} should be well below the top`);
});

test('unplacedCount: sums the remaining peg + block budget headroom (never negative)', () => {
  assert.equal(unplacedCount({ pegs: 5, blocks: 2 }, { pegs: [{}, {}], blocks: [] }), 5); // 3 pegs + 2 blocks
  assert.equal(unplacedCount({ pegs: 1, blocks: 0 }, { pegs: [{}, {}, {}], blocks: [] }), 0); // over budget -> 0
});

test('trianglePegs honors a wider pitch and lower fieldTop', () => {
  const wide = trianglePegs(3, 120, 120, 600);
  assert.equal(wide[0].y, 600);            // apex at the passed fieldTop
  const def = trianglePegs(3);
  assert.ok(wide[0].y > def[0].y);          // 600 > default ~525
  // row 1 has two pegs PITCH apart -> wider pitch spreads them further
  const wideRow1 = wide.filter((p) => p.y === 600 + 120);
  const defRow1 = def.filter((p) => p.y === def[0].y + 110); // default pitch is now 110
  assert.ok((wideRow1[1].x - wideRow1[0].x) > (defRow1[1].x - defRow1[0].x));
});

test('previewPositions: triangle at an explicit spread equals trianglePegs with those params', () => {
  assert.deepEqual(
    previewPositions('triangle', { pitchX: 120, pitchY: 130, fieldTop: 600 }, 6),
    trianglePegs(6, 120, 130, 600),
  );
});

test('previewPositions: count <= 0 yields an empty array', () => {
  assert.deepEqual(previewPositions('triangle', {}, 0), []);
});

test('previewPositions: a wider pitchX spaces adjacent row pegs farther apart', () => {
  const narrow = previewPositions('triangle', { pitchX: 110 }, 3); // row0=1 peg, row1=2 pegs (idx 1,2)
  const wide = previewPositions('triangle', { pitchX: 300 }, 3);
  assert.ok(Math.abs(wide[2].x - wide[1].x) > Math.abs(narrow[2].x - narrow[1].x));
});

// Pure placement geometry: presets, overlap predicate, auto-fill, clamp.
// No DOM, no canvas — unit-tested. Coordinates are virtual arena space.
import {
  ARENA_W,
  ARENA_H,
  SPAWN_Y,
  SPAWN_MARGIN,
  BLOCK_W,
  BLOCK_H,
  BLOCK_LEVELS,
  PEG_RADIUS,
  PEG_PITCH_X,
  PEG_PITCH_Y,
  PEG_FIELD_TOP,
} from './config.js';

// Each element is an AABB {x, y, hx, hy} (center + half-extents).
// Overlap iff the boxes interpenetrate on BOTH axes (strict: touching is OK).
export function overlaps(a, b) {
  return Math.abs(a.x - b.x) < a.hx + b.hx && Math.abs(a.y - b.y) < a.hy + b.hy;
}

// True iff the AABB (center x,y, half-extents hx,hy) fits fully inside the arena.
export function inBounds(x, y, hx, hy) {
  return x - hx >= 0 && x + hx <= ARENA_W && y - hy >= 0 && y + hy <= ARENA_H;
}

// True iff the AABB's top edge intrudes into the spawn band [0, SPAWN_Y].
export function inSpawnBand(y, hy) {
  return y - hy < SPAWN_Y;
}

// --- Preset peg patterns -------------------------------------------------
// All presets emit pegs in the playfield (below the spawn band, inside bounds),
// laid out on a fixed pitch so they never self-overlap. We over-generate a grid
// then return exactly `count` positions in deterministic order.

// A centered triangle (Plinko): row r has r+1 pegs, widening downward.
export function trianglePegs(count, pitchX = PEG_PITCH_X, pitchY = PEG_PITCH_Y, fieldTop = PEG_FIELD_TOP) {
  const out = [];
  const cx = ARENA_W / 2;
  let row = 0;
  while (out.length < count) {
    const n = row + 1;
    const y = fieldTop + row * pitchY;
    const startX = cx - ((n - 1) * pitchX) / 2;
    for (let i = 0; i < n && out.length < count; i++) out.push({ x: startX + i * pitchX, y });
    row++;
  }
  return out;
}

// A diamond: rows widen to a middle row then narrow again.
export function diamondPegs(count, pitchX = PEG_PITCH_X, pitchY = PEG_PITCH_Y, fieldTop = PEG_FIELD_TOP) {
  const out = [];
  const cx = ARENA_W / 2;
  const maxPerRow = Math.max(1, Math.floor((ARENA_W - 2 * SPAWN_MARGIN) / pitchX));
  const half = Math.min(5, Math.floor(maxPerRow / 2));
  let row = 0;
  while (out.length < count) {
    const cycle = 2 * half + 1;
    const pos = row % cycle;
    const n = pos <= half ? pos + 1 : cycle - pos;
    const y = fieldTop + row * pitchY;
    const startX = cx - ((n - 1) * pitchX) / 2;
    for (let i = 0; i < n && out.length < count; i++) out.push({ x: startX + i * pitchX, y });
    row++;
  }
  return out;
}

// A funnel: two converging walls of pegs guiding balls toward center.
export function funnelPegs(count, pitchY = PEG_PITCH_Y, fieldTop = PEG_FIELD_TOP) {
  const out = [];
  const cx = ARENA_W / 2;
  const rows = Math.ceil(count / 2);
  const topGap = 360;
  const botGap = 90;
  for (let r = 0; r < rows && out.length < count; r++) {
    const t = rows === 1 ? 0 : r / (rows - 1);
    const gap = topGap + (botGap - topGap) * t;
    const y = fieldTop + r * pitchY;
    out.push({ x: cx - gap, y });
    if (out.length < count) out.push({ x: cx + gap, y });
  }
  return out;
}

// Peg positions for a named preset at an EXPLICIT spread, sized to `count`. The
// single source of preset geometry — both presetPositions (input.js) and the
// Place-tab spread preview call this. Undefined spread fields fall back to the
// generator defaults (PEG_PITCH_X/Y, PEG_FIELD_TOP). Pure + tested.
export function previewPositions(name, spread = {}, count = 0) {
  if (count <= 0) return [];
  const { pitchX, pitchY, fieldTop } = spread;
  if (name === 'triangle') return trianglePegs(count, pitchX, pitchY, fieldTop);
  if (name === 'diamond') return diamondPegs(count, pitchX, pitchY, fieldTop);
  if (name === 'funnel') return funnelPegs(count, pitchY, fieldTop);
  return [];
}

// How many more elements may be placed to reach `budget` (never negative).
export function autoFillCount(placedCount, budget) {
  return Math.max(0, budget - placedCount);
}

// Trim a blueprint's pegs/blocks to the current budgets (earliest placements
// win). Returns a new object; never mutates the input arrays. Paddle is kept.
export function clampBlueprintToBudget(blueprint, budgets) {
  return {
    pegs: blueprint.pegs.slice(0, budgets.pegs),
    blocks: blueprint.blocks.slice(0, budgets.blocks),
    paddle: blueprint.paddle,
  };
}

// How many placeable items are waiting (peg + block budget headroom, never < 0).
// Drives the Place-tab count badge. Pure + tested.
export function unplacedCount(budgets, placed) {
  const pegs = Math.max(0, budgets.pegs - placed.pegs.length);
  const blocks = Math.max(0, budgets.blocks - placed.blocks.length);
  return pegs + blocks;
}

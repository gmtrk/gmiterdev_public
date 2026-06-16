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

const PEG_PITCH_X = 70; // horizontal spacing between pegs in a row
const PEG_PITCH_Y = 70; // vertical spacing between rows
const FIELD_TOP = SPAWN_Y + 80; // first peg row sits well below the spawn band

// A centered triangle (Plinko): row r has r+1 pegs, widening downward.
export function trianglePegs(count) {
  const out = [];
  const cx = ARENA_W / 2;
  let row = 0;
  while (out.length < count) {
    const n = row + 1;
    const y = FIELD_TOP + row * PEG_PITCH_Y;
    const startX = cx - ((n - 1) * PEG_PITCH_X) / 2;
    for (let i = 0; i < n && out.length < count; i++) {
      out.push({ x: startX + i * PEG_PITCH_X, y });
    }
    row++;
  }
  return out;
}

// A diamond: rows widen to a middle row then narrow again.
export function diamondPegs(count) {
  const out = [];
  const cx = ARENA_W / 2;
  // Pick a max half-width that keeps the diamond on-screen.
  const maxPerRow = Math.max(1, Math.floor((ARENA_W - 2 * SPAWN_MARGIN) / PEG_PITCH_X));
  const half = Math.min(5, Math.floor(maxPerRow / 2));
  let row = 0;
  while (out.length < count) {
    // widths: 1,2,...,half+1,...,2,1 then repeat the cycle if more pegs needed
    const cycle = 2 * half + 1;
    const pos = row % cycle;
    const n = pos <= half ? pos + 1 : cycle - pos;
    const y = FIELD_TOP + row * PEG_PITCH_Y;
    const startX = cx - ((n - 1) * PEG_PITCH_X) / 2;
    for (let i = 0; i < n && out.length < count; i++) {
      out.push({ x: startX + i * PEG_PITCH_X, y });
    }
    row++;
  }
  return out;
}

// A funnel: two converging walls of pegs guiding balls toward center.
export function funnelPegs(count) {
  const out = [];
  const cx = ARENA_W / 2;
  const rows = Math.ceil(count / 2);
  const topGap = 360; // half-distance of the walls from center at the top
  const botGap = 90; // converges to this near the bottom
  for (let r = 0; r < rows && out.length < count; r++) {
    const t = rows === 1 ? 0 : r / (rows - 1);
    const gap = topGap + (botGap - topGap) * t;
    const y = FIELD_TOP + r * PEG_PITCH_Y;
    out.push({ x: cx - gap, y });
    if (out.length < count) out.push({ x: cx + gap, y });
  }
  return out;
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

// Hands-on placement layer: place/remove pegs+blocks (budget + overlap + bounds
// + spawn-band guarded), presets/auto-fill, blueprint apply (clamped to budgets),
// draggable paddle, tabs. Pure decision helpers (tryPlace/removeTopmost) are
// unit-tested; the DOM wiring (setupPlacement/setupPaddleDrag/setupTabs) builds
// on them and sets touch-action:none on the canvas.
import { BLOCK_LEVELS } from './config.js';
import {
  overlaps,
  inBounds,
  inSpawnBand,
  trianglePegs,
  diamondPegs,
  funnelPegs,
  autoFillCount,
  clampBlueprintToBudget,
} from './placement.js';
import { rebuildColliders } from './physics.js';

// Half-extents for a given element type, from the world's canonical dimensions.
function halfExtents(world, type) {
  if (type === 'block') return { hx: world.blockW / 2, hy: world.blockH / 2 };
  return { hx: world.pegRadius, hy: world.pegRadius };
}

// Build the AABB list of all currently-placed elements (for overlap tests).
function placedBoxes(world, placed) {
  const boxes = [];
  for (const p of placed.pegs) {
    boxes.push({ x: p.x, y: p.y, hx: world.pegRadius, hy: world.pegRadius });
  }
  for (const b of placed.blocks) {
    boxes.push({ x: b.x, y: b.y, hx: world.blockW / 2, hy: world.blockH / 2 });
  }
  return boxes;
}

// Attempt to place `type` ('peg'|'block') centered at (x,y). Mutates placed.*
// and returns true on success; returns false (no mutation) if over budget,
// overlapping, out of bounds, or intruding the spawn band.
export function tryPlace(world, placed, type, x, y) {
  const { hx, hy } = halfExtents(world, type);
  if (type === 'peg' && placed.pegs.length >= world.budgets.pegs) return false;
  if (type === 'block' && placed.blocks.length >= world.budgets.blocks) return false;
  if (!inBounds(x, y, hx, hy)) return false;
  if (inSpawnBand(y, hy)) return false;
  const candidate = { x, y, hx, hy };
  for (const box of placedBoxes(world, placed)) {
    if (overlaps(candidate, box)) return false;
  }
  if (type === 'peg') {
    placed.pegs.push({ x, y });
  } else {
    placed.blocks.push({ x, y, level: BLOCK_LEVELS, respawnAt: null, golden: false });
  }
  return true;
}

// Remove the topmost (last-placed) element whose footprint contains (x,y),
// searching blocks then pegs newest-first. Returns true if something was
// removed (caller re-syncs colliders).
export function removeTopmost(world, placed, x, y) {
  for (let i = placed.blocks.length - 1; i >= 0; i--) {
    const b = placed.blocks[i];
    if (Math.abs(x - b.x) <= world.blockW / 2 && Math.abs(y - b.y) <= world.blockH / 2) {
      placed.blocks.splice(i, 1);
      return true;
    }
  }
  for (let i = placed.pegs.length - 1; i >= 0; i--) {
    const p = placed.pegs[i];
    if (Math.abs(x - p.x) <= world.pegRadius && Math.abs(y - p.y) <= world.pegRadius) {
      placed.pegs.splice(i, 1);
      return true;
    }
  }
  return false;
}

// Compute the peg positions for a preset, sized to the remaining peg budget
// (auto-fill: fill the headroom between placed pegs and the budget).
export function presetPositions(name, world, placed) {
  const count = autoFillCount(placed.pegs.length, world.budgets.pegs);
  if (count <= 0) return [];
  if (name === 'triangle') return trianglePegs(count);
  if (name === 'diamond') return diamondPegs(count);
  if (name === 'funnel') return funnelPegs(count);
  return [];
}

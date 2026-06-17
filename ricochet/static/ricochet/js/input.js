// Hands-on placement layer: place/remove pegs+blocks (budget + overlap + bounds
// + spawn-band guarded), presets/auto-fill, blueprint apply (clamped to budgets),
// tabs. Pure decision helpers (tryPlace/eraseWithinRadius) are unit-tested; the DOM
// wiring (setupPlacement/setupTabs) builds on them and sets touch-action:none on
// the canvas.
import { BLOCK_LEVELS, MIN_PEG_SPACING, ERASER_RADIUS } from './config.js';
import {
  overlaps,
  inBounds,
  inSpawnBand,
  autoFillCount,
  clampBlueprintToBudget,
  previewPositions,
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

// Geometric placement guards for a peg (NOT budget): in bounds, clear of the
// spawn band, no overlap with placed pegs/blocks, and >= MIN_PEG_SPACING from
// every peg (so no impenetrable wall). Shared by tryPlace and the Place overlay
// so the green/red preview and real placement never disagree. Pure + tested.
export function canPlacePeg(world, placed, x, y) {
  const hx = world.pegRadius;
  const hy = world.pegRadius;
  if (!inBounds(x, y, hx, hy)) return false;
  if (inSpawnBand(y, hy)) return false;
  const candidate = { x, y, hx, hy };
  for (const box of placedBoxes(world, placed)) {
    if (overlaps(candidate, box)) return false;
  }
  const spacing = world.minPegSpacing != null ? world.minPegSpacing : MIN_PEG_SPACING;
  const minSq = spacing * spacing;
  for (const p of placed.pegs) {
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy < minSq) return false;
  }
  return true;
}

// Attempt to place `type` ('peg'|'block') centered at (x,y). Mutates placed.*
// and returns true on success; returns false (no mutation) if over budget,
// overlapping, out of bounds, or intruding the spawn band.
export function tryPlace(world, placed, type, x, y) {
  if (type === 'peg') {
    if (placed.pegs.length >= world.budgets.pegs) return false;
    if (!canPlacePeg(world, placed, x, y)) return false;
    placed.pegs.push({ x, y });
    return true;
  }
  // block
  const { hx, hy } = halfExtents(world, type);
  if (placed.blocks.length >= world.budgets.blocks) return false;
  if (!inBounds(x, y, hx, hy)) return false;
  if (inSpawnBand(y, hy)) return false;
  const candidate = { x, y, hx, hy };
  for (const box of placedBoxes(world, placed)) {
    if (overlaps(candidate, box)) return false;
  }
  placed.blocks.push({ x, y, level: BLOCK_LEVELS, respawnAt: null, golden: false });
  return true;
}

// Erase every peg AND block whose center is within `radius` of (x,y). Returns the
// number removed (> 0 means the caller should re-sync colliders). Area eraser —
// no pixel-precise targeting needed; drag-to-erase works because setupPlacement
// calls this on every pointermove while painting. Mutates placed.*. Pure + tested.
export function eraseWithinRadius(world, placed, x, y, radius) {
  const r2 = radius * radius;
  let removed = 0;
  placed.pegs = placed.pegs.filter((p) => {
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy <= r2) { removed++; return false; }
    return true;
  });
  placed.blocks = placed.blocks.filter((b) => {
    const dx = x - b.x;
    const dy = y - b.y;
    if (dx * dx + dy * dy <= r2) { removed++; return false; }
    return true;
  });
  return removed;
}

// Compute the peg positions for a preset, sized to the remaining peg budget
// (auto-fill: fill the headroom between placed pegs and the budget).
// Delegates to previewPositions (placement.js) — the single source of preset geometry.
export function presetPositions(name, world, placed) {
  const count = autoFillCount(placed.pegs.length, world.budgets.pegs);
  return previewPositions(name, world.pegSpread || {}, count);
}

// Replace the placed pegs with a one-click preset (auto-filled to budget).
// Existing blocks/paddle are untouched. Caller re-syncs colliders. Preset rows
// stack downward by a fixed pitch, so with a large budget the lowest rows can
// run past ARENA_H — filter every position through inBounds (peg half-extents)
// so no peg lands out of the arena.
export function applyPreset(name, world, placed) {
  const r = world.pegRadius;
  const positions = presetPositions(name, world, placed).filter((p) => inBounds(p.x, p.y, r, r));
  placed.pegs = positions.map((p) => ({ x: p.x, y: p.y }));
}

// Re-apply a saved blueprint into placed.*, CLAMPED to the current world.budgets
// (Big-Bang reuse path: budgets may have shrunk). Blocks are fresh canonical
// copies. Caller re-syncs colliders.
export function applyBlueprint(world, placed, blueprint) {
  const clamped = clampBlueprintToBudget(blueprint, world.budgets);
  placed.pegs = clamped.pegs.map((p) => ({ x: p.x, y: p.y }));
  placed.blocks = clamped.blocks.map((b) => ({
    x: b.x,
    y: b.y,
    level: b.level,
    respawnAt: b.respawnAt ?? null,
    golden: !!b.golden,
  }));
  placed.paddle = { x: clamped.paddle.x, width: clamped.paddle.width };
}

// --- DOM wiring ----------------------------------------------------------
// Convert a pointer event on the canvas to virtual arena coordinates.
function eventToVirtual(canvas, world, ev) {
  const rect = canvas.getBoundingClientRect();
  const px = (ev.clientX - rect.left) / rect.width;
  const py = (ev.clientY - rect.top) / rect.height;
  return { x: px * world.W, y: py * world.H };
}

// Wire the Place tab: tool selection, click/drag placement & removal, preset
// buttons. `deps` = { canvas, world, state, toolButtons, presetButtons, onChange,
// isActive }. onChange() is called after any mutation so the caller re-syncs
// colliders + refreshes the shop. `isActive()` gates canvas placement to the
// Place tab — when it returns false, arena clicks are ignored (so clicking the
// arena on the Credits/Cores/Scores tabs can't silently mutate the blueprint).
// Defaults to always-active for headless/test callers. Sets touch-action:none on
// the canvas (kills scroll-vs-drag).
export function setupPlacement(deps) {
  const { canvas, world, state, toolButtons, presetButtons, onChange, isActive, view } = deps;
  const placeActive = typeof isActive === 'function' ? isActive : () => true;
  canvas.style.touchAction = 'none';
  let tool = 'peg'; // 'peg' | 'block' | 'remove'
  let painting = false;

  function updateOverlay(x, y) {
    if (!view) return;
    const canPlace = tool === 'peg'
      ? (canPlacePeg(world, state.placed, x, y) && state.placed.pegs.length < world.budgets.pegs)
      : tool === 'block'
        ? (state.placed.blocks.length < world.budgets.blocks)
        : false;
    view.place = { active: placeActive(), tool, x, y, canPlace };
  }

  for (const btn of toolButtons) {
    btn.addEventListener('click', () => {
      tool = btn.dataset.tool;
      for (const b of toolButtons) b.classList.toggle('rc-tool--active', b === btn);
    });
  }

  function actAt(x, y) {
    if (!placeActive()) return; // only the Place tab may edit the arena
    let changed = false;
    if (tool === 'remove') changed = eraseWithinRadius(world, state.placed, x, y, ERASER_RADIUS) > 0;
    else changed = tryPlace(world, state.placed, tool, x, y);
    if (changed) {
      state.placed.preset = null;
      rebuildColliders(world);
      onChange();
    }
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (!placeActive()) return; // ignore arena clicks outside the Place tab
    painting = true;
    canvas.setPointerCapture(ev.pointerId);
    const { x, y } = eventToVirtual(canvas, world, ev);
    updateOverlay(x, y);
    actAt(x, y);
  });
  canvas.addEventListener('pointermove', (ev) => {
    const { x, y } = eventToVirtual(canvas, world, ev);
    if (placeActive()) updateOverlay(x, y);
    if (!painting) return;
    actAt(x, y);
  });
  const stop = (ev) => {
    painting = false;
    if (canvas.hasPointerCapture && canvas.hasPointerCapture(ev.pointerId)) {
      canvas.releasePointerCapture(ev.pointerId);
    }
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('pointerleave', () => { if (view && view.place) view.place.active = false; });

  for (const btn of presetButtons) {
    btn.addEventListener('click', () => {
      state.placed.preset = btn.dataset.preset;
      state.placed.pegs = [];   // regenerate the FULL formation at the current budget
      applyPreset(btn.dataset.preset, world, state.placed);
      rebuildColliders(world);
      onChange();
    });
  }
}

// Wire the right-panel tabs (Credits / Cores / Place / Scores). `deps` =
// { tabButtons, panels, onSelect, initial }. onSelect(name) lets the caller
// (re)render the active tab. Returns { getActive() } so callers (placement)
// can gate canvas interactions to the active tab.
export function setupTabs(deps) {
  const { tabButtons, panels, onSelect, initial } = deps;
  // Seed from the markup's pre-selected tab (rc-tab--active) or `initial`.
  let active = initial
    || (tabButtons.find((b) => b.classList.contains('rc-tab--active')) || {}).dataset?.tab
    || (tabButtons[0] && tabButtons[0].dataset.tab);
  for (const btn of tabButtons) {
    btn.addEventListener('click', () => {
      const name = btn.dataset.tab;
      active = name;
      for (const b of tabButtons) b.classList.toggle('rc-tab--active', b.dataset.tab === name);
      for (const p of panels) p.hidden = p.dataset.panel !== name;
      onSelect(name);
    });
  }
  return { getActive: () => active };
}

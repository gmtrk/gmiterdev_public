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
  const { canvas, world, state, toolButtons, presetButtons, onChange, isActive } = deps;
  const placeActive = typeof isActive === 'function' ? isActive : () => true;
  canvas.style.touchAction = 'none';
  let tool = 'peg'; // 'peg' | 'block' | 'remove'
  let painting = false;

  for (const btn of toolButtons) {
    btn.addEventListener('click', () => {
      tool = btn.dataset.tool;
      for (const b of toolButtons) b.classList.toggle('rc-tool--active', b === btn);
    });
  }

  function actAt(x, y) {
    if (!placeActive()) return; // only the Place tab may edit the arena
    let changed = false;
    if (tool === 'remove') changed = removeTopmost(world, state.placed, x, y);
    else changed = tryPlace(world, state.placed, tool, x, y);
    if (changed) {
      rebuildColliders(world);
      onChange();
    }
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (!placeActive()) return; // ignore arena clicks outside the Place tab
    painting = true;
    canvas.setPointerCapture(ev.pointerId);
    const { x, y } = eventToVirtual(canvas, world, ev);
    actAt(x, y);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!painting) return;
    const { x, y } = eventToVirtual(canvas, world, ev);
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

  for (const btn of presetButtons) {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset, world, state.placed);
      rebuildColliders(world);
      onChange();
    });
  }
}

// Wire the draggable paddle. `deps` = { canvas, world, state, onChange, isActive }.
// The paddle moves horizontally in virtual coords; y/width come from world.paddle.
// `isActive()` gates the grab to the Place tab (same rationale as setupPlacement):
// a Credits/Cores/Scores-tab arena click must not start a paddle drag. Defaults to
// always-active for headless/test callers.
export function setupPaddleDrag(deps) {
  const { canvas, world, state, onChange, isActive } = deps;
  const placeActive = typeof isActive === 'function' ? isActive : () => true;
  let dragging = false;

  function near(x, y) {
    return (
      Math.abs(x - world.paddle.x) <= world.paddle.w / 2 + 30 &&
      Math.abs(y - world.paddle.y) <= world.paddle.h / 2 + 30
    );
  }
  function moveTo(x) {
    const half = world.paddle.w / 2;
    const clamped = Math.max(half, Math.min(world.W - half, x));
    world.paddle.x = clamped;
    state.placed.paddle.x = clamped;
    onChange();
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (!placeActive()) return; // only the Place tab may grab the paddle
    const { x, y } = eventToVirtual(canvas, world, ev);
    if (near(x, y)) {
      dragging = true;
      moveTo(x);
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const { x } = eventToVirtual(canvas, world, ev);
    moveTo(x);
  });
  const stop = () => { dragging = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
}

// Wire the right-panel tabs (Credits / Cores / Place / Scores). `deps` =
// { tabButtons, panels, onSelect, initial }. onSelect(name) lets the caller
// (re)render the active tab. Returns { getActive() } so callers (placement /
// paddle drag) can gate canvas interactions to the active tab.
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

// debug.js — hidden-by-default developer overlay for Ricochet.
//
// Toggled by the backtick (`) key OR a small fixed "🛠" button. Has ZERO effect
// on normal play until toggled open. Lets a developer reset state, grant
// credits/Cores, add/remove every upgrade (and unlock/lock specials), and
// live-tune the game feel (gravity, drag, ball-speed cap, spawn rate) against
// the running sim.
//
// The pure helpers (clampLevel / sliderRange) are unit-tested in debug.test.mjs;
// the DOM wiring (setupDebug) is manually verified.

import { UPGRADES, CORES_UPGRADES, PALETTE, GRAVITY, DRAG, MAX_SPEED, SPAWN_HELPER_DIST, SURFACE_BASE, RAMP_ANGLE, SPECIAL_E, SPECIAL_MAX_SPEED } from './config.js';
import { applyUpgradeEffects } from './economy.js';
import { rebuildColliders, rebuildRamps } from './physics.js';
import { unlockSpecial, SPECIAL_TYPES } from './specials.js';

// --- pure, unit-tested helpers ------------------------------------------

// Clamp an upgrade level into [0, max]. `max` undefined/null -> unbounded above.
export function clampLevel(n, max) {
  return Math.max(0, Math.min(n, max ?? Infinity));
}

// The live-feel slider catalogue: one entry per tunable world field. Each entry
// carries the world key it writes plus a sensible {min, max, step} range built
// around the config default. `value` is the seeded default so the slider can
// initialise without reading the live world. Pure + tested.
const SLIDER_DEFS = {
  gravity:         { worldKey: 'gravity',         label: 'Gravity',          min: 0,    max: GRAVITY * 4,   step: 10,    value: GRAVITY },
  drag:            { worldKey: 'drag',            label: 'Drag',             min: 0.8,  max: 1,             step: 0.001, value: DRAG },
  maxSpeed:        { worldKey: 'maxSpeed',        label: 'Ball Speed Cap',   min: 50,   max: MAX_SPEED * 3, step: 5,     value: MAX_SPEED },
  spawnRate:       { worldKey: 'spawnRate',       label: 'Spawn Rate',       min: 0,    max: 60,            step: 0.5,   value: 4 },
  spawnHelperDist: { worldKey: 'spawnHelperDist', label: 'Aim Assist',       min: 0,    max: 200,           step: 2,     value: SPAWN_HELPER_DIST },
  pegValue:        { label: 'Peg Value',          min: 0,    max: 25,             step: 1,     value: SURFACE_BASE.peg, apply: (world, v) => { world.surfaceBase.peg = v; } },
  rampAngle:       { worldKey: 'rampAngle',       label: 'Ramp Angle',       min: 0,    max: 80,            step: 1,     value: RAMP_ANGLE, apply: (world, v) => { world.rampAngle = v; rebuildRamps(world); } },
  specialE:        { worldKey: 'specialE',        label: 'Special Bounce',    min: 0.5, max: 1.2,                step: 0.01, value: SPECIAL_E },
  specialMaxSpeed: { worldKey: 'specialMaxSpeed', label: 'Special Speed Cap',  min: 50,  max: SPECIAL_MAX_SPEED * 3, step: 10,   value: SPECIAL_MAX_SPEED },
};

// Return the {worldKey, label, min, max, step, value} range descriptor for a
// feel-slider key, or undefined for an unknown key. Pure + tested.
export function sliderRange(key) {
  return SLIDER_DEFS[key];
}

// True when the secret debug gesture's three keys (D, B, G) are all currently
// held. `downSet` is a Set of lowercased key names. Pure + tested.
export function gestureKeysHeld(downSet) {
  return downSet.has('d') && downSet.has('b') && downSet.has('g');
}

// Clamp a raw slider value into its [min, max] range. Pure + tested.
export function clampSlider(key, raw) {
  const r = SLIDER_DEFS[key];
  if (!r) return raw;
  return Math.max(r.min, Math.min(raw, r.max));
}

export const SLIDER_KEYS = ['gravity', 'drag', 'maxSpeed', 'spawnRate', 'spawnHelperDist', 'pegValue', 'rampAngle', 'specialE', 'specialMaxSpeed'];

// --- DOM overlay (manually verified) ------------------------------------

// Small helper: make a styled debug button.
function btn(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'rc-debug-btn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// Build a labelled <section> with a heading.
function section(title) {
  const sec = document.createElement('div');
  sec.className = 'rc-debug__section';
  const h = document.createElement('h4');
  h.className = 'rc-debug__head';
  h.textContent = title;
  sec.append(h);
  return sec;
}

// setupDebug(state, world, ctx)
//   ctx = { onStateChange, updateHUD, refreshShop, formatNumber }
// Creates the toggle button + panel (hidden by default), wires the backtick key,
// and builds all controls. After any state mutation it calls ctx.onStateChange()
// (which re-derives world stats + refreshes the HUD/shop). Live-feel sliders
// write the world field directly (the sim reads world every step) and re-render
// their numeric readout without needing onStateChange.
export function setupDebug(state, world, ctx = {}) {
  if (typeof document === 'undefined') return null; // headless guard
  const fmt = ctx.formatNumber || ((n) => String(Math.round(n)));
  const onStateChange = ctx.onStateChange || (() => {});

  // --- toggle button (always visible, fixed corner) ---
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'rc-debug-toggle';
  toggle.title = 'Toggle debug panel (`)';
  toggle.setAttribute('aria-label', 'Toggle debug panel');
  toggle.textContent = '🛠';

  // --- panel (hidden by default) ---
  const panel = document.createElement('div');
  panel.className = 'rc-debug';
  panel.hidden = true;

  const title = document.createElement('div');
  title.className = 'rc-debug__title';
  title.textContent = 'DEBUG';
  panel.append(title);

  function setOpen(open) {
    panel.hidden = !open;
    toggle.classList.toggle('rc-debug-toggle--on', open);
  }
  function isOpen() { return !panel.hidden; }

  toggle.addEventListener('click', () => setOpen(!isOpen()));

  // Backtick toggles — but never while typing into an input/textarea/editable.
  function isTextTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }
  window.addEventListener('keydown', (e) => {
    if (e.key !== '`' && e.key !== '~') return;
    if (isTextTarget(e.target)) return;
    if (!enabled) return;
    e.preventDefault();
    setOpen(!isOpen());
  });

  // --- a small reusable "refresh everything visible" hook ---
  // After a mutation that changes upgrade levels / credits / cores, re-derive the
  // world and refresh the host HUD/shop, then rebuild the upgrade rows so their
  // level readouts stay in sync.
  let rebuildUpgradeRows = () => {};
  function changed() {
    onStateChange();
    rebuildUpgradeRows();
  }

  // ===== Reset =====
  const resetSec = section('Reset');
  resetSec.append(btn('Disable debug mode & wipe', () => {
    // Route through main.js so it can suppress the unload autosave (which would
    // otherwise re-save the current state during reload and undo the wipe).
    if (ctx.wipeAndReload) { ctx.wipeAndReload(); return; }
    try { localStorage.removeItem('ricochet:save'); } catch (e) { /* ignore */ }
    location.reload();
  }));
  panel.append(resetSec);

  // ===== Grant =====
  const grantSec = section('Grant');
  const creditsRow = document.createElement('div');
  creditsRow.className = 'rc-debug__row';
  for (const [label, amount] of [['+1K', 1e3], ['+1M', 1e6], ['+1B', 1e9]]) {
    creditsRow.append(btn(label, () => { state.credits += amount; changed(); }));
  }
  const coresRow = document.createElement('div');
  coresRow.className = 'rc-debug__row';
  for (const [label, amount] of [['+10 ★', 10], ['+100 ★', 100]]) {
    coresRow.append(btn(label, () => {
      state.cores += amount;
      // bump lifetime too so the leaderboard / HUD reflect granted Cores
      state.lifetimeCores = (state.lifetimeCores || 0) + amount;
      changed();
    }));
  }
  grantSec.append(creditsRow, coresRow);
  panel.append(grantSec);

  // ===== Add / remove upgrades =====
  const upgSec = section('Upgrades');
  const upgList = document.createElement('div');
  upgList.className = 'rc-debug__list';
  upgSec.append(upgList);
  panel.append(upgSec);

  // Build a single +/- row for a levelled upgrade. `store` is the save map
  // (state.upgrades or state.coresShop); `def` is the UPGRADES/CORES_UPGRADES def.
  function buildLevelRow(def, store, tagText) {
    const row = document.createElement('div');
    row.className = 'rc-debug__row rc-debug__upg';

    const label = document.createElement('span');
    label.className = 'rc-debug__upg-label';
    const lvlSpan = document.createElement('b');
    const renderLabel = () => {
      const lvl = store[def.id] || 0;
      label.replaceChildren(document.createTextNode(def.label + ' '));
      if (tagText) {
        const tag = document.createElement('em');
        tag.className = 'rc-debug__tag';
        tag.textContent = tagText;
        label.append(tag, document.createTextNode(' '));
      }
      lvlSpan.textContent = 'Lv ' + lvl + (def.max != null ? '/' + def.max : '');
      label.append(lvlSpan);
    };

    const minus = btn('−', () => {
      const next = clampLevel((store[def.id] || 0) - 1, def.max);
      store[def.id] = next;
      changed();
    });
    const plus = btn('+', () => {
      const next = clampLevel((store[def.id] || 0) + 1, def.max);
      store[def.id] = next;
      changed();
    });
    minus.classList.add('rc-debug-btn--mini');
    plus.classList.add('rc-debug-btn--mini');

    row.append(minus, plus, label);
    renderLabel();
    return { row, renderLabel };
  }

  // Build an unlock/lock row for a special-unlock UPGRADES def (has `unlock`).
  function buildUnlockRow(def) {
    const row = document.createElement('div');
    row.className = 'rc-debug__row rc-debug__upg';
    const type = def.unlock;

    const label = document.createElement('span');
    label.className = 'rc-debug__upg-label';
    const state_ = document.createElement('b');

    const renderLabel = () => {
      const sp = state.specials && state.specials[type];
      const on = !!(sp && sp.unlocked);
      label.replaceChildren(document.createTextNode(def.label + ' '));
      state_.textContent = on ? 'UNLOCKED' : 'locked';
      state_.className = on ? 'rc-debug__on' : 'rc-debug__off';
      label.append(state_);
    };

    const lock = btn('lock', () => {
      const sp = state.specials && state.specials[type];
      if (sp) sp.unlocked = false;
      // clear the unlock row's "owned" marker so the in-game shop can re-offer it
      if (state.upgrades) state.upgrades[def.id] = 0;
      changed();
    });
    const unlock = btn('unlock', () => {
      ctx.unlockSpecial ? ctx.unlockSpecial(type) : unlockSpecial(state.specials, type);
      if (state.upgrades) state.upgrades[def.id] = 1;
      changed();
    });
    lock.classList.add('rc-debug-btn--mini');
    unlock.classList.add('rc-debug-btn--mini');

    row.append(lock, unlock, label);
    renderLabel();
    return { row, renderLabel };
  }

  // Render all upgrade rows. Re-runnable so level readouts refresh after grants.
  const rowRenderers = [];
  function buildAllUpgradeRows() {
    upgList.replaceChildren();
    rowRenderers.length = 0;

    const credHead = document.createElement('p');
    credHead.className = 'rc-debug__subhead';
    credHead.textContent = 'Credits shop';
    upgList.append(credHead);
    for (const def of [...UPGRADES]) {
      const r = def.unlock ? buildUnlockRow(def) : buildLevelRow(def, state.upgrades, null);
      rowRenderers.push(r.renderLabel);
      upgList.append(r.row);
    }

    const coreHead = document.createElement('p');
    coreHead.className = 'rc-debug__subhead';
    coreHead.textContent = 'Cores shop';
    upgList.append(coreHead);
    for (const def of [...CORES_UPGRADES]) {
      const r = buildLevelRow(def, state.coresShop, '★');
      rowRenderers.push(r.renderLabel);
      upgList.append(r.row);
    }

    // Explicit unlock/lock toggle per special (belt-and-suspenders; covers any
    // special not represented by an unlock row in UPGRADES).
    const spHead = document.createElement('p');
    spHead.className = 'rc-debug__subhead';
    spHead.textContent = 'Specials (unlock / lock)';
    upgList.append(spHead);
    for (const type of SPECIAL_TYPES) {
      // synthesize a minimal "def" carrying the unlock key + a label
      const def = { id: '__sp_' + type, unlock: type, label: type.charAt(0).toUpperCase() + type.slice(1) };
      const r = buildUnlockRow(def);
      rowRenderers.push(r.renderLabel);
      upgList.append(r.row);
    }
  }
  rebuildUpgradeRows = () => { for (const r of rowRenderers) r(); };
  buildAllUpgradeRows();

  // ===== Live feel sliders =====
  const feelSec = section('Live feel (applies instantly)');
  for (const key of SLIDER_KEYS) {
    const def = sliderRange(key);
    if (!def) continue;
    const row = document.createElement('div');
    row.className = 'rc-debug__row rc-debug__slider';

    const label = document.createElement('label');
    label.className = 'rc-debug__slider-label';
    label.textContent = def.label;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);
    // seed from the live world if present, else the config default
    const live = world[def.worldKey];
    input.value = String(typeof live === 'number' ? live : def.value);

    const readout = document.createElement('span');
    readout.className = 'rc-debug__readout';
    const fmtVal = (v) => (def.step < 1 ? Number(v).toFixed(3) : fmt(Number(v)));
    readout.textContent = fmtVal(input.value);

    input.addEventListener('input', () => {
      const v = clampSlider(key, Number(input.value));
      if (def.apply) def.apply(world, v);
      else world[def.worldKey] = v;
      readout.textContent = fmtVal(v);
    });

    label.append(input);
    row.append(label, readout);
    feelSec.append(row);
  }
  panel.append(feelSec);

  document.body.append(panel); // panel hidden; toggle appears only once debug is enabled

  let enabled = false;
  let toggleAppended = false;
  // Reveal the 🛠 icon + activate the panel toggle. `taint=true` on a fresh
  // gesture reveal (marks the save debug-used, disables the leaderboard, persists);
  // `taint=false` on load when the save is ALREADY debug-used (just show the icon).
  function enableDebug(taint) {
    if (!toggleAppended) { document.body.append(toggle); toggleAppended = true; }
    enabled = true;
    if (taint && !state.debugUsed) {
      state.debugUsed = true;
      if (ctx.persist) ctx.persist();
      if (ctx.onDebugEnabled) ctx.onDebugEnabled();
    }
  }

  // Secret reveal: hold D + B + G together for 5s. Releasing any cancels.
  const down = new Set();
  let gestureTimer = null;
  function cancelGesture() {
    if (gestureTimer) { clearTimeout(gestureTimer); gestureTimer = null; }
  }
  window.addEventListener('keydown', (e) => {
    if (isTextTarget(e.target)) return;
    const k = (e.key || '').toLowerCase();
    if (k !== 'd' && k !== 'b' && k !== 'g') return;
    down.add(k);
    if (gestureKeysHeld(down) && !gestureTimer && !enabled) {
      gestureTimer = setTimeout(() => { gestureTimer = null; enableDebug(true); }, 5000);
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = (e.key || '').toLowerCase();
    if (k === 'd' || k === 'b' || k === 'g') { down.delete(k); cancelGesture(); }
  });
  // If this save is already debug-tainted, show the icon immediately (no re-taint).
  if (state.debugUsed) enableDebug(false);

  return { toggle, panel, setOpen, isOpen };
}

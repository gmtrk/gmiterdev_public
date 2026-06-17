import { migrate, deserialize, serialize } from './save.js';
import { buildWorld, rebuildColliders, stepPhysics, spawnSpecial, CLACKER, SPLITTER, BURSTER, rebuildRamps } from './physics.js';
import { applyUpgradeEffects, computeEventMult, creditsFromCounters, updateCombo, canPrestige, coresFromRun, prestigeThreshold } from './economy.js';
import {
  specialSpawnPlan, unlockSpecial, SPECIAL_TYPES,
  resolveClack, makeSpecialEmit, chargeBurster, tryBurst, trySplitOnEnv,
} from './specials.js';
import {
  DT, COMBO, ARENA_W, ARENA_H, CEILING_DESKTOP, BALL_RADIUS, PEG_RADIUS, FRAME_BUDGET_MS,
  SPECIAL_CAP, SPAWN_MARGIN, SPAWN_Y, BURSTER as BURSTER_CFG, OFFLINE, DISPLAY_CPS_HALFLIFE,
  RAMP_ANGLE, SPECIAL_RADIUS, BURSTER_RADIUS, PEG_PITCH_X, PEG_PITCH_Y, PEG_FIELD_TOP,
} from './config.js';
import { buildAtlas, draw, createFloatingTextPool, createParticleRing } from './render.js';
import { createLoop, adaptCeiling } from './gameloop.js';
import { spawnTick, buildHudAdapter } from './mainstep.js';
import { formatNumber } from './numfmt.js';
import {
  updateHUD, renderShop, buyUpgrade, coresShopRows, showModal, setupQualityToggle,
  specialUnlockDef, buySpecialUnlock, exportStatCard,
} from './ui.js';
import { setupPlacement, setupTabs, applyPreset } from './input.js';
import { unplacedCount, previewPositions } from './placement.js';
import { makeThrottle } from './throttle.js';
import { projectPrestige, performBigBang, reinitFreshRun } from './prestige.js';
import { buyCoresUpgrade, coresOfflineBonuses } from './coresshop.js';
import { setupLeaderboard } from './leaderboard.js';
import {
  updateEarnRate,
  smoothRate,
  computeOffline,
  grantOffline,
} from './offline.js';
import { motionProfile } from './motion.js';
import { qualityCeiling } from './quality.js';
import { setupDebug } from './debug.js';

const SAVE_KEY = 'ricochet:save';
const AUTOSAVE_INTERVAL = 5; // seconds

// --- load + migrate -> canonical state ---
let raw = null;
try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
const state = migrate(deserialize(raw));

// --- build transient world from state ---
const world = buildWorld(state);
applyUpgradeEffects(world, state);
if (!world.ceiling) world.ceiling = CEILING_DESKTOP;
world.now = 0;

// --- reduced-motion + quality runtime state ---
// Reduced-motion is a live media query; quality is a user toggle persisted in localStorage.
const reducedMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
const runtime = {
  reducedMotion: reducedMotionMQ.matches,
  lowQuality: localStorage.getItem('ricochet:lowQuality') === 'true',
};
reducedMotionMQ.addEventListener('change', (e) => { runtime.reducedMotion = e.matches; });
function currentMotion() {
  return motionProfile({ reducedMotion: runtime.reducedMotion, lowQuality: runtime.lowQuality });
}
// Apply the quality clamp to the live ceiling whenever the toggle changes.
// Derive from the DESIGN target (not the already-lowered live ceiling) so toggling
// high quality back ON restores the full ceiling instead of pinning the lowered value.
const designCeiling = world.targetCeiling != null ? world.targetCeiling : (world.ceiling || CEILING_DESKTOP);
world.targetCeiling = designCeiling; // persist the design target on the world for restores
function applyQuality() {
  world.ceiling = qualityCeiling(world.targetCeiling, runtime.lowQuality);
}
window.__ricochetSetLowQuality = (on) => {
  runtime.lowQuality = on;
  localStorage.setItem('ricochet:lowQuality', String(on));
  applyQuality();
};
applyQuality();

// --- transient run object (not persisted) ---
const run = {
  comboBonus: 0,
  comboCapBonus: COMBO.capBonusStart,
  creditsPerSec: 0,
  now: 0,
  lastAutosave: 0,
  spawnRate: 1, // 1 ball/sec = the base 1.0s respawn interval; world.spawnRate overrides
};
if (typeof world.spawnRate === 'number') run.spawnRate = world.spawnRate;

// --- canvas + render setup ---
const canvas = document.getElementById('ricochet-canvas');
const ctx = canvas.getContext('2d');
const ATLAS_PALETTE = { ballCyan: '#22e0ff', ballYellow: '#fff14a', peg: '#ff3df0', clacker: '#22e0ff', splitter: '#ff3df0', burster: '#ffb347' };
function currentDpr() {
  return Math.min(window.devicePixelRatio || 1, 2);
}
let dpr = currentDpr();

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
}
fitCanvas();

// The sprite atlas is rendered at the device pixel ratio; if the DPR changes
// (e.g. dragging the window between displays) the atlas must be rebuilt or
// sprites blur/alias. Debounced (~150ms) so a burst of resize events triggers a
// single refit + at most one atlas rebuild.
let atlas = buildAtlas(ATLAS_PALETTE, [BALL_RADIUS, PEG_RADIUS, SPECIAL_RADIUS, BURSTER_RADIUS], dpr);
let _resizeTimer = 0;
window.addEventListener('resize', () => {
  if (_resizeTimer) clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    _resizeTimer = 0;
    const ndpr = currentDpr();
    if (ndpr !== dpr) {
      dpr = ndpr;
      atlas = buildAtlas(ATLAS_PALETTE, [BALL_RADIUS, PEG_RADIUS, SPECIAL_RADIUS, BURSTER_RADIUS], dpr);
    }
    fitCanvas();
  }, 150);
});

const floatingText = createFloatingTextPool(64);
const particles = createParticleRing(512);

const view = {
  PALETTE: { bg: '#0a0a16', ballCyan: '#22e0ff', ballYellow: '#fff14a', peg: '#ff3df0', clacker: '#22e0ff', splitter: '#ff3df0', burster: '#ffb347' },
  floatingText,
  particles,
  place: { active: false },
};

// --- UI bootstrap --------------------------------------------------------
const $ = (id) => document.getElementById(id);

// HUD nodes (resolved once). The template ships CREDITS / PER SEC / BALLS /
// COMBO; we add a SATURATION stat node so updateHUD's full adapter shape is
// honoured. The adapter writes ballCount/capacity into `balls`, so the
// template's separate rc-capacity span is left as a static placeholder.
const hudContainer = $('rc-hud');
let hudSaturation = $('rc-saturation');
if (hudContainer && !hudSaturation) {
  const stat = document.createElement('span');
  stat.className = 'rc-hud__stat';
  stat.append('SAT ');
  hudSaturation = document.createElement('b');
  hudSaturation.id = 'rc-saturation';
  hudSaturation.textContent = '0%';
  stat.append(hudSaturation);
  hudContainer.append(stat);
}
const hudEls = {
  credits: $('rc-credits'),
  creditsPerSec: $('rc-cps'),
  cores: $('rc-cores'),
  balls: $('rc-balls'),
  saturation: hudSaturation,
  combo: $('rc-combo'),
};

// Module-scope references to the ramp-angle control nodes (built below, used by
// refreshRampControl which is called from multiple call sites).
let rampRow, rampSlider, rampReadout;

// Module-scope references to the peg-spread control nodes (built below, used by
// refreshSpreadControl which is called from multiple call sites).
let spreadRow, spreadApplyBtn;
const spreadSliders = {}; // { pitchX, pitchY, fieldTop } -> { input, readout }
const pendingSpread = { pitchX: PEG_PITCH_X, pitchY: PEG_PITCH_Y, fieldTop: PEG_FIELD_TOP };

// Build the right-panel scaffold (Credits shop rows + Place tools/presets)
// inside the template's empty #rc-tab-body. The Cores panel is authored in
// Phase 7; we leave a placeholder so the tab toggles cleanly.
const tabBody = $('rc-tab-body');
let shopContainer = $('rc-shop-rows');
if (tabBody && !shopContainer) {
  const creditsPanel = document.createElement('div');
  creditsPanel.dataset.panel = 'credits';
  shopContainer = document.createElement('div');
  shopContainer.id = 'rc-shop-rows';
  shopContainer.className = 'rc-shop';
  creditsPanel.append(shopContainer);

  const coresPanel = document.createElement('div');
  coresPanel.dataset.panel = 'cores';
  coresPanel.hidden = true;
  const coresRows = document.createElement('div');
  coresRows.id = 'rc-cores-rows';
  coresRows.className = 'rc-shop';
  const bigBang = document.createElement('button');
  bigBang.type = 'button';
  bigBang.id = 'big-bang-btn';
  bigBang.className = 'rc-bigbang';
  bigBang.textContent = 'Big Bang';
  coresPanel.append(coresRows, bigBang);

  const placePanel = document.createElement('div');
  placePanel.dataset.panel = 'place';
  placePanel.hidden = true;
  const placeHint = document.createElement('p');
  placeHint.className = 'rc-place-hint';
  placeHint.textContent =
    'Pick a tool, then click or drag in the arena to place pegs. The auto-fill '
    + 'buttons lay out peg patterns. Buy Ramps in the shop to add bouncy walls.';
  const toolHead = document.createElement('p');
  toolHead.className = 'rc-place-subhead';
  toolHead.textContent = 'Tools';
  const toolRow = document.createElement('div');
  toolRow.className = 'rc-toolrow';
  for (const [tool, label] of [['peg', 'Peg'], ['block', 'Block'], ['remove', 'Remove']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rc-tool' + (tool === 'peg' ? ' rc-tool--active' : '');
    b.dataset.tool = tool;
    b.textContent = label;
    toolRow.append(b);
  }
  const presetHead = document.createElement('p');
  presetHead.className = 'rc-place-subhead';
  presetHead.textContent = 'Auto-fill pegs';
  const presetRow = document.createElement('div');
  presetRow.className = 'rc-presetrow';
  for (const [preset, label] of [['triangle', 'Triangle'], ['diamond', 'Diamond'], ['funnel', 'Funnel']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rc-preset';
    b.dataset.preset = preset;
    b.textContent = label;
    presetRow.append(b);
  }
  rampRow = document.createElement('div');
  rampRow.className = 'rc-ramp-control';
  rampRow.hidden = true; // shown only once Ramp Tuning is unlocked
  const rampLabel = document.createElement('label');
  rampLabel.className = 'rc-place-subhead';
  rampLabel.textContent = 'Ramp angle';
  rampSlider = document.createElement('input');
  rampSlider.type = 'range';
  rampSlider.min = '5';
  rampSlider.max = '70';
  rampSlider.step = '1';
  rampReadout = document.createElement('span');
  rampReadout.className = 'rc-ramp-readout';
  rampRow.append(rampLabel, rampSlider, rampReadout);

  // Peg-spread control (Place tab) — shown only once Peg Spread is unlocked.
  // Three sliders preview a ghost of the auto-fill formation; Apply commits it.
  spreadRow = document.createElement('div');
  spreadRow.className = 'rc-spread-control';
  spreadRow.hidden = true;
  const spreadHead = document.createElement('p');
  spreadHead.className = 'rc-place-subhead';
  spreadHead.textContent = 'Peg spread';
  spreadRow.append(spreadHead);
  for (const [key, label, min, max, step] of [
    ['pitchX', 'Spacing X', 110, 500, 5],
    ['pitchY', 'Spacing Y', 110, 500, 5],
    ['fieldTop', 'Start Y', 100, 1200, 5],
  ]) {
    const wrap = document.createElement('label');
    wrap.className = 'rc-spread-row';
    wrap.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min); input.max = String(max); input.step = String(step);
    input.dataset.spread = key;
    const readout = document.createElement('span');
    readout.className = 'rc-spread-readout';
    wrap.append(input, readout);
    spreadRow.append(wrap);
    spreadSliders[key] = { input, readout };
  }
  spreadApplyBtn = document.createElement('button');
  spreadApplyBtn.type = 'button';
  spreadApplyBtn.className = 'rc-spread-apply';
  spreadApplyBtn.textContent = 'Apply spread';
  spreadRow.append(spreadApplyBtn);

  placePanel.append(placeHint, toolHead, toolRow, presetHead, presetRow, rampRow, spreadRow);

  tabBody.append(creditsPanel, coresPanel, placePanel);
}

function persistSave() {
  try { localStorage.setItem(SAVE_KEY, serialize(state)); } catch (e) { /* storage full/blocked */ }
}

const placeTabBtn = document.querySelector('[data-tab="place"]');
const placeBadge = document.createElement('span');
placeBadge.className = 'rc-tab-badge';
placeBadge.hidden = true;
if (placeTabBtn) placeTabBtn.append(placeBadge);
function refreshPlaceBadge() {
  const n = unplacedCount(world.budgets, state.placed);
  placeBadge.textContent = String(n);
  placeBadge.hidden = n <= 0;
}
const pegToolBtn = document.querySelector('[data-tool="peg"]');
const blockToolBtn = document.querySelector('[data-tool="block"]');
const pegToolCount = document.createElement('span');
pegToolCount.className = 'rc-tool__count';
const blockToolCount = document.createElement('span');
blockToolCount.className = 'rc-tool__count';
if (pegToolBtn) pegToolBtn.append(pegToolCount);
if (blockToolBtn) blockToolBtn.append(blockToolCount);
function refreshToolCounts() {
  pegToolCount.textContent = ' (' + Math.max(0, world.budgets.pegs - state.placed.pegs.length) + ')';
  blockToolCount.textContent = ' (' + Math.max(0, world.budgets.blocks - state.placed.blocks.length) + ')';
}
const triangleBtn = document.querySelector('[data-preset="triangle"]');
function refreshPresetHint() {
  if (!triangleBtn) return;
  const unplacedPegs = Math.max(0, world.budgets.pegs - state.placed.pegs.length);
  const suggest = unplacedPegs > 0 && !state.placed.preset;
  triangleBtn.classList.toggle('rc-preset--suggest', suggest);
}
refreshPlaceBadge(); refreshToolCounts(); refreshPresetHint();

function refreshRampControl() {
  if (!rampRow) return;
  rampRow.hidden = !world.rampAngleUnlocked;
  if (world.rampAngleUnlocked) {
    const a = state.placed.rampAngle != null ? state.placed.rampAngle : RAMP_ANGLE;
    rampSlider.value = String(a);
    rampReadout.textContent = a + '°';
  }
}

function refreshSpreadControl() {
  if (!spreadRow) return;
  spreadRow.hidden = !world.pegSpreadUnlocked;
  if (!world.pegSpreadUnlocked) return;
  const s = state.placed.spread || world.pegSpread || { pitchX: PEG_PITCH_X, pitchY: PEG_PITCH_Y, fieldTop: PEG_FIELD_TOP };
  for (const key of ['pitchX', 'pitchY', 'fieldTop']) {
    pendingSpread[key] = s[key];
    spreadSliders[key].input.value = String(s[key]);
    spreadSliders[key].readout.textContent = Math.round(s[key]) + 'px';
  }
}

function refreshShop() {
  renderShop('credits', {
    container: shopContainer,
    state,
    onBuy: (id) => {
      // Special-unlock rows route to the unlock+seed path (debits credits,
      // flips state.specials[type].unlocked, spawns the starter pack) instead
      // of the generic levelled buyUpgrade.
      if (specialUnlockDef(id)) {
        if (buySpecialUnlock(state, id, (type) => unlockSpecialAndSeed(state, world, type))) {
          refreshShop();
        }
        return;
      }
      if (buyUpgrade(world, state, id, applyUpgradeEffects)) {
        rebuildColliders(world); // budget upgrades may change placement room
        if (id === 'pegBudget' && state.placed.preset) {
          state.placed.pegs = [];  // regenerate the full formation at the new budget
          applyPreset(state.placed.preset, world, state.placed);
          rebuildColliders(world);
        }
        refreshShop();
        refreshRampControl();
        refreshSpreadControl();
        refreshPlaceBadge(); refreshToolCounts(); refreshPresetHint();
      }
    },
  });
}
refreshShop();

// Wire the ramp-angle slider (handler runs whenever the slider moves).
// rampSlider is only set if the tabBody block ran (i.e. DOM is present).
if (rampSlider) {
  rampSlider.addEventListener('input', () => {
    const a = Number(rampSlider.value);
    state.placed.rampAngle = a;
    world.rampAngle = a;
    rebuildRamps(world);
    rampReadout.textContent = a + '°';
    persistSave();
  });
}

// Wire the spread sliders: each input updates pendingSpread + readout + live ghost.
function updateSpreadGhost() {
  const count = Math.max(0, world.budgets.pegs);
  const name = state.placed.preset || 'triangle';
  view.spreadPreview = { active: true, positions: previewPositions(name, pendingSpread, count) };
}
if (spreadRow) {
  for (const key of ['pitchX', 'pitchY', 'fieldTop']) {
    spreadSliders[key].input.addEventListener('input', () => {
      pendingSpread[key] = Number(spreadSliders[key].input.value);
      spreadSliders[key].readout.textContent = Math.round(pendingSpread[key]) + 'px';
      updateSpreadGhost();
    });
  }
}

// Apply commits the pending spread: writes state + world, re-lays the preset, persists.
if (spreadApplyBtn) {
  spreadApplyBtn.addEventListener('click', () => {
    state.placed.spread = { pitchX: pendingSpread.pitchX, pitchY: pendingSpread.pitchY, fieldTop: pendingSpread.fieldTop };
    world.pegSpread = { pitchX: pendingSpread.pitchX, pitchY: pendingSpread.pitchY, fieldTop: pendingSpread.fieldTop };
    // Re-lay the active preset at the new spread (hand-placed pegs are left alone).
    if (state.placed.preset) {
      state.placed.pegs = [];
      applyPreset(state.placed.preset, world, state.placed);
    }
    rebuildColliders(world);
    view.spreadPreview = { active: false, positions: [] };
    persistSave();
    refreshPlaceBadge(); refreshToolCounts();
  });
}

// ---- Cores tab: render rows + handle buys ----
const coresRowsEl = $('rc-cores-rows');
function refreshCoresTab() {
  if (!coresRowsEl) return;
  renderShop('cores', {
    container: coresRowsEl,
    rows: coresShopRows(state),
    onBuy: (id) => {
      if (buyCoresUpgrade(world, state, id)) {
        persistSave();
        refreshCoresTab();
      }
    },
  });
}
refreshCoresTab();

// ---- Big Bang (prestige) ----
function onBigBangClicked() {
  const runCredits = Number(state.credits);
  const threshold = prestigeThreshold(state.prestigeCount || 0);
  if (!canPrestige(runCredits, threshold)) {
    showModal({
      title: 'Not yet',
      body: `Reach more credits before a Big Bang (need ${formatNumber(threshold)}).`,
      confirmLabel: 'OK',
    });
    return;
  }
  const proj = projectPrestige(state);
  showModal({
    title: 'Big Bang?',
    body:
      `Convert this run into +${formatNumber(proj.cores)} Cores ` +
      `(lifetime → ${formatNumber(proj.lifetimeAfter)}).\n` +
      `Felt boost: next run ≈ ${proj.speedup.toFixed(1)}× faster.`,
    confirmLabel: `Big Bang (+${formatNumber(proj.cores)} ★)`,
    cancelLabel: 'Cancel',
    onConfirm: () => {
      performBigBang(state);             // grant cores; reset run; persist partition keeps coresShop + blueprint
      state.stats.runEarnings = 0;       // runEarnings is per-run; the new run starts fresh
      applyUpgradeEffects(world, state); // re-derive world.budgets + world.startCreditsMult from the post-reset state
      reinitFreshRun(world, state);      // re-seed credits + blueprint clamped to the (now re-derived) budgets + head-start
      persistSave();
      refreshShop();
      refreshCoresTab();
      refreshPlaceBadge(); refreshToolCounts(); refreshPresetHint();
      refreshSpreadControl();
      // Immediate HUD refresh so the new Cores total shows at once (the throttled
      // render-loop HUD would otherwise lag up to ~166ms).
      updateHUD(buildHudAdapter(state, world, run), hudEls);
      // Push the new Cores total AFTER cores are granted, so shouldAutoUpdate() sees
      // the freshly-bumped state.lifetimeCores.
      leaderboard.onBigBang();
    },
  });
}
const bigBangBtn = $('big-bang-btn');
if (bigBangBtn) bigBangBtn.addEventListener('click', onBigBangClicked);
// Reflect the prestige gate on the Big Bang button: a requirement when locked,
// the projected Cores payout when ready. Called from the throttled HUD tick.
function refreshBigBang() {
  if (!bigBangBtn) return;
  const credits = Number(state.credits);
  const threshold = prestigeThreshold(state.prestigeCount || 0);
  if (credits >= threshold) {
    bigBangBtn.classList.remove('rc-bigbang--locked');
    bigBangBtn.textContent = `Big Bang (+${formatNumber(coresFromRun(credits))} ★)`;
  } else {
    bigBangBtn.classList.add('rc-bigbang--locked');
    bigBangBtn.textContent = `Big Bang — need ${formatNumber(threshold)}`;
  }
}
refreshBigBang();

// ---- Offline earnings on load ("while you were gone") ----
function runOfflineOnLoad() {
  const now = Date.now();
  const { efficiencyAdd, capAdd } = coresOfflineBonuses(world);
  const result = computeOffline(state.stats, now, efficiencyAdd, capAdd);
  if (!result.showModal) {
    // No prior save / zero rate / future-dated: just stamp the clock and move on.
    state.stats.lastSaveTime = now;
    persistSave();
    return;
  }
  showModal({
    title: 'While you were gone…',
    body:
      `You were away ${Math.round(result.awaySeconds / 60)} min.\n` +
      `Earned +${formatNumber(result.credits)} credits ` +
      `(at ${Math.round(result.efficiency * 100)}% efficiency).`,
    confirmLabel: 'Collect',
    onConfirm: () => {
      grantOffline(state, result.credits, Date.now());
      persistSave();
    },
  });
}
runOfflineOnLoad();

const tabs = setupTabs({
  tabButtons: Array.from(document.querySelectorAll('[data-tab]')),
  panels: Array.from(document.querySelectorAll('[data-panel]')),
  onSelect: (name) => {
    if (name !== 'place' && view.spreadPreview) view.spreadPreview.active = false;
    if (name === 'credits') refreshShop();
    else if (name === 'cores') refreshCoresTab();
    else if (name === 'place') { refreshRampControl(); refreshSpreadControl(); }
    else if (name === 'scores') leaderboard.refresh();
    // Arena cursor affordance: only the Place tab edits the arena.
    canvas.classList.toggle('rc-canvas--place', name === 'place');
    if (name !== 'place' && view.place) view.place.active = false;
    refreshPlaceBadge(); refreshToolCounts(); refreshPresetHint();
  },
});
// Reflect the initially-active tab on the canvas cursor (onSelect only fires on
// a click, so seed the crosshair class from the starting tab here).
canvas.classList.toggle('rc-canvas--place', tabs.getActive() === 'place');
// Seed the ramp control visibility/value from the loaded state.
refreshRampControl(); refreshSpreadControl();
// Arena editing (placement + paddle drag) is gated to the Place tab so clicking
// the arena on Credits/Cores/Scores can't silently mutate the blueprint.
const isPlaceActive = () => tabs.getActive() === 'place';
setupPlacement({
  canvas,
  world,
  state,
  toolButtons: Array.from(document.querySelectorAll('[data-tool]')),
  presetButtons: Array.from(document.querySelectorAll('[data-preset]')),
  onChange: () => { refreshShop(); refreshPlaceBadge(); refreshToolCounts(); refreshPresetHint(); refreshSpreadControl(); },
  isActive: isPlaceActive,
  view,
});
setupQualityToggle(window.__ricochetSetLowQuality, runtime.lowQuality);

// Module-scope so onBigBangClicked can call leaderboard.onBigBang().
const leaderboard = setupLeaderboard(state, { persist: persistSave });

// ---- Share stat-card ----
// Renders the live arena + headline numbers (lifetime cores + the run stats
// tracked in step()) into a downloadable PNG. lifetimeCores lives on `state`,
// the rest on `state.stats`, so assemble the headline object exportStatCard reads.
const statCardBtn = $('rc-statcard-btn');
if (statCardBtn) {
  statCardBtn.addEventListener('click', () => {
    exportStatCard(
      canvas,
      { ...state.stats, lifetimeCores: state.lifetimeCores },
      view.PALETTE,
    );
  });
}

const hudGate = makeThrottle(166); // ~6 Hz
const shopGate = makeThrottle(500); // refresh affordability twice per second

// --- special spawning ---------------------------------------------------
// Map save-key type names to the physics.js type constants.
const SPECIAL_TYPE_CONST = { clacker: CLACKER, splitter: SPLITTER, burster: BURSTER };

// Count live specials per type from world.special (indices are not stable, so we
// recount each tick rather than caching).
function liveSpecialCounts(world) {
  const counts = { clacker: 0, splitter: 0, burster: 0 };
  const sp = world.special;
  for (let i = 0; i < sp.count; i++) {
    if (sp.type[i] === CLACKER) counts.clacker++;
    else if (sp.type[i] === SPLITTER) counts.splitter++;
    else if (sp.type[i] === BURSTER) counts.burster++;
  }
  return counts;
}

// Spawn specials for this tick, bounded by per-type capacity and SPECIAL_CAP.
function spawnSpecialsTick(state, world) {
  const live = liveSpecialCounts(world);
  const plan = specialSpawnPlan(state.specials, live, SPECIAL_CAP);
  for (const t of SPECIAL_TYPES) {
    for (let k = 0; k < plan[t]; k++) {
      const x = SPAWN_MARGIN + Math.random() * (ARENA_W - 2 * SPAWN_MARGIN);
      spawnSpecial(world, SPECIAL_TYPE_CONST[t], x, SPAWN_Y);
    }
  }
}

// Called by the Credits-shop unlock handler with a save-key type name: unlock the
// special and immediately seed its starter pack so the heartbeat is instant
// (clamped against the global cap; the spawn tick keeps it bounded thereafter).
function unlockSpecialAndSeed(state, world, typeName) {
  const granted = unlockSpecial(state.specials, typeName);
  if (granted <= 0) return;
  const live = liveSpecialCounts(world);
  const liveTotal = live.clacker + live.splitter + live.burster;
  const globalFree = Math.max(0, SPECIAL_CAP - liveTotal);
  const toSpawn = Math.min(granted, globalFree);
  for (let k = 0; k < toSpawn; k++) {
    const x = SPAWN_MARGIN + Math.random() * (ARENA_W - 2 * SPAWN_MARGIN);
    spawnSpecial(world, SPECIAL_TYPE_CONST[typeName], x, SPAWN_Y);
  }
}

// --- the fixed-timestep step ---
function step(dt) {
  run.now += dt;
  world.now = run.now;

  // 1) spawn tick (normal balls + golden roll), then specials (bounded by cap).
  //    Spawn rate is read off the world each step (seeded in buildWorld, kept in
  //    sync with run.spawnRate) so the debug panel's spawn-rate slider applies live.
  spawnTick(world, dt, world.spawnRate != null ? world.spawnRate : run.spawnRate);
  spawnSpecialsTick(state, world);

  // 2) physics (both pools, block runtime, golden/break counters into world.counters).
  //    Supply the special emit + resolveClack so the special-vs-special clack pass
  //    fires (Clacker credits feed state.credits; Splitter spawns NORMAL cap-exempt
  //    balls into reserved-owned headroom via makeSpecialEmit).
  const emit = makeSpecialEmit(world, (n) => { state.credits += n; });
  stepPhysics(world, dt, run.now, emit, resolveClack);

  // 2b) Burster env-charge/burst pass: this step's environmental bounces
  //     (world.special.envHits, repopulated each step in stepPhysics) become
  //     charge; a Burster over threshold bursts cap-exempt NORMAL balls (same emit).
  const sp = world.special;
  for (let i = 0; i < sp.count; i++) {
    chargeBurster(sp, i, sp.envHits[i] * BURSTER_CFG.chargePerBounce);
    tryBurst(world, i, emit);
    trySplitOnEnv(world, i, emit);
  }

  // 3) combo update — scored this step if any surface contact happened
  const c = world.counters;
  const scoredThisStep = (c.wall + c.peg + c.block) > 0;
  run.comboBonus = updateCombo(run.comboBonus, scoredThisStep, dt, {
    gainPerSec: COMBO.gainPerSec,
    decayPerSec: world.comboDecay != null ? world.comboDecay : COMBO.decayPerSec,
    perStepGainCap: COMBO.perStepGainCap,
    gainFalloff: COMBO.gainFalloff,
    cap: run.comboCapBonus,
  });

  // 4) CREDITS ACCRUAL — eventMult MUST use goldenBonus/breakBonus, never 0,0
  const eventMult = computeEventMult(run.comboBonus, c.goldenBonus, c.breakBonus);
  const gained = creditsFromCounters(c, world.surfaceBase, world.globalValueMult, eventMult);
  state.credits += gained;
  run.creditsPerSec = smoothRate(run.creditsPerSec, gained / dt, dt, DISPLAY_CPS_HALFLIFE);

  // 4b) lightweight stat-card tracking (headline numbers for exportStatCard):
  //   runEarnings    = credits gained this run (reset on Big Bang)
  //   biggestBallCount = max world.normal.count seen
  //   peakCombo      = max comboBonus reached
  const st = state.stats;
  st.runEarnings = (st.runEarnings || 0) + gained;
  if (world.normal.count > (st.biggestBallCount || 0)) st.biggestBallCount = world.normal.count;
  if (run.comboBonus > (st.peakCombo || 0)) st.peakCombo = run.comboBonus;

  // FX feed (legible spectacle on notable hits only)
  if (c.block > 0 || c.goldenBonus > 0) {
    floatingText.spawn(world.W / 2, world.H * 0.5, '+' + formatNumber(gained));
  }
  floatingText.update(dt);
  particles.update(dt);

  // 5) autosave gate
  if (run.now - run.lastAutosave >= AUTOSAVE_INTERVAL) {
    const secondsSinceLastAutosave = run.now - run.lastAutosave;
    run.lastAutosave = run.now;
    // Down-weighted EMA of the steady earn rate; golden/burst spikes are smoothed out.
    state.stats.recentEarnRate = updateEarnRate(
      state.stats.recentEarnRate,
      run.creditsPerSec,
      secondsSinceLastAutosave,
      OFFLINE.emaHalfLifeSec,
    );
    state.stats.lastSaveTime = Date.now();
    persistSave();
  }
}

// --- render ---
function render() {
  const motion = currentMotion();
  view.motion = motion;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // letterbox transform: scale virtual ARENA_W x ARENA_H to the physical canvas
  const scale = Math.min(canvas.width / ARENA_W, canvas.height / ARENA_H);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  draw(ctx, world, atlas, view);
  ctx.restore();

  const ms = performance.now();
  if (hudGate(ms)) { updateHUD(buildHudAdapter(state, world, run), hudEls); refreshBigBang(); }
  if (shopGate(ms)) refreshShop();
}

// --- adaptive ceiling driven by frame time ---
// The adaptive max is the QUALITY-CLAMPED design ceiling (not raw CEILING_DESKTOP)
// so under-budget growth respects the low-quality clamp instead of undoing it
// within seconds.
function onFrameTime(ms) {
  const max = qualityCeiling(world.targetCeiling, runtime.lowQuality);
  world.ceiling = adaptCeiling(world.ceiling, ms, FRAME_BUDGET_MS, 100, max);
}

// --- save on tab hide ---
// Set true during a debug "wipe save", so the pagehide/visibilitychange autosave
// fired by location.reload() can't write the (un-wiped) in-memory state back and
// resurrect the save we just removed.
let suppressSave = false;
function saveNow() {
  if (suppressSave) return;
  state.stats.lastSaveTime = Date.now();
  try { localStorage.setItem(SAVE_KEY, serialize(state)); } catch (e) { /* ignore */ }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
window.addEventListener('pagehide', saveNow);

// Expose the special-unlock buy action for the Credits-shop unlock handler.
// When the shop surfaces "unlock Clacker/Splitter/Burster", its onBuy routes
// here so the unlock grants and seeds the starter pack instantly.
window.__ricochet = window.__ricochet || {};
window.__ricochet.unlockSpecial = (typeName) => unlockSpecialAndSeed(state, world, typeName);

// --- debug overlay (hidden by default; toggled by ` or the 🛠 button) -------
// onStateChange re-derives the world from the (mutated) state and refreshes every
// host surface so debug grants/upgrade tweaks/unlock toggles apply live.
setupDebug(state, world, {
  formatNumber,
  // Wipe the save without the unload autosave resurrecting it: suppress saves,
  // remove the key, then reload to a fresh defaultSave.
  wipeAndReload: () => {
    suppressSave = true;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    location.reload();
  },
  updateHUD,
  refreshShop,
  onStateChange: () => {
    applyUpgradeEffects(world, state);
    rebuildColliders(world); // budget changes may free/limit placement room
    refreshShop();
    refreshCoresTab();
    updateHUD(buildHudAdapter(state, world, run), hudEls);
    persistSave();
  },
  // route special unlocks through the real unlock+seed path so the pool actually
  // spawns the starter pack immediately (matches the in-game shop behaviour)
  unlockSpecial: (type) => unlockSpecialAndSeed(state, world, type),
  persist: persistSave,
  onDebugEnabled: () => leaderboard.refresh(),
});

const loop = createLoop({ step, render, onFrameTime });
loop.start();

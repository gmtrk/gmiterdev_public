import { migrate, deserialize, serialize } from './save.js';
import { buildWorld, rebuildColliders, stepPhysics, spawnSpecial, CLACKER, SPLITTER, BURSTER } from './physics.js';
import { applyUpgradeEffects, computeEventMult, creditsFromCounters, updateCombo, canPrestige } from './economy.js';
import {
  specialSpawnPlan, unlockSpecial, SPECIAL_TYPES,
  resolveClack, makeSpecialEmit, chargeBurster, tryBurst,
} from './specials.js';
import {
  DT, SURFACE_BASE, COMBO, ARENA_W, ARENA_H, CEILING_DESKTOP, BALL_RADIUS, PEG_RADIUS, FRAME_BUDGET_MS,
  SPECIAL_CAP, SPAWN_MARGIN, SPAWN_Y, BURSTER as BURSTER_CFG, OFFLINE, PRESTIGE,
} from './config.js';
import { buildAtlas, draw, createFloatingTextPool, createParticleRing } from './render.js';
import { createLoop, adaptCeiling } from './gameloop.js';
import { spawnTick, buildHudAdapter } from './mainstep.js';
import { formatNumber } from './numfmt.js';
import { updateHUD, renderShop, buyUpgrade, coresShopRows, showModal } from './ui.js';
import { setupPlacement, setupPaddleDrag, setupTabs } from './input.js';
import { makeThrottle } from './throttle.js';
import { projectPrestige, performBigBang, reinitFreshRun } from './prestige.js';
import { buyCoresUpgrade, coresOfflineBonuses } from './coresshop.js';
import {
  updateEarnRate,
  computeOffline,
  grantOffline,
} from './offline.js';

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

// --- transient run object (not persisted) ---
const run = {
  comboBonus: 0,
  comboCapBonus: COMBO.capBonusStart,
  creditsPerSec: 0,
  now: 0,
  lastAutosave: 0,
  spawnRate: 4, // balls/sec baseline; overridden by applyUpgradeEffects if it sets world.spawnRate
};
if (typeof world.spawnRate === 'number') run.spawnRate = world.spawnRate;

// --- canvas + render setup ---
const canvas = document.getElementById('ricochet-canvas');
const ctx = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

const atlas = buildAtlas(
  { ballCyan: '#22e0ff', ballYellow: '#fff14a', peg: '#ff3df0', clacker: '#22e0ff', splitter: '#ff3df0', burster: '#ffb347' },
  [BALL_RADIUS, PEG_RADIUS],
  dpr,
);

const floatingText = createFloatingTextPool(64);
const particles = createParticleRing(512);

const view = {
  PALETTE: { bg: '#0a0a16', ballCyan: '#22e0ff', ballYellow: '#fff14a', peg: '#ff3df0', clacker: '#22e0ff', splitter: '#ff3df0', burster: '#ffb347' },
  floatingText,
  particles,
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
  balls: $('rc-balls'),
  saturation: hudSaturation,
  combo: $('rc-combo'),
};

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
  placePanel.append(toolRow, presetRow);

  tabBody.append(creditsPanel, coresPanel, placePanel);
}

function persistSave() {
  try { localStorage.setItem(SAVE_KEY, serialize(state)); } catch (e) { /* storage full/blocked */ }
}

function refreshShop() {
  renderShop('credits', {
    container: shopContainer,
    state,
    onBuy: (id) => {
      if (buyUpgrade(world, state, id, applyUpgradeEffects)) {
        rebuildColliders(world); // budget upgrades may change placement room
        refreshShop();
      }
    },
  });
}
refreshShop();

// ---- Cores tab: render rows + handle buys ----
const coresRowsEl = $('rc-cores-rows');
function refreshCoresTab() {
  if (!coresRowsEl) return;
  renderShop('cores', {
    container: coresRowsEl,
    rows: coresShopRows(state),
    cores: state.cores,
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
  if (!canPrestige(runCredits)) {
    showModal({
      title: 'Not yet',
      body: `Reach more credits before a Big Bang (need ${formatNumber(PRESTIGE.minCredits)}).`,
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
      applyUpgradeEffects(world, state); // re-derive world.budgets + world.startCreditsMult from the post-reset state
      reinitFreshRun(world, state);      // re-seed credits + blueprint clamped to the (now re-derived) budgets + head-start
      persistSave();
      refreshShop();
      refreshCoresTab();
    },
  });
}
const bigBangBtn = $('big-bang-btn');
if (bigBangBtn) bigBangBtn.addEventListener('click', onBigBangClicked);

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

setupTabs({
  tabButtons: Array.from(document.querySelectorAll('[data-tab]')),
  panels: Array.from(document.querySelectorAll('[data-panel]')),
  onSelect: (name) => {
    if (name === 'credits') refreshShop();
    else if (name === 'cores') refreshCoresTab();
  },
});
setupPlacement({
  canvas,
  world,
  state,
  toolButtons: Array.from(document.querySelectorAll('[data-tool]')),
  presetButtons: Array.from(document.querySelectorAll('[data-preset]')),
  onChange: refreshShop,
});
setupPaddleDrag({ canvas, world, state, onChange: () => {} });

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

  // 1) spawn tick (normal balls + golden roll), then specials (bounded by cap)
  spawnTick(world, dt, run.spawnRate);
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
  }

  // 3) combo update — scored this step if any surface contact happened
  const c = world.counters;
  const scoredThisStep = (c.wall + c.peg + c.block) > 0;
  run.comboBonus = updateCombo(run.comboBonus, scoredThisStep, dt, {
    gainPerSec: COMBO.gainPerSec,
    decayPerSec: COMBO.decayPerSec,
    capBonus: run.comboCapBonus,
    perStepGainCap: COMBO.perStepGainCap,
  });

  // 4) CREDITS ACCRUAL — eventMult MUST use goldenBonus/breakBonus, never 0,0
  const eventMult = computeEventMult(run.comboBonus, c.goldenBonus, c.breakBonus);
  const gained = creditsFromCounters(c, SURFACE_BASE, world.globalValueMult, eventMult);
  state.credits += gained;
  run.creditsPerSec = gained / dt;

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
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // letterbox transform: scale virtual ARENA_W x ARENA_H to the physical canvas
  const scale = Math.min(canvas.width / ARENA_W, canvas.height / ARENA_H);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  draw(ctx, world, atlas, view);
  ctx.restore();

  const ms = performance.now();
  if (hudGate(ms)) updateHUD(buildHudAdapter(state, world, run), hudEls);
  if (shopGate(ms)) refreshShop();
}

// --- adaptive ceiling driven by frame time ---
function onFrameTime(ms) {
  world.ceiling = adaptCeiling(world.ceiling, ms, FRAME_BUDGET_MS, 100, CEILING_DESKTOP);
}

// --- save on tab hide ---
function saveNow() {
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

const loop = createLoop({ step, render, onFrameTime });
loop.start();

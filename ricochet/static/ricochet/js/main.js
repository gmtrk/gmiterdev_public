import { migrate, deserialize, serialize } from './save.js';
import { buildWorld, rebuildColliders, stepPhysics } from './physics.js';
import { applyUpgradeEffects, computeEventMult, creditsFromCounters, updateCombo } from './economy.js';
import {
  DT, SURFACE_BASE, COMBO, ARENA_W, ARENA_H, CEILING_DESKTOP, BALL_RADIUS, PEG_RADIUS, FRAME_BUDGET_MS,
} from './config.js';
import { buildAtlas, draw, createFloatingTextPool, createParticleRing } from './render.js';
import { createLoop, adaptCeiling } from './gameloop.js';
import { spawnTick, buildHudAdapter } from './mainstep.js';
import { formatNumber } from './numfmt.js';
import { updateHUD, renderShop, buyUpgrade } from './ui.js';
import { setupPlacement, setupPaddleDrag, setupTabs } from './input.js';
import { makeThrottle } from './throttle.js';

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

setupTabs({
  tabButtons: Array.from(document.querySelectorAll('[data-tab]')),
  panels: Array.from(document.querySelectorAll('[data-panel]')),
  onSelect: (name) => { if (name === 'credits') refreshShop(); },
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

// --- the fixed-timestep step ---
function step(dt) {
  run.now += dt;
  world.now = run.now;

  // 1) spawn tick (normal balls + golden roll)
  spawnTick(world, dt, run.spawnRate);

  // 2) physics (both pools, block runtime, golden/break counters into world.counters)
  stepPhysics(world, dt, run.now);

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
    run.lastAutosave = run.now;
    state.stats.lastSaveTime = Date.now();
    try { localStorage.setItem(SAVE_KEY, serialize(state)); } catch (e) { /* storage full/blocked */ }
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

const loop = createLoop({ step, render, onFrameTime });
loop.start();

// Ricochet — single source of truth for all gameplay constants.
// Pure data: no logic, no imports. Every later phase imports from here.

export const DT = 1 / 60, MAX_SUBSTEPS = 2, FRAME_BUDGET_MS = 8;
export const ARENA_W = 1000, ARENA_H = 1500;
export const SPAWN_MARGIN = 40, SPAWN_Y = 30, MAX_SPAWNS_PER_TICK = 8;
// Starting balls/sec = a 0.3s respawn interval. The spawnRate upgrade raises it.
export const SPAWN_RATE_BASE = 1 / 0.3;
// Aim-assist: a top-spawn x within (hitRadius, hitRadius + this] of a peg column
// gets nudged onto the peg. 0 disables. Live-tunable (debug "Aim Assist").
export const SPAWN_HELPER_DIST = 24;
export const CEILING_DESKTOP = 5000, RESERVED_OWNED = 200, SPECIAL_CAP = 96, GRID_CELL = 50;
// Snappy fall + NO air drag (1.0): balls keep their energy and stay fast/lively,
// losing speed only at surfaces (wall/peg/block/paddle restitution). Both are
// live-tunable off the world (debug sliders) — these are just the seeds. (Found
// satisfying in playtest: drag 1.0 + a high speed cap, made safe by sub-stepping.)
export const GRAVITY = 1700, DRAG = 1.0, E_WALL = 0.92, E_COLLIDER = 0.9;
export const PEG_RADIUS = 7, BALL_RADIUS = 6, KICK = 60;
// Paddle bounces high (restitution near-elastic) but injects NO fixed energy
// (kick stays 0) so it can't pump a trapped ball forever; the tangential nudge
// walks a near-vertical drop off the edge so it eventually drains.
export const E_PADDLE = 0.95, PADDLE_NUDGE = 25;
// Hard speed cap (px/s). At this speed a single DT step would move MAX_SPEED*DT
// ≈ 18px — far past a 7px peg — so physics.stepPhysics SUB-STEPS the movement
// (physics.substepCount) into slices each shorter than PEG_RADIUS, preserving the
// tunneling invariant per sub-step. Raising this stays collision-safe (more
// sub-steps), at proportional CPU cost.
export const MAX_SPEED = 1100;
export const BLOCK_W = 64, BLOCK_H = 28, BLOCK_LEVELS = 9, RESPAWN_DELAY = 4, BLOCK_BREAK_BONUS = 8;
// Blocks bounce higher than pegs: stronger kick + near-elastic restitution.
export const E_BLOCK = 0.95, BLOCK_KICK = 160;
// Random bounce offset on block/paddle hits: with this chance, rotate the
// outgoing velocity by up to ±BOUNCE_JITTER rad so balls scatter chaotically.
export const BOUNCE_JITTER = 0.4, BOUNCE_JITTER_CHANCE = 0.5;
export const SURFACE_BASE = { wall: 1, peg: 2, block: 25 };
export const EVENT_CAP = 29; // eventMult <= 1 + EVENT_CAP
export const COMBO = { gainPerSec: 6, decayPerSec: 3, capBonusStart: 9, perStepGainCap: 0.3 };
export const GOLDEN = { chance: 0.005, bonus: 12 };
export const CLACK_COOLDOWN = 0.2;
export const BURSTER = { chargePerBounce: 1, chargePerClack: 5, threshold: 60, ballsPerBurst: 6 };
export const OFFLINE = { efficiencyBase: 0.30, capSeconds: 8 * 3600, emaHalfLifeSec: 300 };
export const PRESTIGE = { coreScale: 1e9, coreK: 1, minCredits: 1e9 };
export const STARTING_CREDITS = 25; // cold-open grant (first upgrade affordable after ~10s, not instantly)
export const BASE_CAPACITY = 1;     // start with a single ball; buy Ball Capacity for more
// Minimal cold-open field: 2 placed pegs, no blocks, no paddle. Players buy the
// budgets / paddle to grow it. PADDLE_WIDTH_BASE is the width once owned (the
// first Paddle level → width 100 + 20 = 120).
export const PEG_BUDGET_BASE = 2, BLOCK_BUDGET_BASE = 0, PADDLE_WIDTH_BASE = 100;

// Credits shop. effectKind 'add' = additive per level (diminishing ROI vs geometric cost);
// 'mul' reserved per contract but Credits levers are additive. max? caps repeatable levels.
export const UPGRADES = [
  { id: 'globalValueMult', label: 'Value Multiplier', group: 'global', baseCost: 50,  costGrowth: 1.18, effectKind: 'add', effectStep: 0.25 },
  { id: 'ballCapacity',    label: 'Ball Capacity',    group: 'balls',  baseCost: 40,  costGrowth: 1.30, effectKind: 'add', effectStep: 1 },
  { id: 'spawnRate',       label: 'Spawn Speed',      group: 'balls',  baseCost: 35,  costGrowth: 1.26, effectKind: 'add', effectStep: 1 },
  { id: 'goldenChance',    label: 'Golden Chance',    group: 'global', baseCost: 300, costGrowth: 1.35, effectKind: 'add', effectStep: 0.0025, max: 40 },
  { id: 'pegBudget',       label: 'Peg Budget',       group: 'pegs',   baseCost: 60,  costGrowth: 1.28, effectKind: 'add', effectStep: 4 },
  { id: 'blockBudget',     label: 'Block Budget',     group: 'blocks', baseCost: 120, costGrowth: 1.40, effectKind: 'add', effectStep: 1 },
  // Paddle: buying the first level both ADDS the paddle (present once level>=1)
  // and sets its width; further levels widen it.
  { id: 'paddleWidth',     label: 'Paddle',           group: 'paddle', baseCost: 80,  costGrowth: 1.25, effectKind: 'add', effectStep: 20 },
  { id: 'pegKick',         label: 'Peg Kick',         group: 'pegs',   baseCost: 90,  costGrowth: 1.27, effectKind: 'add', effectStep: 10 },
  // Special-ball unlocks. One-shot purchases (max:1, no cost growth): buying
  // flips state.specials[unlock].unlocked and seeds the starter pack so the type
  // actually spawns. `unlock` names the save-shape special key. The standard
  // effectStep/effectKind fields are present (and inert: effectStep 0) so the
  // shop/config schema stays uniform; the real effect is the unlock side-effect.
  { id: 'unlockClacker',  label: 'Unlock Clacker',  group: 'specials', unlock: 'clacker',  baseCost: 500,  costGrowth: 1, effectKind: 'add', effectStep: 0, max: 1 },
  { id: 'unlockSplitter', label: 'Unlock Splitter', group: 'specials', unlock: 'splitter', baseCost: 1500, costGrowth: 1, effectKind: 'add', effectStep: 0, max: 1 },
  { id: 'unlockBurster',  label: 'Unlock Burster',  group: 'specials', unlock: 'burster',  baseCost: 4000, costGrowth: 1, effectKind: 'add', effectStep: 0, max: 1 },
];

// Cores shop. Permanent; survives Big Bang. 'mul' = multiplicative permanent buffs (bounded);
// 'add' = additive head-start/offline buffs.
export const CORES_UPGRADES = [
  { id: 'globalValueMult',     label: 'Cosmic Multiplier', group: 'power',     baseCost: 2,  costGrowth: 1.6, effectKind: 'mul', effectStep: 0.5 },
  { id: 'baseCapacity',        label: 'Extra Slots',       group: 'headstart', baseCost: 3,  costGrowth: 1.7, effectKind: 'add', effectStep: 2 },
  { id: 'goldenChance',        label: 'Golden Affinity',   group: 'unlocks',   baseCost: 5,  costGrowth: 1.8, effectKind: 'add', effectStep: 0.005, max: 20 },
  { id: 'startCreditsMult',    label: 'Big Bang Dowry',    group: 'headstart', baseCost: 4,  costGrowth: 1.7, effectKind: 'mul', effectStep: 1 },
  { id: 'offlineEfficiencyAdd', label: 'Cryo-Stasis',      group: 'offline',   baseCost: 5,  costGrowth: 1.6, effectKind: 'add', effectStep: 0.05 },
  { id: 'offlineCapAdd',       label: 'Long Sleep',        group: 'offline',   baseCost: 8,  costGrowth: 1.7, effectKind: 'add', effectStep: 3600 },
];

export const PALETTE = {
  bg: '#0a0a16',
  ballCyan: '#22e0ff',
  ballYellow: '#fff14a',
  peg: '#ff3df0',
  clacker: '#22e0ff',
  splitter: '#ff3df0',
  burster: '#ffb347',
};

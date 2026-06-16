// Ricochet — single source of truth for all gameplay constants.
// Pure data: no logic, no imports. Every later phase imports from here.

export const DT = 1 / 60, MAX_SUBSTEPS = 2, FRAME_BUDGET_MS = 8;
export const ARENA_W = 1000, ARENA_H = 1500;
export const SPAWN_MARGIN = 40, SPAWN_Y = 30, MAX_SPAWNS_PER_TICK = 8;
export const CEILING_DESKTOP = 5000, RESERVED_OWNED = 200, SPECIAL_CAP = 96, GRID_CELL = 50;
export const GRAVITY = 1400, DRAG = 0.999, E_WALL = 0.92, E_COLLIDER = 0.9;
export const PEG_RADIUS = 7, BALL_RADIUS = 6, KICK = 60;
// Tunneling invariant: MAX_SPEED*DT < PEG_RADIUS.
export const MAX_SPEED = 0.9 * PEG_RADIUS / DT;
export const BLOCK_W = 64, BLOCK_H = 28, BLOCK_LEVELS = 9, RESPAWN_DELAY = 4, BLOCK_BREAK_BONUS = 8;
export const SURFACE_BASE = { wall: 1, peg: 5, block: 25 };
export const EVENT_CAP = 29; // eventMult <= 1 + EVENT_CAP
export const COMBO = { gainPerSec: 6, decayPerSec: 3, capBonusStart: 9, perStepGainCap: 0.3 };
export const GOLDEN = { chance: 0.005, bonus: 12 };
export const CLACK_COOLDOWN = 0.2;
export const BURSTER = { chargePerBounce: 1, chargePerClack: 5, threshold: 60, ballsPerBurst: 6 };
export const OFFLINE = { efficiencyBase: 0.30, capSeconds: 8 * 3600, emaHalfLifeSec: 300 };
export const PRESTIGE = { coreScale: 1e9, coreK: 1, minCredits: 1e9 };
export const STARTING_CREDITS = 50; // cold-open grant
export const BASE_CAPACITY = 3;     // starting ball slots before upgrades
export const PEG_BUDGET_BASE = 12, BLOCK_BUDGET_BASE = 2, PADDLE_WIDTH_BASE = 120;

// Credits shop. effectKind 'add' = additive per level (diminishing ROI vs geometric cost);
// 'mul' reserved per contract but Credits levers are additive. max? caps repeatable levels.
export const UPGRADES = [
  { id: 'globalValueMult', label: 'Value Multiplier', group: 'global', baseCost: 50,  costGrowth: 1.18, effectKind: 'add', effectStep: 0.25 },
  { id: 'ballCapacity',    label: 'Ball Capacity',    group: 'balls',  baseCost: 40,  costGrowth: 1.30, effectKind: 'add', effectStep: 1 },
  { id: 'goldenChance',    label: 'Golden Chance',    group: 'global', baseCost: 300, costGrowth: 1.35, effectKind: 'add', effectStep: 0.0025, max: 40 },
  { id: 'pegBudget',       label: 'Peg Budget',       group: 'pegs',   baseCost: 60,  costGrowth: 1.28, effectKind: 'add', effectStep: 4 },
  { id: 'blockBudget',     label: 'Block Budget',     group: 'blocks', baseCost: 120, costGrowth: 1.40, effectKind: 'add', effectStep: 1 },
  { id: 'paddleWidth',     label: 'Paddle Width',     group: 'paddle', baseCost: 80,  costGrowth: 1.25, effectKind: 'add', effectStep: 20 },
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

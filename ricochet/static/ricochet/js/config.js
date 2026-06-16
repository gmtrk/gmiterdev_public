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

// Credits shop. effectKind 'add' = additive per level (diminishing ROI vs geometric cost);
// 'mul' reserved per contract but Credits levers are additive. max? caps repeatable levels.
export const UPGRADES = [
  // Global
  { id: 'globalValueMult', label: 'Value Multiplier', group: 'global', baseCost: 50, costGrowth: 1.18, effectKind: 'add', effectStep: 0.25 },
  { id: 'comboCap', label: 'Combo Cap', group: 'global', baseCost: 400, costGrowth: 1.45, effectKind: 'add', effectStep: 2, max: 20 },
  { id: 'comboWindow', label: 'Combo Window', group: 'global', baseCost: 350, costGrowth: 1.40, effectKind: 'add', effectStep: 0.5, max: 12 },
  { id: 'goldenChance', label: 'Golden Chance', group: 'global', baseCost: 600, costGrowth: 1.50, effectKind: 'add', effectStep: 0.002, max: 20 },
  // Balls
  { id: 'ballCapacity', label: 'Ball Capacity', group: 'balls', baseCost: 30, costGrowth: 1.30, effectKind: 'add', effectStep: 1 },
  { id: 'spawnRate', label: 'Spawn Rate', group: 'balls', baseCost: 40, costGrowth: 1.28, effectKind: 'add', effectStep: 0.5 },
  { id: 'ballValue', label: 'Ball Value', group: 'balls', baseCost: 60, costGrowth: 1.22, effectKind: 'add', effectStep: 0.15 },
  { id: 'ballSpeed', label: 'Ball Speed', group: 'balls', baseCost: 80, costGrowth: 1.26, effectKind: 'add', effectStep: 0.05, max: 30 },
  { id: 'bounciness', label: 'Bounciness', group: 'balls', baseCost: 90, costGrowth: 1.32, effectKind: 'add', effectStep: 0.01, max: 8 },
  { id: 'ballSize', label: 'Ball Size', group: 'balls', baseCost: 70, costGrowth: 1.30, effectKind: 'add', effectStep: 0.5, max: 12 },
  // Arena
  { id: 'sideWalls', label: 'Tapered Walls', group: 'arena', baseCost: 500, costGrowth: 1.60, effectKind: 'add', effectStep: 1, max: 6 },
  { id: 'bounceFloor', label: 'Bounce Floor', group: 'arena', baseCost: 1500, costGrowth: 1.80, effectKind: 'add', effectStep: 1, max: 1 },
  { id: 'arenaWidth', label: 'Arena Width', group: 'arena', baseCost: 1200, costGrowth: 1.55, effectKind: 'add', effectStep: 40, max: 6 },
  { id: 'gravityUp', label: 'Gravity Tuning', group: 'arena', baseCost: 800, costGrowth: 1.50, effectKind: 'add', effectStep: 60, max: 8 },
  // Pegs
  { id: 'pegBudget', label: 'Peg Budget', group: 'pegs', baseCost: 100, costGrowth: 1.35, effectKind: 'add', effectStep: 4 },
  { id: 'pegValue', label: 'Peg Value', group: 'pegs', baseCost: 120, costGrowth: 1.24, effectKind: 'add', effectStep: 0.2 },
  { id: 'pegKick', label: 'Peg Kick', group: 'pegs', baseCost: 140, costGrowth: 1.28, effectKind: 'add', effectStep: 8, max: 20 },
  // Blocks
  { id: 'blockBudget', label: 'Block Budget', group: 'blocks', baseCost: 200, costGrowth: 1.38, effectKind: 'add', effectStep: 2 },
  { id: 'blockLevels', label: 'Block HP', group: 'blocks', baseCost: 220, costGrowth: 1.34, effectKind: 'add', effectStep: 1, max: 15 },
  { id: 'blockValue', label: 'Block Value', group: 'blocks', baseCost: 240, costGrowth: 1.26, effectKind: 'add', effectStep: 0.25 },
  { id: 'blockRespawn', label: 'Block Respawn', group: 'blocks', baseCost: 260, costGrowth: 1.40, effectKind: 'add', effectStep: 0.3, max: 10 },
  { id: 'breakBonus', label: 'Break Bonus', group: 'blocks', baseCost: 300, costGrowth: 1.42, effectKind: 'add', effectStep: 1, max: 16 },
  // Paddle
  { id: 'paddleWidth', label: 'Paddle Width', group: 'paddle', baseCost: 150, costGrowth: 1.30, effectKind: 'add', effectStep: 12, max: 20 },
  { id: 'paddleBounce', label: 'Paddle Bounce', group: 'paddle', baseCost: 170, costGrowth: 1.32, effectKind: 'add', effectStep: 10, max: 20 },
  // Specials (unlocks + capacities + tuning)
  { id: 'unlockClacker', label: 'Unlock Clacker', group: 'specials', baseCost: 1000, costGrowth: 1, effectKind: 'add', effectStep: 1, max: 1 },
  { id: 'unlockSplitter', label: 'Unlock Splitter', group: 'specials', baseCost: 2500, costGrowth: 1, effectKind: 'add', effectStep: 1, max: 1 },
  { id: 'unlockBurster', label: 'Unlock Burster', group: 'specials', baseCost: 5000, costGrowth: 1, effectKind: 'add', effectStep: 1, max: 1 },
  { id: 'clackerCapacity', label: 'Clacker Capacity', group: 'specials', baseCost: 1500, costGrowth: 1.45, effectKind: 'add', effectStep: 1, max: 16 },
  { id: 'splitterCapacity', label: 'Splitter Capacity', group: 'specials', baseCost: 3000, costGrowth: 1.45, effectKind: 'add', effectStep: 1, max: 16 },
  { id: 'bursterCapacity', label: 'Burster Capacity', group: 'specials', baseCost: 6000, costGrowth: 1.45, effectKind: 'add', effectStep: 1, max: 16 },
  { id: 'clackerValue', label: 'Clacker Burst', group: 'specials', baseCost: 2000, costGrowth: 1.30, effectKind: 'add', effectStep: 0.5 },
  { id: 'splitterCount', label: 'Splitter Count', group: 'specials', baseCost: 4000, costGrowth: 1.60, effectKind: 'add', effectStep: 1, max: 4 },
  { id: 'bursterThreshold', label: 'Burster Threshold', group: 'specials', baseCost: 4500, costGrowth: 1.40, effectKind: 'add', effectStep: 1, max: 20 },
];

// Cores shop. Permanent; survives Big Bang. 'mul' = multiplicative permanent buffs (bounded);
// 'add' = additive head-start/offline buffs.
export const CORES_UPGRADES = [
  // Power (bounded multiplicative)
  { id: 'coresGlobalMult', label: 'Permanent Value ×', group: 'power', baseCost: 1, costGrowth: 2.0, effectKind: 'mul', effectStep: 0.10 },
  { id: 'coreGainMult', label: 'Core Gain ×', group: 'power', baseCost: 3, costGrowth: 2.5, effectKind: 'mul', effectStep: 0.05 },
  // Head start (additive)
  { id: 'startCreditsMult', label: 'Starting Credits', group: 'headstart', baseCost: 2, costGrowth: 2.0, effectKind: 'add', effectStep: 1 },
  { id: 'baseCapacityAdd', label: 'Base Capacity', group: 'headstart', baseCost: 2, costGrowth: 2.2, effectKind: 'add', effectStep: 1 },
  { id: 'blueprintSlots', label: 'Blueprint Slots', group: 'headstart', baseCost: 4, costGrowth: 2.4, effectKind: 'add', effectStep: 4 },
  // Unlocks (additive)
  { id: 'goldenChanceAdd', label: 'Golden Chance', group: 'unlocks', baseCost: 3, costGrowth: 2.0, effectKind: 'add', effectStep: 0.0025 },
  { id: 'deepUnlocks', label: 'Deep Unlocks', group: 'unlocks', baseCost: 5, costGrowth: 3.0, effectKind: 'add', effectStep: 1, max: 3 },
  // Offline (additive)
  { id: 'offlineEfficiency', label: 'Offline Efficiency', group: 'offline', baseCost: 2, costGrowth: 1.8, effectKind: 'add', effectStep: 0.05 },
  { id: 'offlineCap', label: 'Offline Cap', group: 'offline', baseCost: 3, costGrowth: 1.9, effectKind: 'add', effectStep: 3600 },
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

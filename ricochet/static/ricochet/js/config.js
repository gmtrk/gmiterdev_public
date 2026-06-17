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
// Minimum center-to-center spacing between hand-placed pegs, so a ball (dia 12)
// can always pass between two pegs (2*PEG_RADIUS+12 = 26 < this). Presets (pitch 70)
// are unaffected. Live in the Place-tab overlay as exclusion rings.
export const MIN_PEG_SPACING = 44;
// Radius (virtual px) of the Remove-tool eraser: click/drag erases every peg and
// block whose center is within this distance of the cursor.
export const ERASER_RADIUS = 50;
// Hard speed cap (px/s). At this speed a single DT step would move MAX_SPEED*DT
// ≈ 18px — far past a 7px peg — so physics.stepPhysics SUB-STEPS the movement
// (physics.substepCount) into slices each shorter than PEG_RADIUS, preserving the
// tunneling invariant per sub-step. Raising this stays collision-safe (more
// sub-steps), at proportional CPU cost.
export const MAX_SPEED = 1100;
// Ramps (side-deflector bouncy walls). Length + capsule thickness are fixed;
// angle (degrees) is live-tunable (debug "Ramp Angle").
export const RAMP_LEN = 280, RAMP_THICKNESS = 4, RAMP_ANGLE = 30;
// Bottom ramps anchor their outer (upper) end to the side wall at height H-RAMP_WALL_OFFSET;
// the length is clamped so the inner (lower) end never passes H-RAMP_FLOOR_MARGIN.
export const RAMP_WALL_OFFSET = 190, RAMP_FLOOR_MARGIN = 20;
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
export const BURSTER = { chargePerBounce: 1, chargePerClack: 5, threshold: 20, ballsPerBurst: 6 };
// Special balls are bigger (more visible + clack/collide more) and capped slower
// (so they linger and reach their powers instead of draining straight through).
export const SPECIAL_RADIUS = 11, BURSTER_RADIUS = 14, SPECIAL_MAX_SPEED = 600;
export const OFFLINE = { efficiencyBase: 0.30, capSeconds: 8 * 3600, emaHalfLifeSec: 300 };
// Half-life (s) for the smoothed PER-SEC HUD counter (symmetric EMA of credits/sec).
export const DISPLAY_CPS_HALFLIFE = 1.0;
export const PRESTIGE = { coreScale: 1e9, coreK: 1, minCredits: 1e9 };
export const STARTING_CREDITS = 25; // cold-open grant (first upgrade affordable after ~10s, not instantly)
export const BASE_CAPACITY = 1;     // start with a single ball; buy Ball Capacity for more
// Minimal cold-open field: 2 placed pegs, no blocks. Players buy the
// budgets to grow it. PADDLE_WIDTH_BASE is retained for compatibility (now unused).
export const PEG_BUDGET_BASE = 2, BLOCK_BUDGET_BASE = 0, PADDLE_WIDTH_BASE = 100;

// Auto-fill preset geometry (base). Widened by the Peg Spread upgrade / debug sliders.
export const PEG_PITCH_X = 70, PEG_PITCH_Y = 70, PEG_FIELD_TOP = Math.round(ARENA_H * 0.35);

// Credits shop. effectKind 'add' = additive per level (diminishing ROI vs geometric cost);
// 'mul' reserved per contract but Credits levers are additive. max? caps repeatable levels.
export const UPGRADES = [
  { id: 'globalValueMult', label: 'Value Multiplier', group: 'global', baseCost: 50,  costGrowth: 1.18, effectKind: 'add', effectStep: 0.25, desc: 'Boosts all scoring.' },
  { id: 'ballCapacity',    label: 'Ball Capacity',    group: 'balls',  baseCost: 40,  costGrowth: 1.30, effectKind: 'add', effectStep: 1, desc: '+1 ball on the field.' },
  { id: 'spawnRate',       label: 'Spawn Speed',      group: 'balls',  baseCost: 35,  costGrowth: 1.26, effectKind: 'add', effectStep: 1, desc: 'Balls respawn faster.' },
  { id: 'goldenChance',    label: 'Golden Chance',    group: 'global', baseCost: 300, costGrowth: 1.35, effectKind: 'add', effectStep: 0.0025, max: 40, desc: 'Higher chance of golden balls.' },
  { id: 'pegBudget',       label: 'Peg Budget',       group: 'pegs',   baseCost: 25,  costGrowth: 1.15, effectKind: 'add', effectStep: 1, desc: '+1 peg you can place.' },
  { id: 'blockBudget',     label: 'Block Budget',     group: 'blocks', baseCost: 120, costGrowth: 1.40, effectKind: 'add', effectStep: 1, desc: '+1 block you can place.' },
  { id: 'pegKick',         label: 'Peg Kick',         group: 'pegs',   baseCost: 90,  costGrowth: 1.27, effectKind: 'add', effectStep: 10, desc: 'Pegs launch balls harder.' },
  { id: 'pegSpread', label: 'Peg Spread', group: 'pegs', baseCost: 150, costGrowth: 1.4, effectKind: 'add', effectStep: 6, desc: 'Widens auto-fill peg spacing.' },
  { id: 'midRamps', label: 'Mid Ramps', group: 'ramps', baseCost: 70, costGrowth: 1, effectKind: 'add', effectStep: 1, max: 1, desc: 'Adds a second ramp pair midway.' },
  { id: 'rampAngleUnlock', label: 'Ramp Tuning', group: 'ramps', baseCost: 5000, costGrowth: 1, effectKind: 'add', effectStep: 0, max: 1, desc: 'Unlocks the ramp-angle slider.' },
  // Special-ball unlocks. One-shot purchases (max:1, no cost growth): buying
  // flips state.specials[unlock].unlocked and seeds the starter pack so the type
  // actually spawns. `unlock` names the save-shape special key. The standard
  // effectStep/effectKind fields are present (and inert: effectStep 0) so the
  // shop/config schema stays uniform; the real effect is the unlock side-effect.
  { id: 'unlockClacker',  label: 'Unlock Clacker',  group: 'specials', unlock: 'clacker',  baseCost: 500,  costGrowth: 1, effectKind: 'add', effectStep: 0, max: 1, desc: 'Clackers pay credits when they collide.' },
  { id: 'unlockSplitter', label: 'Unlock Splitter', group: 'specials', unlock: 'splitter', baseCost: 1500, costGrowth: 1, effectKind: 'add', effectStep: 0, max: 1, desc: 'Splitters spawn extra balls.' },
  { id: 'unlockBurster',  label: 'Unlock Burster',  group: 'specials', unlock: 'burster',  baseCost: 4000, costGrowth: 1, effectKind: 'add', effectStep: 0, max: 1, desc: 'Bursters explode into many balls.' },
];

// Cores shop. Permanent; survives Big Bang. 'mul' = multiplicative permanent buffs (bounded);
// 'add' = additive head-start/offline buffs.
export const CORES_UPGRADES = [
  { id: 'globalValueMult',     label: 'Cosmic Multiplier', group: 'power',     baseCost: 2,  costGrowth: 1.6, effectKind: 'mul', effectStep: 0.5, desc: 'Permanent scoring multiplier.' },
  { id: 'baseCapacity',        label: 'Extra Slots',       group: 'headstart', baseCost: 3,  costGrowth: 1.7, effectKind: 'add', effectStep: 2, desc: '+2 starting ball slots.' },
  { id: 'goldenChance',        label: 'Golden Affinity',   group: 'unlocks',   baseCost: 5,  costGrowth: 1.8, effectKind: 'add', effectStep: 0.005, max: 20, desc: 'Permanent golden-ball chance.' },
  { id: 'startCreditsMult',    label: 'Big Bang Dowry',    group: 'headstart', baseCost: 4,  costGrowth: 1.7, effectKind: 'mul', effectStep: 1, desc: 'More starting credits after a Big Bang.' },
  { id: 'offlineEfficiencyAdd', label: 'Cryo-Stasis',      group: 'offline',   baseCost: 5,  costGrowth: 1.6, effectKind: 'add', effectStep: 0.05, desc: 'Earn more while away.' },
  { id: 'offlineCapAdd',       label: 'Long Sleep',        group: 'offline',   baseCost: 8,  costGrowth: 1.7, effectKind: 'add', effectStep: 3600, desc: 'Longer offline earning window.' },
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

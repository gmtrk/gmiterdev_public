import { STARTING_CREDITS, ARENA_W, ARENA_H, PADDLE_WIDTH_BASE, RAMP_ANGLE } from './config.js';

export const CURRENT_VERSION = 1;

function starterBlueprint() {
  // Minimal cold-open: two pegs near the top, no blocks. Players
  // buy the budgets to grow the field. The paddle entry is vestigial (kept for
  // backward compatibility with save format) and is not used by the simulation.
  const pegs = [
    { x: ARENA_W / 2 - 80, y: ARENA_H * 0.32 },
    { x: ARENA_W / 2 + 80, y: ARENA_H * 0.32 },
  ];
  const blocks = [];
  const paddle = { x: ARENA_W / 2, width: PADDLE_WIDTH_BASE };
  return { pegs, blocks, paddle, preset: null, rampAngle: RAMP_ANGLE };
}

export function defaultSave() {
  return {
    version: CURRENT_VERSION,
    credits: String(STARTING_CREDITS),
    cores: 0,
    lifetimeCores: 0,
    upgrades: {},
    specials: {
      clacker: { unlocked: false, capacity: 0 },
      splitter: { unlocked: false, capacity: 0 },
      burster: { unlocked: false, capacity: 0 },
    },
    coresShop: {},
    placed: starterBlueprint(),
    stats: { recentEarnRate: 0, lastSaveTime: 0, lastSubmittedCores: 0 },
  };
}

export function serialize(state) {
  const disk = {
    version: state.version,
    credits: String(state.credits),
    cores: String(state.cores),
    lifetimeCores: String(state.lifetimeCores),
    upgrades: state.upgrades,
    specials: state.specials,
    coresShop: state.coresShop,
    placed: state.placed,
    stats: state.stats,
  };
  return JSON.stringify(disk);
}

export function deserialize(str) {
  if (str == null) return null;
  let obj;
  try {
    obj = JSON.parse(str);
  } catch {
    return null;
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return {
    ...obj,
    credits: Number(obj.credits),
    cores: Number(obj.cores),
    lifetimeCores: Number(obj.lifetimeCores),
  };
}

// Coerce the runtime numerics to Number: migrate() is the load boundary, and
// CONTRACT line 21 requires state.credits/cores/lifetimeCores to be JS numbers
// at runtime (defaultSave keeps strings on-disk, which is fine — they are only
// serialized again on save). Without this, a fresh load carries credits as the
// string "50" and `state.credits += gained` would concatenate. Mutates + returns.
function coerceRuntimeNumerics(save) {
  save.credits = Number(save.credits);
  save.cores = Number(save.cores);
  save.lifetimeCores = Number(save.lifetimeCores);
  return save;
}

export function migrate(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return coerceRuntimeNumerics(defaultSave());
  }
  // Require at least one recognizable run field; otherwise treat as corrupt.
  const recognized = ['credits', 'cores', 'upgrades', 'placed', 'specials'];
  if (!recognized.some((k) => k in obj)) {
    return coerceRuntimeNumerics(defaultSave());
  }
  const d = defaultSave();
  return coerceRuntimeNumerics({
    version: CURRENT_VERSION,
    credits: 'credits' in obj ? obj.credits : d.credits,
    cores: 'cores' in obj ? obj.cores : d.cores,
    lifetimeCores: 'lifetimeCores' in obj ? obj.lifetimeCores : d.lifetimeCores,
    upgrades: 'upgrades' in obj ? obj.upgrades : d.upgrades,
    specials: 'specials' in obj ? obj.specials : d.specials,
    coresShop: 'coresShop' in obj ? obj.coresShop : d.coresShop,
    placed: 'placed' in obj ? obj.placed : d.placed,
    stats: 'stats' in obj ? obj.stats : d.stats,
  });
}

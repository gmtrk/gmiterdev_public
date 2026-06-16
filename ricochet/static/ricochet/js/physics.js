import {
  DT, ARENA_W, ARENA_H, SPAWN_MARGIN, SPAWN_Y,
  CEILING_DESKTOP, RESERVED_OWNED, SPECIAL_CAP, GRID_CELL,
  GRAVITY, DRAG, E_WALL, E_COLLIDER, PEG_RADIUS, BALL_RADIUS, KICK, MAX_SPEED,
  BLOCK_W, BLOCK_H, BLOCK_LEVELS, RESPAWN_DELAY, BLOCK_BREAK_BONUS,
  GOLDEN, CLACK_COOLDOWN, BASE_CAPACITY,
} from './config.js';
import { Grid } from './grid.js';
import { applyUpgradeEffects } from './economy.js';

export const FLAG_GOLDEN = 1;
export const FLAG_CAP_EXEMPT = 2;

// Ball-type enum: both the SHORT names (consumed by render.js/main.js/specials)
// and the TYPE_* names (consumed by physics tests) resolve to the same integers.
export const NORMAL = 0, CLACKER = 1, SPLITTER = 2, BURSTER = 3;
export const TYPE_NORMAL = NORMAL, TYPE_CLACKER = CLACKER, TYPE_SPLITTER = SPLITTER, TYPE_BURSTER = BURSTER;

const NOOP_EMIT = { credits() {}, balls() {} };

export function createPool(capacity, isSpecial) {
  const pool = {
    capacity,
    count: 0,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    radius: new Float32Array(capacity),
    type: new Uint8Array(capacity),
    flags: new Uint8Array(capacity),
    free: [],
  };
  if (isSpecial) {
    pool.charge = new Float32Array(capacity);
    pool.clackCooldown = new Float32Array(capacity);
    pool.envHits = new Int32Array(capacity);
  }
  return pool;
}

export function swapRemove(pool, i) {
  const last = pool.count - 1;
  if (i !== last) {
    pool.x[i] = pool.x[last];
    pool.y[i] = pool.y[last];
    pool.vx[i] = pool.vx[last];
    pool.vy[i] = pool.vy[last];
    pool.radius[i] = pool.radius[last];
    pool.type[i] = pool.type[last];
    pool.flags[i] = pool.flags[last];
    if (pool.charge) {
      pool.charge[i] = pool.charge[last];
      pool.clackCooldown[i] = pool.clackCooldown[last];
      pool.envHits[i] = pool.envHits[last];
    }
  }
  pool.count = last;
}

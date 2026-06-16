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

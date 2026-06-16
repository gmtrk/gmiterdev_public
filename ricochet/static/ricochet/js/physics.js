import {
  DT, ARENA_W, ARENA_H, SPAWN_MARGIN, SPAWN_Y,
  CEILING_DESKTOP, RESERVED_OWNED, SPECIAL_CAP, GRID_CELL,
  GRAVITY, DRAG, E_WALL, E_COLLIDER, PEG_RADIUS, BALL_RADIUS, KICK, MAX_SPEED,
  BLOCK_W, BLOCK_H, BLOCK_LEVELS, RESPAWN_DELAY, BLOCK_BREAK_BONUS,
  GOLDEN, CLACK_COOLDOWN, BASE_CAPACITY, MAX_SPAWNS_PER_TICK,
} from './config.js';
import { Grid } from './grid.js';
import { applyUpgradeEffects } from './economy.js';
// tickClackCooldowns is the single tested implementation of the per-step clack
// cooldown decay; _specialClackPass delegates to it. specials.js imports physics
// bindings only inside functions, and this import is likewise only used at call
// time, so the cycle is eval-safe.
import { tickClackCooldowns } from './specials.js';

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

export function clampSpeed(vx, vy, maxSpeed) {
  const sp2 = vx * vx + vy * vy;
  const max2 = maxSpeed * maxSpeed;
  if (sp2 > max2) {
    const s = maxSpeed / Math.sqrt(sp2);
    return { vx: vx * s, vy: vy * s };
  }
  return { vx, vy };
}

export function reflectWalls(x, y, vx, vy, r, W, H, eWall, hasFloor) {
  let hitWall = false;
  if (x - r < 0) { x = r; vx = -vx * eWall; hitWall = true; }
  else if (x + r > W) { x = W - r; vx = -vx * eWall; hitWall = true; }
  if (y - r < 0) { y = r; vy = -vy * eWall; hitWall = true; }
  else if (hasFloor && y + r > H) { y = H - r; vy = -vy * eWall; hitWall = true; }
  return { x, y, vx, vy, hitWall };
}

export function resolveCircleCircle(bx, by, vx, vy, br, cx, cy, cr, e, kick, maxSpeed) {
  const dx = bx - cx;
  const dy = by - cy;
  const sum = br + cr;
  const dist2 = dx * dx + dy * dy;
  if (dist2 >= sum * sum) return { x: bx, y: by, vx, vy, hit: false };
  let dist = Math.sqrt(dist2);
  let nx, ny;
  if (dist > 1e-9) { nx = dx / dist; ny = dy / dist; }
  else { nx = 0; ny = -1; dist = 0; } // exact overlap: push straight up
  const pen = sum - dist;
  bx += nx * pen;
  by += ny * pen;
  const vn = vx * nx + vy * ny;
  vx -= (1 + e) * vn * nx;
  vy -= (1 + e) * vn * ny;
  vx += kick * nx;
  vy += kick * ny;
  const c = clampSpeed(vx, vy, maxSpeed);
  return { x: bx, y: by, vx: c.vx, vy: c.vy, hit: true };
}

export function buildWorld(state) {
  const world = {
    state,
    W: ARENA_W,
    H: ARENA_H,
    pegRadius: PEG_RADIUS,
    normal: createPool(CEILING_DESKTOP, false),
    special: createPool(SPECIAL_CAP, true),
    pegs: {
      xs: new Float32Array(0),
      ys: new Float32Array(0),
      r: PEG_RADIUS,
      count: 0,
    },
    blocks: {
      xs: new Float32Array(0),
      ys: new Float32Array(0),
      level: new Int16Array(0),
      respawnAt: new Float64Array(0),
      golden: new Uint8Array(0),
      count: 0,
      w: BLOCK_W,
      h: BLOCK_H,
    },
    paddle: { x: state.placed.paddle.x, y: ARENA_H - 80, w: state.placed.paddle.width, h: 16 },
    grid: new Grid(ARENA_W, ARENA_H, GRID_CELL),
    counters: { wall: 0, peg: 0, block: 0, goldenBonus: 0, breakBonus: 0 },
    ceiling: CEILING_DESKTOP,
    leakMargin: 40,
    hasFloor: false,
    eWall: E_WALL,
    eCollider: E_COLLIDER,
    kick: KICK,
    maxSpeed: MAX_SPEED,
    globalValueMult: 1,
    goldenChance: GOLDEN.chance,
    baseCapacity: BASE_CAPACITY,
    budgets: { pegs: 0, blocks: 0 },
    blockW: BLOCK_W,
    blockH: BLOCK_H,
  };
  rebuildColliders(world);
  applyUpgradeEffects(world, state);
  return world;
}

export function rebuildColliders(world) {
  const placedPegs = world.state.placed.pegs;
  const placedBlocks = world.state.placed.blocks;
  const np = placedPegs.length;
  if (world.pegs.xs.length < np) {
    world.pegs.xs = new Float32Array(np);
    world.pegs.ys = new Float32Array(np);
  }
  for (let i = 0; i < np; i++) {
    world.pegs.xs[i] = placedPegs[i].x;
    world.pegs.ys[i] = placedPegs[i].y;
  }
  world.pegs.count = np;
  world.pegs.r = world.pegRadius;

  const nb = placedBlocks.length;
  if (world.blocks.xs.length < nb) {
    world.blocks.xs = new Float32Array(nb);
    world.blocks.ys = new Float32Array(nb);
    world.blocks.level = new Int16Array(nb);
    world.blocks.respawnAt = new Float64Array(nb);
    world.blocks.golden = new Uint8Array(nb);
  }
  for (let i = 0; i < nb; i++) {
    const b = placedBlocks[i];
    world.blocks.xs[i] = b.x;
    world.blocks.ys[i] = b.y;
    world.blocks.level[i] = b.level;
    world.blocks.respawnAt[i] = b.respawnAt || 0;
    world.blocks.golden[i] = b.golden ? 1 : 0;
  }
  world.blocks.count = nb;
  world.blocks.w = world.blockW;
  world.blocks.h = world.blockH;

  world.grid.rebuild(world.pegs.xs, world.pegs.ys, world.pegs.count);
}

export function spawnNormal(world, x, y, flags) {
  const p = world.normal;
  if (p.count >= world.ceiling) return -1;
  const i = p.count++;
  p.x[i] = x; p.y[i] = y; p.vx[i] = 0; p.vy[i] = 0;
  p.radius[i] = BALL_RADIUS; p.type[i] = TYPE_NORMAL; p.flags[i] = flags;
  return i;
}

export function spawnSpecial(world, type, x, y) {
  const p = world.special;
  if (p.count >= SPECIAL_CAP) return -1;
  const i = p.count++;
  p.x[i] = x; p.y[i] = y; p.vx[i] = 0; p.vy[i] = 0;
  p.radius[i] = BALL_RADIUS; p.type[i] = type; p.flags[i] = 0;
  p.charge[i] = 0; p.clackCooldown[i] = 0; p.envHits[i] = 0;
  return i;
}

export function resolveCircleAABB(bx, by, vx, vy, br, ax, ay, aw, ah, e, kick, maxSpeed) {
  // ax,ay = box center ; aw,ah = half-extents
  const cxp = Math.max(ax - aw, Math.min(bx, ax + aw));
  const cyp = Math.max(ay - ah, Math.min(by, ay + ah));
  const dx = bx - cxp;
  const dy = by - cyp;
  const dist2 = dx * dx + dy * dy;
  if (dist2 >= br * br) return { x: bx, y: by, vx, vy, hit: false };
  let dist = Math.sqrt(dist2);
  let nx, ny;
  if (dist > 1e-9) { nx = dx / dist; ny = dy / dist; }
  else {
    // center inside box: pick the smallest-penetration axis as the normal
    const px = aw - Math.abs(bx - ax);
    const py = ah - Math.abs(by - ay);
    if (px < py) { nx = Math.sign(bx - ax) || 1; ny = 0; dist = -px; }
    else { nx = 0; ny = Math.sign(by - ay) || -1; dist = -py; }
  }
  const pen = br - dist;
  bx += nx * pen;
  by += ny * pen;
  const vn = vx * nx + vy * ny;
  vx -= (1 + e) * vn * nx;
  vy -= (1 + e) * vn * ny;
  vx += kick * nx;
  vy += kick * ny;
  const c = clampSpeed(vx, vy, maxSpeed);
  return { x: bx, y: by, vx: c.vx, vy: c.vy, hit: true };
}

// Single module-scope peg narrow-phase helper. Resolves the nearest peg this
// ball overlaps (grid broad-phase); returns true on a hit. Authored once.
function _resolvePegsNear(world, pool, i) {
  let hit = false;
  world.grid.forEachNeighbor(pool.x[i], pool.y[i], (pi) => {
    const cx = world.pegs.xs[pi];
    const cy = world.pegs.ys[pi];
    const r = resolveCircleCircle(
      pool.x[i], pool.y[i], pool.vx[i], pool.vy[i], pool.radius[i],
      cx, cy, world.pegs.r, world.eCollider, world.kick, world.maxSpeed,
    );
    if (r.hit) {
      pool.x[i] = r.x; pool.y[i] = r.y; pool.vx[i] = r.vx; pool.vy[i] = r.vy;
      hit = true;
    }
  });
  return hit;
}

function _integrateAndCollide(world, pool, i, dt, now, isSpecial) {
  // gravity + drag
  pool.vy[i] += GRAVITY * dt;
  pool.vx[i] *= DRAG;
  pool.vy[i] *= DRAG;
  pool.x[i] += pool.vx[i] * dt;
  pool.y[i] += pool.vy[i] * dt;

  // walls
  const w = reflectWalls(
    pool.x[i], pool.y[i], pool.vx[i], pool.vy[i], pool.radius[i],
    world.W, world.H, world.eWall, world.hasFloor,
  );
  pool.x[i] = w.x; pool.y[i] = w.y; pool.vx[i] = w.vx; pool.vy[i] = w.vy;
  if (w.hitWall) {
    world.counters.wall++;
    if (isSpecial) pool.envHits[i]++;
    if (!isSpecial && (pool.flags[i] & FLAG_GOLDEN)) world.counters.goldenBonus += GOLDEN.bonus;
  }

  // pegs (grid broad-phase + single helper)
  if (_resolvePegsNear(world, pool, i)) {
    world.counters.peg++;
    if (isSpecial) pool.envHits[i]++;
    if (!isSpecial && (pool.flags[i] & FLAG_GOLDEN)) world.counters.goldenBonus += GOLDEN.bonus;
  }

  // blocks (narrow-phase + block runtime) — filled in Task 2.7
  _resolveBlocksFor(world, pool, i, now, isSpecial);

  // paddle
  const pa = world.paddle;
  const pr = resolveCircleAABB(
    pool.x[i], pool.y[i], pool.vx[i], pool.vy[i], pool.radius[i],
    pa.x, pa.y, pa.w / 2, pa.h / 2, world.eCollider, world.kick, world.maxSpeed,
  );
  if (pr.hit) {
    pool.x[i] = pr.x; pool.y[i] = pr.y; pool.vx[i] = pr.vx; pool.vy[i] = pr.vy;
    if (isSpecial) pool.envHits[i]++;
  }
}

function _resolveBlocksFor(world, pool, i, now, isSpecial) {
  const b = world.blocks;
  const hw = world.blockW / 2;
  const hh = world.blockH / 2;
  for (let j = 0; j < b.count; j++) {
    if (b.level[j] <= 0) continue; // inactive (awaiting respawn)
    const r = resolveCircleAABB(
      pool.x[i], pool.y[i], pool.vx[i], pool.vy[i], pool.radius[i],
      b.xs[j], b.ys[j], hw, hh, world.eCollider, world.kick, world.maxSpeed,
    );
    if (!r.hit) continue;
    pool.x[i] = r.x; pool.y[i] = r.y; pool.vx[i] = r.vx; pool.vy[i] = r.vy;
    b.level[j]--;
    world.counters.block++;
    if (isSpecial) pool.envHits[i]++;
    const golden = b.golden[j] === 1;
    if (golden && !isSpecial) world.counters.goldenBonus += GOLDEN.bonus;
    if (b.level[j] <= 0) {
      b.level[j] = 0;
      b.respawnAt[j] = now + RESPAWN_DELAY;
      world.counters.breakBonus += BLOCK_BREAK_BONUS;
    }
    return; // one block contact per step per ball (matches sequential ordering)
  }
}

function _respawnBlocks(world, now) {
  const b = world.blocks;
  for (let j = 0; j < b.count; j++) {
    if (b.level[j] <= 0 && b.respawnAt[j] <= now) {
      b.level[j] = BLOCK_LEVELS;
      b.respawnAt[j] = 0;
      b.golden[j] = Math.random() < world.goldenChance ? 1 : 0;
    }
  }
}

function _runPool(world, pool, dt, now, isSpecial) {
  if (isSpecial) {
    for (let i = 0; i < pool.count; i++) pool.envHits[i] = 0;
  }
  let i = 0;
  while (i < pool.count) {
    _integrateAndCollide(world, pool, i, dt, now, isSpecial);
    if (pool.y[i] > world.H + world.leakMargin) {
      swapRemove(pool, i); // do NOT advance i; swapped-in element occupies slot i
    } else {
      i++;
    }
  }
}

export function stepPhysics(world, dt, now, emit = NOOP_EMIT, resolveClack = null) {
  world.counters.wall = 0;
  world.counters.peg = 0;
  world.counters.block = 0;
  world.counters.goldenBonus = 0;
  world.counters.breakBonus = 0;

  _respawnBlocks(world, now);

  _runPool(world, world.normal, dt, now, false);
  _runPool(world, world.special, dt, now, true);

  // special-vs-special clack pass implemented in Task 2.8
  _specialClackPass(world, dt, now, emit, resolveClack);
}

function _specialClackPass(world, dt, now, emit, resolveClack) {
  const sp = world.special;
  const n = sp.count;
  // decay cooldowns first (single tested implementation in specials.js)
  tickClackCooldowns(sp, dt);
  // O(k^2) pair scan: resolve an elastic bounce + debounced clack
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = sp.x[i] - sp.x[j];
      const dy = sp.y[i] - sp.y[j];
      const sum = sp.radius[i] + sp.radius[j];
      if (dx * dx + dy * dy >= sum * sum) continue;
      // elastic separation: treat j as the collider for i
      const ri = resolveCircleCircle(
        sp.x[i], sp.y[i], sp.vx[i], sp.vy[i], sp.radius[i],
        sp.x[j], sp.y[j], sp.radius[j], world.eCollider, 0, world.maxSpeed,
      );
      sp.x[i] = ri.x; sp.y[i] = ri.y; sp.vx[i] = ri.vx; sp.vy[i] = ri.vy;
      // debounced clack: only when both cooldowns are clear
      if (resolveClack && sp.clackCooldown[i] <= 0 && sp.clackCooldown[j] <= 0) {
        resolveClack(world, i, j, emit);
      }
    }
  }
}

export function spawnCount(acc, spawnRate, dt, freeSlots, maxPerTick) {
  acc += spawnRate * dt;
  let n = Math.floor(acc);
  if (n > freeSlots) n = freeSlots;
  if (n > maxPerTick) n = maxPerTick;
  if (n < 0) n = 0;
  return { n, acc: acc - n };
}

export function rollGoldenFlag(goldenChance, rng = Math.random) {
  return rng() < goldenChance ? FLAG_GOLDEN : 0;
}

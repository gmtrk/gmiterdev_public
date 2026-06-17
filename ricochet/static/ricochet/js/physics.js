import {
  DT, ARENA_W, ARENA_H, SPAWN_MARGIN, SPAWN_Y,
  CEILING_DESKTOP, RESERVED_OWNED, SPECIAL_CAP, GRID_CELL,
  GRAVITY, DRAG, E_WALL, E_COLLIDER, PEG_RADIUS, BALL_RADIUS, KICK, MAX_SPEED,
  BLOCK_W, BLOCK_H, BLOCK_LEVELS, RESPAWN_DELAY, BLOCK_BREAK_BONUS, E_BLOCK, BLOCK_KICK,
  GOLDEN, CLACK_COOLDOWN, BASE_CAPACITY, MAX_SPAWNS_PER_TICK, SPAWN_HELPER_DIST,
  SPAWN_RATE_BASE, BOUNCE_JITTER, BOUNCE_JITTER_CHANCE, SURFACE_BASE,
  RAMP_LEN, RAMP_THICKNESS, RAMP_ANGLE, RAMP_WALL_OFFSET, RAMP_FLOOR_MARGIN,
  SPECIAL_RADIUS, BURSTER_RADIUS, SPECIAL_MAX_SPEED, MIN_PEG_SPACING,
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

// Rotate (vx,vy) by a random angle in [-maxAngle, +maxAngle]. Speed is preserved;
// only the direction is perturbed (the "random offset" that scatters block
// bounces). rng() returns [0,1). Pure given rng — unit-tested.
export function jitterVelocity(vx, vy, maxAngle, rng) {
  const ang = (rng() * 2 - 1) * maxAngle;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { vx: vx * c - vy * s, vy: vx * s + vy * c };
}

// Number of collision sub-steps for a full DT so a ball at `maxSpeed` advances
// less than PEG_RADIUS per slice (the tunneling bound). 1 when the speed cap is
// already step-safe; capped so an extreme cap can't blow up CPU. Pure + tested.
const SUBSTEP_SAFETY = 0.9;     // keep each slice comfortably under a peg radius
const MAX_SUBSTEP_COUNT = 16;   // backstop for an absurd speed-cap slider value
export function substepCount(maxSpeed, dt) {
  const limit = SUBSTEP_SAFETY * PEG_RADIUS;
  let n = Math.ceil((maxSpeed * dt) / limit);
  if (!(n >= 1)) n = 1;
  if (n > MAX_SUBSTEP_COUNT) n = MAX_SUBSTEP_COUNT;
  return n;
}

// Apply the bounce-jitter roll to ball `i` of `pool` (block hits only).
// No-op when the world has jitter disabled or the random roll misses.
function _maybeJitter(world, pool, i) {
  const chance = world.bounceJitterChance;
  if (!(chance > 0)) return;
  const rng = world.rng || Math.random;
  if (rng() >= chance) return;
  const j = jitterVelocity(pool.vx[i], pool.vy[i], world.bounceJitter, rng);
  pool.vx[i] = j.vx;
  pool.vy[i] = j.vy;
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
    ramps: {
      x1s: new Float32Array(0), y1s: new Float32Array(0),
      x2s: new Float32Array(0), y2s: new Float32Array(0),
      count: 0, r: RAMP_THICKNESS,
    },
    rampsLevel: 0,
    rampAngle: state.placed.rampAngle != null ? state.placed.rampAngle : RAMP_ANGLE,
    grid: new Grid(ARENA_W, ARENA_H, GRID_CELL),
    counters: { wall: 0, peg: 0, block: 0, goldenBonus: 0, breakBonus: 0 },
    minPegSpacing: MIN_PEG_SPACING,
    surfaceBase: { ...SURFACE_BASE },
    ceiling: CEILING_DESKTOP,
    leakMargin: 40,
    hasFloor: false,
    eWall: E_WALL,
    eCollider: E_COLLIDER,
    kick: KICK,
    maxSpeed: MAX_SPEED,
    specialMaxSpeed: SPECIAL_MAX_SPEED,
    // Blocks bounce higher than pegs (own restitution + kick); block hits
    // get a random directional jitter for chaos. rng is injectable for tests.
    blockE: E_BLOCK,
    blockKick: BLOCK_KICK,
    bounceJitter: BOUNCE_JITTER,
    bounceJitterChance: BOUNCE_JITTER_CHANCE,
    rng: Math.random,
    // Per-run, live-tunable feel constants. Seeded from config so the default
    // behaviour is unchanged, but stepPhysics reads these off the world (not the
    // module constants) so the debug panel can retune them live. spawnRate is the
    // baseline balls/sec the main spawn tick reads (applyUpgradeEffects overrides it).
    gravity: GRAVITY,
    drag: DRAG,
    spawnRate: SPAWN_RATE_BASE,
    spawnHelperDist: SPAWN_HELPER_DIST,
    globalValueMult: 1,
    goldenChance: GOLDEN.chance,
    baseCapacity: BASE_CAPACITY,
    budgets: { pegs: 0, blocks: 0 },
    blockW: BLOCK_W,
    blockH: BLOCK_H,
  };
  rebuildColliders(world);
  applyUpgradeEffects(world, state);
  rebuildRamps(world); // applyUpgradeEffects set world.rampsLevel; build the segments
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
  rebuildRamps(world);
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
  p.radius[i] = type === TYPE_BURSTER ? BURSTER_RADIUS : SPECIAL_RADIUS; p.type[i] = type; p.flags[i] = 0;
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

// Circle vs. capsule (segment + thickness segR). Like a wall: restitution e, NO
// kick (so it can't sustain an infinite-bounce farm). Closest-point narrow phase;
// depenetrates along the contact normal and reflects. Pure + tested.
export function resolveCircleSegment(bx, by, vx, vy, br, x1, y1, x2, y2, segR, e, maxSpeed) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 1e-12 ? ((bx - x1) * dx + (by - y1) * dy) / len2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  const ox = bx - cx;
  const oy = by - cy;
  const dist2 = ox * ox + oy * oy;
  const sum = br + segR;
  if (dist2 >= sum * sum) return { x: bx, y: by, vx, vy, hit: false };
  let dist = Math.sqrt(dist2);
  let nx;
  let ny;
  if (dist > 1e-9) {
    nx = ox / dist; ny = oy / dist;
  } else {
    // ball center exactly on the segment: use the perpendicular, prefer "up"
    const sl = Math.sqrt(len2) || 1;
    nx = -dy / sl; ny = dx / sl;
    if (ny > 0) { nx = -nx; ny = -ny; }
    dist = 0;
  }
  const pen = sum - dist;
  bx += nx * pen;
  by += ny * pen;
  const vn = vx * nx + vy * ny;
  vx -= (1 + e) * vn * nx;
  vy -= (1 + e) * vn * ny;
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
  // gravity + drag — read off the world (seeded from GRAVITY/DRAG in buildWorld)
  // so the debug panel can retune them live without touching module constants.
  // Applied ONCE over the full dt (so the gravity/drag integration is unchanged).
  const gravity = world.gravity != null ? world.gravity : GRAVITY;
  const drag = world.drag != null ? world.drag : DRAG;
  pool.vy[i] += gravity * dt;
  pool.vx[i] *= drag;
  pool.vy[i] *= drag;
  // Clamp the speed feeding the move to MAX_SPEED. The contact resolvers also
  // clamp, so velocity stays <= maxSpeed across every sub-step below.
  const cap = isSpecial ? (world.specialMaxSpeed != null ? world.specialMaxSpeed : world.maxSpeed) : world.maxSpeed;
  const cl = clampSpeed(pool.vx[i], pool.vy[i], cap);
  pool.vx[i] = cl.vx; pool.vy[i] = cl.vy;

  // Advance + collide in N sub-steps so a fast ball can't skip an obstacle. A
  // single dt move at a high speed cap (1100 px/s ≈ 18px) would jump past a 7px
  // peg / 28px block (and bounce off the far face after over-shooting). Slicing
  // the move into pieces each shorter than PEG_RADIUS keeps the tunneling
  // invariant per sub-step. N is derived from the live maxSpeed in stepPhysics.
  const sub = world.substeps > 0 ? world.substeps : 1;
  const sdt = dt / sub;
  for (let s = 0; s < sub; s++) {
    pool.x[i] += pool.vx[i] * sdt;
    pool.y[i] += pool.vy[i] * sdt;
    _resolveContacts(world, pool, i, now, isSpecial);
  }
}

// Resolve all environment contacts (walls, pegs, blocks) at the ball's
// current position. Called once per movement sub-step. Counter increments are
// per contact, which is correct: two pegs hit across two sub-steps = two peg hits.
function _resolveContacts(world, pool, i, now, isSpecial) {
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

  // blocks (narrow-phase + block runtime)
  _resolveBlocksFor(world, pool, i, now, isSpecial);

  // ramps — bouncy angled walls: restitution E_WALL, NO kick (so no farm),
  // +1 point each (counts as a wall hit), fed into combo/golden like walls.
  const rmp = world.ramps;
  if (rmp && rmp.count > 0) {
    for (let j = 0; j < rmp.count; j++) {
      const rr = resolveCircleSegment(
        pool.x[i], pool.y[i], pool.vx[i], pool.vy[i], pool.radius[i],
        rmp.x1s[j], rmp.y1s[j], rmp.x2s[j], rmp.y2s[j], rmp.r,
        world.eWall, world.maxSpeed,
      );
      if (rr.hit) {
        pool.x[i] = rr.x; pool.y[i] = rr.y; pool.vx[i] = rr.vx; pool.vy[i] = rr.vy;
        world.counters.wall++;
        if (isSpecial) pool.envHits[i]++;
        if (!isSpecial && (pool.flags[i] & FLAG_GOLDEN)) world.counters.goldenBonus += GOLDEN.bonus;
      }
    }
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
      b.xs[j], b.ys[j], hw, hh, world.blockE, world.blockKick, world.maxSpeed,
    );
    if (!r.hit) continue;
    pool.x[i] = r.x; pool.y[i] = r.y; pool.vx[i] = r.vx; pool.vy[i] = r.vy;
    _maybeJitter(world, pool, i); // chaotic scatter off blocks
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

  // Collision sub-step count for this step, derived from the live speed cap so a
  // retuned maxSpeed (debug slider) stays tunneling-safe. Read in _integrateAndCollide.
  world.substeps = substepCount(world.maxSpeed, dt);

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

// --- ramps (side deflectors) -------------------------------------------------
// Fixed-position bouncy walls derived from the ramps upgrade level + a tunable
// angle (degrees). Left ramp `\`: outer end higher near the wall, inner end lower
// toward center; right ramp is the mirror. Center stays open as the drain.
const RAMP_X_FRAC = 0.27;        // left ramp center x = W * this (right = 1 - this)
const RAMP_MID_FRAC = 0.62;      // midway pair center y = H * this

export function rampLayout(level, angleDeg, W, H) {
  const out = [];
  const theta = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Bottom pair: ALWAYS present (free). Outer (upper) end pinned to the wall;
  // length-clamped so the inner (lower) end stays in the arena.
  const yA = H - RAMP_WALL_OFFSET;
  const maxDrop = H - RAMP_FLOOR_MARGIN - yA;
  const L = Math.min(RAMP_LEN, maxDrop / Math.max(sin, 1e-3));
  out.push({ x1: 0, y1: yA, x2: L * cos, y2: yA + L * sin });
  out.push({ x1: W, y1: yA, x2: W - L * cos, y2: yA + L * sin });

  if (level >= 1) {
    // Mid pair (bought via "Mid Ramps"): inset side-deflectors.
    const half = RAMP_LEN / 2;
    const cxL = W * RAMP_X_FRAC;
    const cxR = W * (1 - RAMP_X_FRAC);
    const cy = H * RAMP_MID_FRAC;
    out.push({ x1: cxL - half * cos, y1: cy - half * sin, x2: cxL + half * cos, y2: cy + half * sin });
    out.push({ x1: cxR + half * cos, y1: cy - half * sin, x2: cxR - half * cos, y2: cy + half * sin });
  }
  return out;
}

export function rebuildRamps(world) {
  const level = world.rampsLevel || 0;
  const angle = world.rampAngle != null ? world.rampAngle : RAMP_ANGLE;
  const segs = rampLayout(level, angle, world.W, world.H);
  const n = segs.length;
  const r = world.ramps;
  if (r.x1s.length < n) {
    r.x1s = new Float32Array(n); r.y1s = new Float32Array(n);
    r.x2s = new Float32Array(n); r.y2s = new Float32Array(n);
  }
  for (let i = 0; i < n; i++) {
    r.x1s[i] = segs[i].x1; r.y1s[i] = segs[i].y1;
    r.x2s[i] = segs[i].x2; r.y2s[i] = segs[i].y2;
  }
  r.count = n;
  r.r = RAMP_THICKNESS;
}

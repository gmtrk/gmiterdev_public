import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAG_GOLDEN, FLAG_CAP_EXEMPT,
  TYPE_NORMAL, TYPE_CLACKER, TYPE_SPLITTER, TYPE_BURSTER,
} from './physics.js';

test('flag constants are distinct power-of-two bits', () => {
  assert.equal(FLAG_GOLDEN, 1);
  assert.equal(FLAG_CAP_EXEMPT, 2);
  assert.equal(FLAG_GOLDEN & FLAG_CAP_EXEMPT, 0);
});

test('type constants are distinct small integers', () => {
  assert.equal(TYPE_NORMAL, 0);
  assert.equal(TYPE_CLACKER, 1);
  assert.equal(TYPE_SPLITTER, 2);
  assert.equal(TYPE_BURSTER, 3);
});

import { createPool, swapRemove } from './physics.js';

test('createPool allocates SoA typed arrays of the given capacity', () => {
  const p = createPool(10, false);
  assert.equal(p.capacity, 10);
  assert.equal(p.count, 0);
  assert.ok(p.x instanceof Float32Array && p.x.length === 10);
  assert.ok(p.y instanceof Float32Array && p.y.length === 10);
  assert.ok(p.vx instanceof Float32Array && p.vx.length === 10);
  assert.ok(p.vy instanceof Float32Array && p.vy.length === 10);
  assert.ok(p.radius instanceof Float32Array && p.radius.length === 10);
  assert.ok(p.type instanceof Uint8Array && p.type.length === 10);
  assert.ok(p.flags instanceof Uint8Array && p.flags.length === 10);
  assert.equal(p.charge, undefined);
  assert.equal(p.clackCooldown, undefined);
  assert.equal(p.envHits, undefined);
});

test('createPool with isSpecial adds charge/clackCooldown/envHits arrays', () => {
  const p = createPool(8, true);
  assert.ok(p.charge instanceof Float32Array && p.charge.length === 8);
  assert.ok(p.clackCooldown instanceof Float32Array && p.clackCooldown.length === 8);
  assert.ok(p.envHits instanceof Int32Array && p.envHits.length === 8);
});

test('swapRemove moves the last element into the hole and shrinks count (O(1))', () => {
  const p = createPool(4, false);
  // manually populate 3 distinguishable entries
  for (let i = 0; i < 3; i++) {
    p.x[i] = (i + 1) * 100; p.y[i] = (i + 1) * 10;
    p.vx[i] = i + 1; p.vy[i] = -(i + 1);
    p.radius[i] = 6; p.type[i] = 0; p.flags[i] = i;
    p.count++;
  }
  // remove index 0; the last (index 2) must be copied into slot 0
  swapRemove(p, 0);
  assert.equal(p.count, 2);
  assert.equal(p.x[0], 300);
  assert.equal(p.y[0], 30);
  assert.equal(p.vx[0], 3);
  assert.equal(p.vy[0], -3);
  assert.equal(p.flags[0], 2);
});

test('swapRemove of the last element just shrinks count without self-copy issues', () => {
  const p = createPool(4, false);
  for (let i = 0; i < 2; i++) {
    p.x[i] = i; p.y[i] = i; p.count++;
  }
  swapRemove(p, 1); // last index
  assert.equal(p.count, 1);
  assert.equal(p.x[0], 0);
});

test('swapRemove carries special-only fields (charge/clackCooldown/envHits) on a special pool', () => {
  const p = createPool(4, true);
  for (let i = 0; i < 3; i++) {
    p.charge[i] = (i + 1) * 5;
    p.clackCooldown[i] = (i + 1) * 0.1;
    p.envHits[i] = i + 1;
    p.count++;
  }
  swapRemove(p, 0);
  assert.equal(p.count, 2);
  assert.equal(p.charge[0], 15);
  assert.ok(Math.abs(p.clackCooldown[0] - 0.3) < 1e-6);
  assert.equal(p.envHits[0], 3);
});

import { clampSpeed, reflectWalls } from './physics.js';
import { ARENA_W, ARENA_H, BALL_RADIUS, E_WALL, MAX_SPEED } from './config.js';

test('clampSpeed leaves sub-max velocities untouched', () => {
  const r = clampSpeed(10, -20, MAX_SPEED);
  assert.equal(r.vx, 10);
  assert.equal(r.vy, -20);
});

test('clampSpeed scales an over-max velocity down to exactly MAX_SPEED', () => {
  // velocity (2*MAX_SPEED, 0) is clearly over the cap and must scale down to it.
  const r = clampSpeed(2 * MAX_SPEED, 0, MAX_SPEED);
  const sp = Math.hypot(r.vx, r.vy);
  assert.ok(Math.abs(sp - MAX_SPEED) < 1e-3, `speed was ${sp}`);
  assert.ok(r.vx > 0 && Math.abs(r.vy) < 1e-6);
});

import { jitterVelocity } from './physics.js';

test('jitterVelocity with a centered rng (0.5) leaves the velocity unchanged', () => {
  // rng()=0.5 -> angle (0.5*2-1)*max = 0 -> no rotation.
  const r = jitterVelocity(30, -40, 0.4, () => 0.5);
  assert.ok(Math.abs(r.vx - 30) < 1e-9, `vx ${r.vx}`);
  assert.ok(Math.abs(r.vy - (-40)) < 1e-9, `vy ${r.vy}`);
});

test('jitterVelocity preserves speed while rotating direction', () => {
  const sp0 = Math.hypot(30, -40); // 50
  for (const u of [0, 0.25, 0.5, 0.75, 1]) {
    const r = jitterVelocity(30, -40, 0.4, () => u);
    assert.ok(Math.abs(Math.hypot(r.vx, r.vy) - sp0) < 1e-6, `speed drift at rng=${u}`);
  }
  // a non-centered rng actually changes the direction
  const rotated = jitterVelocity(30, -40, 0.4, () => 1);
  assert.ok(Math.abs(rotated.vx - 30) > 1e-3 || Math.abs(rotated.vy - (-40)) > 1e-3, 'expected rotation');
});

import { substepCount } from './physics.js';
import { DT as STEP_DT } from './config.js';

test('substepCount is 1 when the speed cap is already single-step safe', () => {
  // 210 px/s -> 3.5px/step, under the 0.9*PEG_RADIUS slice limit, so no slicing.
  assert.equal(substepCount(210, STEP_DT), 1);
});

test('substepCount slices a high cap so each sub-step stays under PEG_RADIUS', () => {
  const n = substepCount(1100, STEP_DT);
  assert.ok(n >= 3, `expected >=3 sub-steps for 1100 px/s, got ${n}`);
  assert.ok((1100 * STEP_DT) / n < PEG_RADIUS, 'per-sub-step displacement under a peg radius');
});

test('substepCount stays >=1 and is capped for extreme caps', () => {
  assert.ok(substepCount(0, STEP_DT) >= 1);
  assert.ok(substepCount(1e9, STEP_DT) <= 16);
});

test('reflectWalls reflects and clamps off the left wall', () => {
  // ball center x=2, r=6 -> penetrates left wall (x-r = -4 < 0)
  const r = reflectWalls(2, 750, -10, 0, BALL_RADIUS, ARENA_W, ARENA_H, E_WALL, true);
  assert.equal(r.hitWall, true);
  assert.equal(r.x, BALL_RADIUS);            // clamped to r
  assert.ok(Math.abs(r.vx - (10 * E_WALL)) < 1e-5); // vx flips and *= eWall -> +9.2
});

test('reflectWalls reflects off the ceiling', () => {
  const r = reflectWalls(500, 2, 0, -30, BALL_RADIUS, ARENA_W, ARENA_H, E_WALL, true);
  assert.equal(r.hitWall, true);
  assert.equal(r.y, BALL_RADIUS);
  assert.ok(Math.abs(r.vy - (30 * E_WALL)) < 1e-5);
});

test('reflectWalls with hasFloor reflects off the bottom; without floor it does not', () => {
  const withFloor = reflectWalls(500, ARENA_H + 1, 0, 40, BALL_RADIUS, ARENA_W, ARENA_H, E_WALL, true);
  assert.equal(withFloor.hitWall, true);
  assert.equal(withFloor.y, ARENA_H - BALL_RADIUS);
  assert.ok(withFloor.vy < 0);

  const noFloor = reflectWalls(500, ARENA_H + 1, 0, 40, BALL_RADIUS, ARENA_W, ARENA_H, E_WALL, false);
  assert.equal(noFloor.hitWall, false);
  assert.equal(noFloor.y, ARENA_H + 1); // untouched, will leak out the bottom
  assert.equal(noFloor.vy, 40);
});

test('reflectWalls leaves an interior ball untouched', () => {
  const r = reflectWalls(500, 750, 5, 5, BALL_RADIUS, ARENA_W, ARENA_H, E_WALL, true);
  assert.equal(r.hitWall, false);
  assert.equal(r.x, 500);
  assert.equal(r.y, 750);
  assert.equal(r.vx, 5);
  assert.equal(r.vy, 5);
});

import { resolveCircleCircle, resolveCircleAABB, resolveCircleSegment } from './physics.js';
import { PEG_RADIUS, E_COLLIDER, KICK, BLOCK_H } from './config.js';

test('resolveCircleCircle: no overlap -> hit:false, velocity unchanged', () => {
  // ball at (100,0) r6, peg at (0,0) r7 -> dist 100 >> 13, no overlap
  const r = resolveCircleCircle(100, 0, -5, 0, BALL_RADIUS, 0, 0, PEG_RADIUS, E_COLLIDER, KICK, MAX_SPEED);
  assert.equal(r.hit, false);
  assert.equal(r.vx, -5);
  assert.equal(r.vy, 0);
});

test('resolveCircleCircle: overlapping peg separates, reflects, kicks, clamps', () => {
  // ball (10,0) r6 moving vx=-100 into peg (0,0) r7. dist=10 < 13 -> overlap, n=(1,0)
  const r = resolveCircleCircle(10, 0, -100, 0, BALL_RADIUS, 0, 0, PEG_RADIUS, E_COLLIDER, KICK, MAX_SPEED);
  assert.equal(r.hit, true);
  // separate: penetration = (6+7) - 10 = 3, push +3 along n -> x = 13
  assert.ok(Math.abs(r.x - 13) < 1e-4, `x was ${r.x}`);
  // reflect: v -= (1+0.9)(v.n)n ; v.n = -100 ; -> vx = -100 - 1.9*(-100) = 90
  // kick: vx += KICK*n.x = 90 + 60 = 150
  assert.ok(Math.abs(r.vx - 150) < 1e-4, `vx was ${r.vx}`);
  assert.ok(Math.abs(r.vy) < 1e-6);
});

test('resolveCircleCircle TUNNELING: a MAX_SPEED ball overlapping a PEG_RADIUS peg registers a hit', () => {
  // place the ball already overlapping (post-integration position) at distance < r+pegR
  // ball (8,0) r6 moving at full MAX_SPEED toward peg (0,0) r7 ; dist 8 < 13
  const r = resolveCircleCircle(8, 0, -MAX_SPEED, 0, BALL_RADIUS, 0, 0, PEG_RADIUS, E_COLLIDER, KICK, MAX_SPEED);
  assert.equal(r.hit, true);
  // outgoing speed must be clamped to MAX_SPEED
  assert.ok(Math.hypot(r.vx, r.vy) <= MAX_SPEED + 1e-3, `speed ${Math.hypot(r.vx, r.vy)}`);
});

test('resolveCircleAABB: ball overlapping the left edge -> hit:true, reflects off the -x normal', () => {
  // MUST-HONOR: overlapping geometry. box center ax=84, half-extents aw=64, ah=14 -> left edge at 20.
  // ball (16,10) r5 ; closest point (20,10) ; dist 4 < 5 -> hit ; n=(-1,0)
  const r = resolveCircleAABB(16, 10, 50, 0, 5, 84, 10, 64, 14, E_COLLIDER, 0, MAX_SPEED);
  assert.equal(r.hit, true);
  // separate: penetration = 5 - 4 = 1, push -1 along n.x(-1) -> x = 16 - 1 = 15
  assert.ok(Math.abs(r.x - 15) < 1e-4, `x was ${r.x}`);
  // reflect (no kick for blocks, kick arg=0): v.n = 50*(-1) = -50 ; vx = 50 - 1.9*(-50)*(-1) = 50 - 95 = -45
  assert.ok(Math.abs(r.vx - (-45)) < 1e-4, `vx was ${r.vx}`);
});

test('resolveCircleAABB: non-overlapping box -> hit:false, velocity unchanged', () => {
  const r = resolveCircleAABB(0, 0, 10, 0, 5, 200, 200, 32, 14, E_COLLIDER, 0, MAX_SPEED);
  assert.equal(r.hit, false);
  assert.equal(r.vx, 10);
  assert.equal(r.vy, 0);
});

test('resolveCircleAABB TUNNELING: a MAX_SPEED ball overlapping a thin block (half-height BLOCK_H/2) registers a hit', () => {
  // thin block: center (500,500), half-extents (32, BLOCK_H/2=14).
  // ball approaching from above already overlapping: (500, 500 - 14 - 6 + 2) r6 = (500,482), dist to top edge 4 < 6
  const halfH = BLOCK_H / 2;
  const r = resolveCircleAABB(500, 500 - halfH - 6 + 2, 0, MAX_SPEED, BALL_RADIUS, 500, 500, 32, halfH, E_COLLIDER, 0, MAX_SPEED);
  assert.equal(r.hit, true);
  assert.ok(r.vy < 0, `vy should reflect upward, was ${r.vy}`);
  assert.ok(Math.hypot(r.vx, r.vy) <= MAX_SPEED + 1e-3);
});

import { buildWorld, rebuildColliders, spawnNormal, spawnSpecial } from './physics.js';
import { SPAWN_Y, BLOCK_W, BLOCK_LEVELS, SPECIAL_CAP, SURFACE_BASE } from './config.js';
import { Grid } from './grid.js';

// A minimal canonical `state` for world-building tests.
function makeState() {
  return {
    version: 1,
    credits: 50,
    cores: 0, lifetimeCores: 0,
    upgrades: {},
    specials: { clacker: { unlocked: false, capacity: 0 }, splitter: { unlocked: false, capacity: 0 }, burster: { unlocked: false, capacity: 0 } },
    coresShop: {},
    placed: {
      pegs: [{ x: 100, y: 300 }, { x: 200, y: 400 }],
      blocks: [{ x: 400, y: 820, level: 9, respawnAt: 0, golden: false }],
      paddle: { x: 500, width: 120 },
    },
    stats: { recentEarnRate: 0, lastSaveTime: 0, lastSubmittedCores: 0 },
  };
}

test('buildWorld returns the canonical world shape with both pools and zeroed counters', () => {
  const state = makeState();
  const world = buildWorld(state);
  assert.equal(world.W, ARENA_W);
  assert.equal(world.H, ARENA_H);
  assert.equal(world.pegRadius, PEG_RADIUS);
  assert.equal(world.normal.capacity, world.ceiling > 0 ? world.normal.capacity : world.normal.capacity); // normal pool exists
  assert.ok(world.normal && world.normal.x instanceof Float32Array);
  assert.equal(world.special.capacity, SPECIAL_CAP);
  assert.ok(world.special.charge instanceof Float32Array); // special pool is a special SoA
  assert.deepEqual(world.counters, { wall: 0, peg: 0, block: 0, goldenBonus: 0, breakBonus: 0 });
  assert.equal(world.blockW, BLOCK_W);
  assert.equal(world.blockH, BLOCK_H);
  assert.ok(world.grid instanceof Grid);
  // colliders synced from state.placed.*
  assert.equal(world.pegs.count, 2);
  assert.equal(world.blocks.count, 1);
  assert.equal(world.blocks.w, BLOCK_W);
  assert.equal(world.blocks.h, BLOCK_H);
  // applyUpgradeEffects-derived fields are present (set by economy.js)
  assert.equal(typeof world.globalValueMult, 'number');
  assert.equal(typeof world.goldenChance, 'number');
  assert.equal(typeof world.baseCapacity, 'number');
  assert.equal(typeof world.budgets.pegs, 'number');
  assert.equal(typeof world.budgets.blocks, 'number');
  // world retains a reference to its owning state for rebuildColliders
  assert.equal(world.state, state);
});

test('rebuildColliders rewrites pegs/blocks SoA from state.placed and rebuilds the grid', () => {
  const state = makeState();
  const world = buildWorld(state);
  // mutate the blueprint then re-sync
  state.placed.pegs = [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }];
  state.placed.blocks = [
    { x: 111, y: 222, level: 5, respawnAt: 0, golden: true },
    { x: 333, y: 444, level: 9, respawnAt: 0, golden: false },
  ];
  rebuildColliders(world);
  assert.equal(world.pegs.count, 3);
  assert.equal(world.pegs.xs[2], 50);
  assert.equal(world.pegs.ys[2], 60);
  assert.equal(world.pegs.r, PEG_RADIUS);
  assert.equal(world.blocks.count, 2);
  assert.equal(world.blocks.xs[0], 111);
  assert.equal(world.blocks.level[0], 5);
  assert.equal(world.blocks.golden[0], 1);
  assert.equal(world.blocks.golden[1], 0);
});

test('spawnNormal inserts into world.normal while count < ceiling and sets fields', () => {
  const state = makeState();
  const world = buildWorld(state);
  world.ceiling = 3;
  spawnNormal(world, 123, SPAWN_Y, FLAG_GOLDEN);
  assert.equal(world.normal.count, 1);
  assert.equal(world.normal.x[0], 123);
  assert.equal(world.normal.y[0], SPAWN_Y);
  assert.equal(world.normal.type[0], TYPE_NORMAL);
  assert.equal(world.normal.flags[0] & FLAG_GOLDEN, FLAG_GOLDEN);
  assert.equal(world.normal.radius[0], BALL_RADIUS);
});

test('spawnNormal refuses to insert once count >= ceiling', () => {
  const state = makeState();
  const world = buildWorld(state);
  world.ceiling = 1;
  spawnNormal(world, 10, 10, 0);
  spawnNormal(world, 20, 20, 0); // should be rejected
  assert.equal(world.normal.count, 1);
});

test('spawnSpecial inserts into world.special with zeroed charge/clackCooldown/envHits', () => {
  const state = makeState();
  const world = buildWorld(state);
  spawnSpecial(world, TYPE_BURSTER, 250, 30);
  assert.equal(world.special.count, 1);
  assert.equal(world.special.type[0], TYPE_BURSTER);
  assert.equal(world.special.x[0], 250);
  assert.equal(world.special.charge[0], 0);
  assert.equal(world.special.clackCooldown[0], 0);
  assert.equal(world.special.envHits[0], 0);
});

test('spawnSpecial refuses once special count >= SPECIAL_CAP', () => {
  const state = makeState();
  const world = buildWorld(state);
  world.special.count = SPECIAL_CAP;
  spawnSpecial(world, TYPE_CLACKER, 1, 1);
  assert.equal(world.special.count, SPECIAL_CAP);
});

import { stepPhysics } from './physics.js';
import { DT, GRAVITY, DRAG, RESPAWN_DELAY, BLOCK_BREAK_BONUS, GOLDEN } from './config.js';

// state with NO colliders so a ball just integrates and leaks
function makeEmptyState() {
  const s = makeState();
  s.placed.pegs = [];
  s.placed.blocks = [];
  return s;
}

test('stepPhysics zeroes counters at the start of each step', () => {
  const world = buildWorld(makeEmptyState());
  world.counters.wall = 99; world.counters.peg = 99; world.counters.block = 99;
  world.counters.goldenBonus = 99; world.counters.breakBonus = 99;
  stepPhysics(world, DT, 0);
  assert.deepEqual(world.counters, { wall: 0, peg: 0, block: 0, goldenBonus: 0, breakBonus: 0 });
});

test('stepPhysics integrates gravity and drag on a free-falling normal ball', () => {
  const world = buildWorld(makeEmptyState());
  world.hasFloor = false;
  const i = spawnNormal(world, 500, 100, 0);
  assert.equal(i, 0);
  stepPhysics(world, DT, 0);
  // vy gained gravity*dt then *= drag ; y advanced by the new vy*dt
  const expectVy = (0 + GRAVITY * DT) * DRAG;
  assert.ok(Math.abs(world.normal.vy[0] - expectVy) < 1e-2, `vy ${world.normal.vy[0]}`);
  assert.ok(world.normal.y[0] > 100);
});

test('stepPhysics counts a wall bounce into counters.wall', () => {
  const world = buildWorld(makeEmptyState());
  spawnNormal(world, 3, 100, 0);          // near left wall (x-r < 0 after no move)
  world.normal.vx[0] = -50;               // driving into the wall
  stepPhysics(world, DT, 0);
  assert.equal(world.counters.wall, 1);
});

test('stepPhysics resolves a peg hit via the grid and counts counters.peg', () => {
  const s = makeState();
  s.placed.pegs = [{ x: 500, y: 300 }];
  s.placed.blocks = [];
  const world = buildWorld(s);
  // ball placed overlapping the peg so the narrow-phase fires this step
  spawnNormal(world, 506, 300, 0); // dist 6 < (6+7)=13 -> overlap
  world.normal.vx[0] = -10;
  stepPhysics(world, DT, 0);
  assert.equal(world.counters.peg, 1);
  // ball was pushed out and reflected to the right (kick + reflect)
  assert.ok(world.normal.vx[0] > 0, `vx ${world.normal.vx[0]}`);
});

test('stepPhysics golden ball peg contact adds GOLDEN.bonus to counters.goldenBonus', () => {
  const s = makeState();
  s.placed.pegs = [{ x: 500, y: 300 }];
  s.placed.blocks = [];
  const world = buildWorld(s);
  spawnNormal(world, 506, 300, FLAG_GOLDEN);
  world.normal.vx[0] = -10;
  stepPhysics(world, DT, 0);
  assert.equal(world.counters.peg, 1);
  assert.equal(world.counters.goldenBonus, GOLDEN.bonus);
});

test('stepPhysics despawns a leaked ball and frees the owned slot (no floor)', () => {
  const world = buildWorld(makeEmptyState());
  world.hasFloor = false;
  spawnNormal(world, 500, ARENA_H + world.leakMargin + 10, 0);
  assert.equal(world.normal.count, 1);
  stepPhysics(world, DT, 0);
  assert.equal(world.normal.count, 0); // swap-removed past leak margin
});

test('FINITE LIFETIME: a ball launched at MAX_SPEED through an empty no-floor arena drains within a bounded number of steps', () => {
  const world = buildWorld(makeEmptyState());
  world.hasFloor = false;
  spawnNormal(world, 500, 750, 0);
  world.normal.vx[0] = MAX_SPEED * 0.7;
  world.normal.vy[0] = -MAX_SPEED * 0.7; // launched upward — must still come down and leak
  let steps = 0;
  const LIMIT = 6000; // 100 sim-seconds at dt=1/60 is a generous bound
  while (world.normal.count > 0 && steps < LIMIT) {
    stepPhysics(world, DT, steps * DT);
    steps++;
  }
  assert.equal(world.normal.count, 0, `ball never drained in ${steps} steps`);
  assert.ok(steps < LIMIT, 'lifetime exceeded the bound (energy not bounded by drag)');
});

test('NO TUNNELING: free-flight speed stays clamped to MAX_SPEED under extreme gravity/light drag', () => {
  const world = buildWorld(makeEmptyState());
  world.hasFloor = false;
  world.gravity = 6000;  // far above the default
  world.drag = 0.999;    // terminal would be enormous without the per-step clamp
  spawnNormal(world, 500, 50, 0);
  for (let k = 0; k < 200 && world.normal.count > 0; k++) {
    stepPhysics(world, DT, k * DT);
    if (world.normal.count === 0) break;
    const sp = Math.hypot(world.normal.vx[0], world.normal.vy[0]);
    assert.ok(sp <= MAX_SPEED + 1e-3, `free-flight speed ${sp} exceeded MAX_SPEED ${MAX_SPEED}`);
  }
});

test('NO TUNNELING: a fast ball collides with a block instead of passing through it', () => {
  const s = makeState();
  s.placed.pegs = [];
  s.placed.blocks = [{ x: 500, y: 800, level: 9, respawnAt: 0, golden: false }];
  const world = buildWorld(s);
  world.hasFloor = false;
  world.gravity = 6000;        // would tunnel a ball straight through without the clamp
  world.drag = 0.999;
  world.bounceJitterChance = 0; // deterministic
  spawnNormal(world, 500, 50, 0); // directly above the block, falls straight down
  let hit = false;
  for (let k = 0; k < 800 && world.normal.count > 0; k++) {
    stepPhysics(world, DT, k * DT);
    if (world.counters.block > 0) { hit = true; break; }
  }
  assert.ok(hit, 'fast ball tunneled through the block instead of colliding');
});


function makeBlockState(level, golden) {
  const s = makeState();
  s.placed.pegs = [];
  s.placed.blocks = [{ x: 500, y: 500, level, respawnAt: 0, golden: !!golden }];
  return s;
}

test('block chip: a contact decrements level, counts counters.block, no break bonus above level 1', () => {
  const world = buildWorld(makeBlockState(9, false));
  // ball overlapping the top edge of the block (half-height BLOCK_H/2 = 14)
  spawnNormal(world, 500, 500 - world.blockH / 2 - BALL_RADIUS + 2, 0);
  world.normal.vy[0] = 50; // moving down into the block
  stepPhysics(world, DT, 1);
  assert.equal(world.counters.block, 1);
  assert.equal(world.blocks.level[0], 8);
  assert.equal(world.counters.breakBonus, 0);
});

test('block break: chipping the final level deactivates the block, sets respawnAt, adds BLOCK_BREAK_BONUS', () => {
  const world = buildWorld(makeBlockState(1, false));
  spawnNormal(world, 500, 500 - world.blockH / 2 - BALL_RADIUS + 2, 0);
  world.normal.vy[0] = 50;
  const now = 10;
  stepPhysics(world, DT, now);
  assert.equal(world.counters.block, 1);
  assert.equal(world.blocks.level[0], 0);
  assert.ok(Math.abs(world.blocks.respawnAt[0] - (now + RESPAWN_DELAY)) < 1e-9);
  assert.equal(world.counters.breakBonus, BLOCK_BREAK_BONUS);
});

test('golden block break also folds GOLDEN.bonus into goldenBonus', () => {
  const world = buildWorld(makeBlockState(1, true));
  spawnNormal(world, 500, 500 - world.blockH / 2 - BALL_RADIUS + 2, 0);
  world.normal.vy[0] = 50;
  stepPhysics(world, DT, 5);
  assert.equal(world.counters.breakBonus, BLOCK_BREAK_BONUS);
  assert.equal(world.counters.goldenBonus, GOLDEN.bonus);
});

test('inactive (level 0) block does not collide until it respawns', () => {
  const world = buildWorld(makeBlockState(0, false));
  world.blocks.respawnAt[0] = 100; // far in the future
  spawnNormal(world, 500, 500, 0); // dead center, would overlap if active
  world.normal.vy[0] = 50;
  stepPhysics(world, DT, 1); // now=1 < respawnAt 100
  assert.equal(world.counters.block, 0);
  assert.equal(world.blocks.level[0], 0);
});

test('respawn pass reactivates a block at full BLOCK_LEVELS once respawnAt <= now', () => {
  const world = buildWorld(makeBlockState(0, false));
  world.blocks.respawnAt[0] = 3;
  stepPhysics(world, DT, 3); // now == respawnAt
  assert.equal(world.blocks.level[0], BLOCK_LEVELS);
});

import { CLACK_COOLDOWN, PEG_RADIUS as PR } from './config.js';

test('special pool env integration: a special ball hitting a peg increments its envHits and counters.peg, but NOT goldenBonus', () => {
  const s = makeState();
  s.placed.pegs = [{ x: 500, y: 300 }];
  s.placed.blocks = [];
  const world = buildWorld(s);
  spawnSpecial(world, TYPE_BURSTER, 506, 300); // overlapping peg
  world.special.vx[0] = -10;
  stepPhysics(world, DT, 0);
  assert.equal(world.counters.peg, 1);
  assert.equal(world.special.envHits[0], 1);
  assert.equal(world.counters.goldenBonus, 0); // specials never score golden
});

test('special envHits is zeroed at the start of each step', () => {
  const world = buildWorld(makeEmptyState());
  spawnSpecial(world, TYPE_CLACKER, 500, 100);
  world.special.envHits[0] = 7;
  stepPhysics(world, DT, 0); // no colliders -> no env hits this step
  assert.equal(world.special.envHits[0], 0);
});

test('clack pass fires resolveClack for an overlapping special pair when cooldowns are clear', () => {
  const world = buildWorld(makeEmptyState());
  spawnSpecial(world, TYPE_CLACKER, 500, 100);
  spawnSpecial(world, TYPE_CLACKER, 505, 100); // dist 5 < 2*BALL_RADIUS=12 -> overlap
  let calls = 0;
  const resolveClack = (w, i, j, emit) => { calls++; };
  const emit = { credits() {}, balls() {} };
  stepPhysics(world, DT, 0, emit, resolveClack);
  assert.equal(calls, 1);
});

test('clack pass is debounced: a still-overlapping pair on cooldown does not fire again next step', () => {
  const world = buildWorld(makeEmptyState());
  world.hasFloor = false;
  spawnSpecial(world, TYPE_CLACKER, 500, 100);
  spawnSpecial(world, TYPE_CLACKER, 505, 100);
  let calls = 0;
  // resolveClack sets the cooldown (mirrors specials.resolveClack contract)
  const resolveClack = (w, i, j) => { calls++; w.special.clackCooldown[i] = CLACK_COOLDOWN; w.special.clackCooldown[j] = CLACK_COOLDOWN; };
  stepPhysics(world, DT, 0, undefined, resolveClack); // first contact fires
  // pin them in place so they stay overlapping
  world.special.x[0] = 500; world.special.y[0] = 100; world.special.vx[0] = 0; world.special.vy[0] = 0;
  world.special.x[1] = 505; world.special.y[1] = 100; world.special.vx[1] = 0; world.special.vy[1] = 0;
  stepPhysics(world, DT, DT, undefined, resolveClack); // still overlapping, on cooldown -> no fire
  assert.equal(calls, 1);
});

test('clackCooldown decays by dt each step', () => {
  const world = buildWorld(makeEmptyState());
  spawnSpecial(world, TYPE_CLACKER, 500, 100);
  world.special.clackCooldown[0] = CLACK_COOLDOWN;
  stepPhysics(world, DT, 0);
  assert.ok(Math.abs(world.special.clackCooldown[0] - (CLACK_COOLDOWN - DT)) < 1e-6, `cd ${world.special.clackCooldown[0]}`);
});

test('stepPhysics runs without a resolveClack (null) — clack bookkeeping is a no-op', () => {
  const world = buildWorld(makeEmptyState());
  spawnSpecial(world, TYPE_CLACKER, 500, 100);
  spawnSpecial(world, TYPE_CLACKER, 505, 100);
  // no emit, no resolveClack passed
  assert.doesNotThrow(() => stepPhysics(world, DT, 0));
});

import { spawnCount, rollGoldenFlag } from './physics.js';
import { MAX_SPAWNS_PER_TICK } from './config.js';

test('spawnCount accumulates and floors, returning {n, acc} with the remainder kept', () => {
  // spawnRate=60, dt=1/60 -> +1.0 per tick
  const r = spawnCount(0.5, 60, DT, 100, MAX_SPAWNS_PER_TICK);
  assert.equal(r.n, 1);          // floor(0.5 + 1.0) = 1
  assert.ok(Math.abs(r.acc - 0.5) < 1e-6); // remainder 0.5 carried
});

test('spawnCount is clamped by free slots', () => {
  const r = spawnCount(0, 6000, DT, 3, MAX_SPAWNS_PER_TICK); // acc jumps to 100, but only 3 slots
  assert.equal(r.n, 3);
  // acc reduced by the number actually spawned (3), not the floored 100
  assert.ok(Math.abs(r.acc - (100 - 3)) < 1e-3, `acc ${r.acc}`);
});

test('spawnCount is clamped by MAX_SPAWNS_PER_TICK', () => {
  const r = spawnCount(0, 6000, DT, 10000, MAX_SPAWNS_PER_TICK);
  assert.equal(r.n, MAX_SPAWNS_PER_TICK);
  assert.ok(Math.abs(r.acc - (100 - MAX_SPAWNS_PER_TICK)) < 1e-3);
});

test('spawnCount with no whole ball accrued returns n:0 and keeps acc', () => {
  const r = spawnCount(0.2, 6, DT, 100, MAX_SPAWNS_PER_TICK); // +0.1 -> 0.3
  assert.equal(r.n, 0);
  assert.ok(Math.abs(r.acc - 0.3) < 1e-6);
});

test('rollGoldenFlag returns FLAG_GOLDEN when rng < goldenChance, else 0', () => {
  assert.equal(rollGoldenFlag(0.5, () => 0.1), FLAG_GOLDEN);
  assert.equal(rollGoldenFlag(0.5, () => 0.9), 0);
  assert.equal(rollGoldenFlag(0, () => 0.0), 0); // 0 is not < 0
});

test('buildWorld seeds world.surfaceBase as a fresh copy of SURFACE_BASE', () => {
  const world = buildWorld(makeState());
  assert.deepEqual(world.surfaceBase, { wall: 1, peg: 2, block: 25 });
  // mutating the world copy must not touch the shared config constant
  world.surfaceBase.peg = 99;
  assert.equal(SURFACE_BASE.peg, 2);
});

test('resolveCircleSegment: misses when the ball is farther than br+segR from the segment', () => {
  const r = resolveCircleSegment(50, 50, 0, 100, 6, 0, 100, 100, 100, 4, 0.92, 1100);
  assert.equal(r.hit, false);
  assert.equal(r.x, 50);
  assert.equal(r.vy, 100);
});

test('resolveCircleSegment: a ball falling onto a horizontal segment bounces up with restitution', () => {
  // segment y=100 from x=0..100; ball at (50,92) sum=br+segR=10, dist=8 -> hit
  const r = resolveCircleSegment(50, 92, 0, 100, 6, 0, 100, 100, 100, 4, 0.92, 1100);
  assert.equal(r.hit, true);
  assert.ok(r.y < 92, 'depenetrated upward (out of the segment)');
  assert.ok(Math.abs(r.vy - (100 - 1.92 * 100)) < 1e-4, `vy=${r.vy}`); // = -92
  assert.equal(r.vx, 0);
});

test('resolveCircleSegment: a tilted segment deflects a falling ball sideways', () => {
  // 45-degree segment from (0,0) to (100,100); ball just above-right of the midpoint
  const r = resolveCircleSegment(54, 46, 0, 100, 6, 0, 0, 100, 100, 4, 0.92, 1100);
  assert.equal(r.hit, true);
  assert.ok(r.vx > 0, 'gained rightward velocity off the slope');
});

test('resolveCircleSegment: clamps the outgoing speed to maxSpeed', () => {
  const r = resolveCircleSegment(50, 92, 0, 5000, 6, 0, 100, 100, 100, 4, 0.92, 1100);
  assert.ok(Math.hypot(r.vx, r.vy) <= 1100 + 1e-3);
});

import { rampLayout } from './physics.js';

test('rampLayout: level 0 -> no ramps; level 1 -> 2; level 2 -> 4', () => {
  assert.equal(rampLayout(0, 30, 1000, 1500).length, 0);
  assert.equal(rampLayout(1, 30, 1000, 1500).length, 2);
  assert.equal(rampLayout(2, 30, 1000, 1500).length, 4);
});

test('rampLayout: each pair is mirror-symmetric about W/2', () => {
  const [left, right] = rampLayout(1, 30, 1000, 1500);
  assert.ok(Math.abs((left.x1 + right.x1) - 1000) < 1e-4);
  assert.ok(Math.abs((left.x2 + right.x2) - 1000) < 1e-4);
  assert.ok(Math.abs(left.y1 - right.y1) < 1e-9);
  assert.ok(Math.abs(left.y2 - right.y2) < 1e-9);
});

test('rampLayout: angle 0 yields horizontal ramps (y1 == y2)', () => {
  const [left] = rampLayout(1, 0, 1000, 1500);
  assert.ok(Math.abs(left.y1 - left.y2) < 1e-9);
});

import { rebuildRamps } from './physics.js';
import { RAMP_ANGLE, RAMP_THICKNESS } from './config.js';

test('buildWorld seeds an empty ramps SoA + level 0 + default angle', () => {
  const world = buildWorld(makeState());
  assert.equal(world.ramps.count, 0);
  assert.ok(world.ramps.x1s instanceof Float32Array);
  assert.equal(world.rampsLevel, 0);
  assert.equal(world.rampAngle, RAMP_ANGLE);
  assert.equal(world.ramps.r, RAMP_THICKNESS);
});

test('rebuildRamps fills world.ramps from rampsLevel + rampAngle', () => {
  const world = buildWorld(makeState());
  world.rampsLevel = 2;
  rebuildRamps(world);
  assert.equal(world.ramps.count, 4);
  // matches the pure layout
  const segs = rampLayout(2, world.rampAngle, world.W, world.H);
  assert.ok(Math.abs(world.ramps.x1s[0] - segs[0].x1) < 1e-4);
  assert.ok(Math.abs(world.ramps.y2s[3] - segs[3].y2) < 1e-4);
});

test('rebuildColliders also rebuilds ramps from the current level', () => {
  const world = buildWorld(makeState());
  world.rampsLevel = 1;
  rebuildColliders(world);
  assert.equal(world.ramps.count, 2);
});

test('a ball falling onto a ramp segment bounces (counts as a wall hit) and does not pass through', () => {
  const world = buildWorld(makeEmptyState());
  world.hasFloor = false;
  // one horizontal ramp segment under the ball
  world.ramps.x1s = new Float32Array([400]); world.ramps.y1s = new Float32Array([900]);
  world.ramps.x2s = new Float32Array([600]); world.ramps.y2s = new Float32Array([900]);
  world.ramps.count = 1; world.ramps.r = 4;
  spawnNormal(world, 500, 880, 0);
  world.normal.vy[0] = 50;
  let hit = false;
  for (let k = 0; k < 120 && world.normal.count > 0; k++) {
    stepPhysics(world, DT, k * DT);
    if (world.counters.wall > 0) { hit = true; break; }
  }
  assert.ok(hit, 'ball never registered a ramp (wall) contact');
});

test('RAMP DRAIN: a ball dropped onto a ramp pair drains within a bounded number of steps', () => {
  // Regression: ramps use E_WALL (<1) and inject NO kick, so energy strictly
  // decays and a ball cannot oscillate forever — it slides off into the open
  // center/sides and leaks. (Replaces the old PADDLE DRAIN regression.)
  const world = buildWorld(makeEmptyState());
  world.hasFloor = false;
  world.rampsLevel = 1;
  rebuildRamps(world);
  // drop onto the left ramp's center
  spawnNormal(world, world.W * 0.27, world.H - 200, 0);
  let steps = 0;
  const LIMIT = 6000;
  while (world.normal.count > 0 && steps < LIMIT) {
    stepPhysics(world, DT, steps * DT);
    steps++;
  }
  assert.equal(world.normal.count, 0, `ball never drained off the ramps in ${steps} steps`);
  assert.ok(steps < LIMIT, 'ramp bounce trap: ball never drained');
});

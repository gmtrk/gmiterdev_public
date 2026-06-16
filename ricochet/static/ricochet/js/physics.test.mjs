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
  // velocity (1000, 0) has speed 1000 > MAX_SPEED (378)
  const r = clampSpeed(1000, 0, MAX_SPEED);
  const sp = Math.hypot(r.vx, r.vy);
  assert.ok(Math.abs(sp - MAX_SPEED) < 1e-3, `speed was ${sp}`);
  assert.ok(r.vx > 0 && Math.abs(r.vy) < 1e-6);
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

import { resolveCircleCircle, resolveCircleAABB } from './physics.js';
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

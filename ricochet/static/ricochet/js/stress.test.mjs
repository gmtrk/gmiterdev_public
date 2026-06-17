import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildWorld, spawnNormal, stepPhysics } from './physics.js';
import { adaptCeiling } from './gameloop.js';
import { defaultSave, migrate } from './save.js';
import {
  DT, FRAME_BUDGET_MS, CEILING_DESKTOP, RESERVED_OWNED,
  ARENA_W, SPAWN_MARGIN, SPAWN_Y,
} from './config.js';

function freshWorld() {
  const state = migrate(defaultSave());
  return buildWorld(state);
}

function fillNormals(world, n) {
  // ensure there is room; spawnNormal is a no-op past the ceiling
  for (let k = 0; k < n; k++) {
    const x = SPAWN_MARGIN + Math.random() * (ARENA_W - 2 * SPAWN_MARGIN);
    spawnNormal(world, x, SPAWN_Y, 0);
  }
}

test('stress harness: spawn N normals and run fixed steps without throwing', () => {
  const world = freshWorld();
  const N = 1500;
  fillNormals(world, N);
  assert.ok(world.normal.count > 0, 'expected balls to be spawned');
  assert.ok(world.normal.count <= world.ceiling, 'count must respect ceiling');

  const STEPS = 120;          // 2 simulated seconds at dt=1/60
  let now = 0;
  let worst = 0;
  let total = 0;
  for (let s = 0; s < STEPS; s++) {
    const t0 = performance.now();
    stepPhysics(world, DT, now);
    const t1 = performance.now();
    const ms = t1 - t0;
    worst = Math.max(worst, ms);
    total += ms;
    now += DT;
  }
  const avg = total / STEPS;
  // Report only — timing is machine-dependent, NOT a hard gate.
  console.log(`stress: N=${N} steps=${STEPS} avg=${avg.toFixed(3)}ms worst=${worst.toFixed(3)}ms budget=${FRAME_BUDGET_MS}ms`);
  // Behavioral asserts that DO hold everywhere:
  assert.ok(Number.isFinite(avg), 'avg step time must be finite');
  assert.ok(world.normal.count >= 0 && world.normal.count <= world.ceiling, 'count stays in bounds after stepping');
});

// adaptCeiling's Phase 4 signature is positional:
//   adaptCeiling(ceiling, frameMs, budgetMs, min, max)
// We pass RESERVED_OWNED as the floor so the reducer never starves owned spawns,
// and CEILING_DESKTOP as the design ceiling. We do NOT modify adaptCeiling.
test('pure adaptive reducer LOWERS the ceiling when a frame blows FRAME_BUDGET_MS', () => {
  const before = CEILING_DESKTOP;
  const overBudgetMs = FRAME_BUDGET_MS * 2.5;
  const after = adaptCeiling(before, overBudgetMs, FRAME_BUDGET_MS, RESERVED_OWNED, CEILING_DESKTOP);
  assert.ok(after < before, `expected ceiling to drop from ${before}, got ${after}`);
  assert.ok(after >= RESERVED_OWNED, 'reducer must not starve owned spawns below RESERVED_OWNED');
});

test('pure adaptive reducer does NOT lower the ceiling when under budget', () => {
  const before = CEILING_DESKTOP;
  const underBudgetMs = FRAME_BUDGET_MS * 0.5;
  const after = adaptCeiling(before, underBudgetMs, FRAME_BUDGET_MS, RESERVED_OWNED, CEILING_DESKTOP);
  assert.ok(after >= before, `under budget should not lower ceiling: ${before} -> ${after}`);
});

test('repeated over-budget frames monotonically drive the ceiling down toward the reserved floor', () => {
  let c = CEILING_DESKTOP;
  const overBudgetMs = FRAME_BUDGET_MS * 3;
  let prev = c;
  for (let i = 0; i < 50; i++) {
    c = adaptCeiling(c, overBudgetMs, FRAME_BUDGET_MS, RESERVED_OWNED, CEILING_DESKTOP);
    assert.ok(c <= prev, `ceiling must be non-increasing under sustained pressure: ${prev} -> ${c}`);
    assert.ok(c >= RESERVED_OWNED, 'never below RESERVED_OWNED');
    prev = c;
  }
});

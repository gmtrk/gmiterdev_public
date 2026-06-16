import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tickClackCooldowns,
  resolveClack,
  chargeBurster,
  tryBurst,
  CLACKER_CLACK_CREDITS,
} from './specials.js';
import { buildWorld, spawnSpecial, CLACKER, SPLITTER, BURSTER } from './physics.js';
import { defaultSave } from './save.js';
import {
  CLACK_COOLDOWN,
  DT,
  BURSTER as BURSTER_CFG,
} from './config.js';

// Build a fresh, real world from the default save (REAL buildWorld/spawnSpecial).
function freshWorld() {
  return buildWorld(defaultSave());
}

test('tickClackCooldowns decrements each live special toward zero and clamps at 0', () => {
  const w = freshWorld();
  spawnSpecial(w, CLACKER, 500, 50);
  spawnSpecial(w, CLACKER, 520, 50);
  const sp = w.special;
  sp.clackCooldown[0] = CLACK_COOLDOWN; // 0.2
  sp.clackCooldown[1] = 0.05;
  tickClackCooldowns(sp, DT); // dt ~0.0167
  assert.ok(Math.abs(sp.clackCooldown[0] - (CLACK_COOLDOWN - DT)) < 1e-6);
  assert.ok(Math.abs(sp.clackCooldown[1] - (0.05 - DT)) < 1e-6);
  // A big tick drives both below zero -> clamps to 0, never negative.
  tickClackCooldowns(sp, 1);
  assert.equal(sp.clackCooldown[0], 0);
  assert.equal(sp.clackCooldown[1], 0);
});

// Spy emit implementing the canonical { credits(n), balls(count, x, y) } shape.
function spyEmit() {
  const calls = { credits: 0, balls: [] };
  return {
    credits: (n) => { calls.credits += n; },
    balls: (count, x, y) => { calls.balls.push({ count, x, y }); },
    _calls: calls,
  };
}

test('resolveClack is gated: no fire while either special is on cooldown', () => {
  const w = freshWorld();
  spawnSpecial(w, CLACKER, 100, 100);
  spawnSpecial(w, CLACKER, 110, 100);
  const sp = w.special;
  sp.clackCooldown[1] = 0.1; // j still cooling down
  const emit = spyEmit();
  const fired = resolveClack(w, 0, 1, emit);
  assert.equal(fired, false);
  assert.equal(emit._calls.credits, 0);
  assert.equal(sp.clackCooldown[0], 0); // untouched because the clack did not fire
});

test('Clacker clack emits credits and sets CLACK_COOLDOWN on BOTH specials', () => {
  const w = freshWorld();
  spawnSpecial(w, CLACKER, 100, 100);
  spawnSpecial(w, CLACKER, 110, 100);
  const sp = w.special;
  const emit = spyEmit();
  const fired = resolveClack(w, 0, 1, emit);
  assert.equal(fired, true);
  assert.equal(emit._calls.credits, 2 * CLACKER_CLACK_CREDITS); // both ends are Clackers
  // clackCooldown is a Float32Array, so compare against the float32-rounded value.
  assert.equal(sp.clackCooldown[0], Math.fround(CLACK_COOLDOWN));
  assert.equal(sp.clackCooldown[1], Math.fround(CLACK_COOLDOWN));
});

test('Splitter clack emits one balls() call of 1-2 cap-exempt balls at the contact midpoint', () => {
  const w = freshWorld();
  spawnSpecial(w, SPLITTER, 100, 200);
  spawnSpecial(w, SPLITTER, 140, 260);
  const emit = spyEmit();
  const fired = resolveClack(w, 0, 1, emit);
  assert.equal(fired, true);
  assert.equal(emit._calls.balls.length, 1, 'exactly one balls() emit');
  const b = emit._calls.balls[0];
  assert.ok(b.count >= 1 && b.count <= 2, `count was ${b.count}`);
  assert.equal(b.x, 120, 'spawned at midpoint x');
  assert.equal(b.y, 230, 'spawned at midpoint y');
  assert.equal(emit._calls.credits, 0, 'Splitter pays no direct credits');
});

test('Burster clack adds chargePerClack toward the threshold (no burst yet)', () => {
  const w = freshWorld();
  spawnSpecial(w, BURSTER, 100, 100);
  spawnSpecial(w, BURSTER, 110, 100);
  const sp = w.special;
  const emit = spyEmit();
  const fired = resolveClack(w, 0, 1, emit);
  assert.equal(fired, true);
  assert.equal(sp.charge[0], BURSTER_CFG.chargePerClack);
  assert.equal(sp.charge[1], BURSTER_CFG.chargePerClack);
  assert.equal(emit._calls.balls.length, 0, 'clack alone does not burst below threshold');
});

test('mixed-type clack applies each special power independently (Clacker+Burster)', () => {
  const w = freshWorld();
  spawnSpecial(w, CLACKER, 100, 100);
  spawnSpecial(w, BURSTER, 110, 100);
  const sp = w.special;
  const emit = spyEmit();
  resolveClack(w, 0, 1, emit);
  assert.equal(emit._calls.credits, CLACKER_CLACK_CREDITS, 'only the Clacker end pays credits');
  assert.equal(sp.charge[1], BURSTER_CFG.chargePerClack, 'only the Burster end charges');
});

test('a sustained overlap fires at most once per CLACK_COOLDOWN when stepped by dt', () => {
  const w = freshWorld();
  spawnSpecial(w, CLACKER, 500, 50);
  spawnSpecial(w, CLACKER, 502, 50); // overlapping and held in contact for the test
  const sp = w.special;
  const emit = spyEmit();
  let clacks = 0;
  // Simulate the per-step pass: tick cooldowns, then attempt one clack on the
  // still-overlapping pair. Run for exactly one CLACK_COOLDOWN window.
  const stepsPerWindow = Math.round(CLACK_COOLDOWN / DT);
  for (let k = 0; k < stepsPerWindow; k++) {
    tickClackCooldowns(sp, DT);
    if (resolveClack(w, 0, 1, emit)) clacks++;
  }
  assert.equal(clacks, 1, 'exactly one clack across one cooldown window');
  // Run a second, full window: the cooldown elapses, so exactly one more fires.
  for (let k = 0; k < stepsPerWindow; k++) {
    tickClackCooldowns(sp, DT);
    if (resolveClack(w, 0, 1, emit)) clacks++;
  }
  assert.equal(clacks, 2, 'a second clack fires only after the cooldown elapses');
  assert.equal(emit._calls.credits, 2 * (2 * CLACKER_CLACK_CREDITS), 'two clacks total, both Clacker ends each window');
});

test('chargeBurster only accumulates on a BURSTER, ignores other types', () => {
  const w = freshWorld();
  spawnSpecial(w, BURSTER, 100, 100);
  spawnSpecial(w, CLACKER, 200, 100);
  const sp = w.special;
  chargeBurster(sp, 0, BURSTER_CFG.chargePerBounce);
  chargeBurster(sp, 1, BURSTER_CFG.chargePerBounce); // no-op: not a Burster
  assert.equal(sp.charge[0], BURSTER_CFG.chargePerBounce);
  assert.equal(sp.charge[1], 0);
});

test('chargeBurster charges by envHits * chargePerBounce (the stepPhysics contract)', () => {
  const w = freshWorld();
  spawnSpecial(w, BURSTER, 100, 100);
  const sp = w.special;
  sp.envHits[0] = 3; // three environmental contacts resolved this step
  chargeBurster(sp, 0, sp.envHits[0] * BURSTER_CFG.chargePerBounce);
  assert.equal(sp.charge[0], 3 * BURSTER_CFG.chargePerBounce);
});

test('tryBurst below threshold does nothing', () => {
  const w = freshWorld();
  spawnSpecial(w, BURSTER, 300, 400);
  const sp = w.special;
  sp.charge[0] = BURSTER_CFG.threshold - 1;
  const emit = spyEmit();
  const burst = tryBurst(w, 0, emit);
  assert.equal(burst, false);
  assert.equal(emit._calls.balls.length, 0);
  assert.equal(sp.charge[0], BURSTER_CFG.threshold - 1, 'charge preserved');
});

test('tryBurst at/above threshold emits ballsPerBurst at the Burster position and resets charge', () => {
  const w = freshWorld();
  spawnSpecial(w, BURSTER, 300, 400);
  const sp = w.special;
  sp.charge[0] = BURSTER_CFG.threshold + 7; // overshoot still bursts
  const emit = spyEmit();
  const burst = tryBurst(w, 0, emit);
  assert.equal(burst, true);
  assert.equal(emit._calls.balls.length, 1);
  assert.deepEqual(emit._calls.balls[0], {
    count: BURSTER_CFG.ballsPerBurst, x: 300, y: 400,
  });
  assert.equal(sp.charge[0], 0, 'charge resets to 0 after a burst');
});

test('tryBurst is a no-op on non-Burster types', () => {
  const w = freshWorld();
  spawnSpecial(w, CLACKER, 300, 400);
  const sp = w.special;
  sp.charge[0] = BURSTER_CFG.threshold + 100; // even with charge, a Clacker never bursts
  const emit = spyEmit();
  assert.equal(tryBurst(w, 0, emit), false);
  assert.equal(emit._calls.balls.length, 0);
});

test('accumulating env bounces then a clack crosses the threshold and bursts', () => {
  const w = freshWorld();
  spawnSpecial(w, BURSTER, 10, 10);
  spawnSpecial(w, BURSTER, 12, 10);
  const sp = w.special;
  const emit = spyEmit();
  // Drive charge[0] up via env bounces until adding one more would exceed threshold.
  let bounces = 0;
  while (sp.charge[0] + BURSTER_CFG.chargePerBounce < BURSTER_CFG.threshold) {
    chargeBurster(sp, 0, BURSTER_CFG.chargePerBounce);
    bounces++;
  }
  assert.ok(bounces > 0);
  assert.equal(tryBurst(w, 0, emit), false, 'not yet at threshold');
  // A single clack pushes both Bursters by chargePerClack -> over threshold.
  resolveClack(w, 0, 1, emit);
  assert.ok(sp.charge[0] >= BURSTER_CFG.threshold);
  assert.equal(tryBurst(w, 0, emit), true);
  const last = emit._calls.balls[emit._calls.balls.length - 1];
  assert.equal(last.count, BURSTER_CFG.ballsPerBurst);
});

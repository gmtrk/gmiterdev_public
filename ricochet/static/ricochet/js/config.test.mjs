import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from './config.js';
import { substepCount } from './physics.js';

test('timestep + frame-budget scalars match the contract', () => {
  assert.equal(C.DT, 1 / 60);
  assert.equal(C.MAX_SUBSTEPS, 2);
  assert.equal(C.FRAME_BUDGET_MS, 8);
});

test('arena + spawn scalars match the contract', () => {
  assert.equal(C.ARENA_W, 1000);
  assert.equal(C.ARENA_H, 1500);
  assert.equal(C.SPAWN_MARGIN, 40);
  assert.equal(C.SPAWN_Y, 30);
  assert.equal(C.MAX_SPAWNS_PER_TICK, 8);
});

test('cap + grid scalars match the contract', () => {
  assert.equal(C.CEILING_DESKTOP, 5000);
  assert.equal(C.RESERVED_OWNED, 200);
  assert.equal(C.SPECIAL_CAP, 96);
  assert.equal(C.GRID_CELL, 50);
});

test('physics scalars match the contract', () => {
  assert.equal(C.GRAVITY, 1700);
  assert.equal(C.DRAG, 1.0);
  assert.equal(C.E_WALL, 0.92);
  assert.equal(C.E_COLLIDER, 0.9);
  assert.equal(C.PEG_RADIUS, 7);
  assert.equal(C.BALL_RADIUS, 6);
  assert.equal(C.KICK, 60);
});

test('MAX_SPEED honors the tunneling invariant PER SUB-STEP (substepCount)', () => {
  // The single-step bound MAX_SPEED*DT < PEG_RADIUS no longer holds (the cap is
  // high for feel); stepPhysics sub-steps the move so each SLICE stays under a
  // peg radius. Verify the sub-stepped displacement honors the invariant.
  const n = substepCount(C.MAX_SPEED, C.DT);
  assert.ok(n >= 1, 'at least one sub-step');
  assert.ok((C.MAX_SPEED * C.DT) / n < C.PEG_RADIUS, 'per-sub-step displacement must stay under PEG_RADIUS');
});

test('block scalars match the contract', () => {
  assert.equal(C.BLOCK_W, 64);
  assert.equal(C.BLOCK_H, 28);
  assert.equal(C.BLOCK_LEVELS, 9);
  assert.equal(C.RESPAWN_DELAY, 4);
  assert.equal(C.BLOCK_BREAK_BONUS, 8);
});

test('SURFACE_BASE has wall/peg/block base values', () => {
  assert.deepEqual(C.SURFACE_BASE, { wall: 1, peg: 5, block: 25 });
});

test('event + combo + golden + clack scalars match the contract', () => {
  assert.equal(C.EVENT_CAP, 29);
  assert.deepEqual(C.COMBO, { gainPerSec: 6, decayPerSec: 3, capBonusStart: 9, perStepGainCap: 0.3 });
  assert.deepEqual(C.GOLDEN, { chance: 0.005, bonus: 12 });
  assert.equal(C.CLACK_COOLDOWN, 0.2);
});

test('burster + offline + prestige scalars match the contract', () => {
  assert.deepEqual(C.BURSTER, { chargePerBounce: 1, chargePerClack: 5, threshold: 60, ballsPerBurst: 6 });
  assert.deepEqual(C.OFFLINE, { efficiencyBase: 0.30, capSeconds: 8 * 3600, emaHalfLifeSec: 300 });
  assert.deepEqual(C.PRESTIGE, { coreScale: 1e9, coreK: 1, minCredits: 1e9 });
});

test('cold-open + base-capacity scalars match the contract', () => {
  assert.equal(C.STARTING_CREDITS, 25);
  assert.equal(C.BASE_CAPACITY, 1);
});

test('cold-open placement budgets are minimal (buy-to-grow)', () => {
  assert.equal(C.PEG_BUDGET_BASE, 2);   // two starter pegs
  assert.equal(C.BLOCK_BUDGET_BASE, 0); // no blocks until bought
});

test('feel-tuning scalars are present and sane', () => {
  assert.ok(C.SPAWN_RATE_BASE > 0, 'spawn rate base positive');
  assert.ok(C.E_BLOCK > 0 && C.E_BLOCK <= 1.5, 'block restitution sane');
  assert.ok(C.BLOCK_KICK >= 0, 'block kick non-negative');
  assert.ok(C.BOUNCE_JITTER >= 0, 'jitter angle non-negative');
  assert.ok(C.BOUNCE_JITTER_CHANCE >= 0 && C.BOUNCE_JITTER_CHANCE <= 1, 'jitter chance is a probability');
});

test('PALETTE has the contract keys + values', () => {
  assert.equal(C.PALETTE.bg, '#0a0a16');
  assert.equal(C.PALETTE.ballCyan, '#22e0ff');
  assert.equal(C.PALETTE.ballYellow, '#fff14a');
  assert.equal(C.PALETTE.peg, '#ff3df0');
  assert.equal(C.PALETTE.clacker, '#22e0ff');
  assert.equal(C.PALETTE.splitter, '#ff3df0');
  assert.equal(C.PALETTE.burster, '#ffb347');
});

test('UPGRADES is a non-empty array of well-formed, unique-id defs', () => {
  assert.ok(Array.isArray(C.UPGRADES));
  assert.ok(C.UPGRADES.length > 0);
  const ids = new Set();
  for (const u of C.UPGRADES) {
    assert.equal(typeof u.id, 'string');
    assert.equal(typeof u.label, 'string');
    assert.equal(typeof u.group, 'string');
    assert.equal(typeof u.baseCost, 'number');
    assert.equal(typeof u.costGrowth, 'number');
    assert.ok(u.effectKind === 'add' || u.effectKind === 'mul', `bad effectKind on ${u.id}`);
    assert.equal(typeof u.effectStep, 'number');
    assert.ok(!ids.has(u.id), `duplicate UPGRADES id ${u.id}`);
    ids.add(u.id);
  }
});

test('UPGRADES has the headline globalValueMult + ballCapacity defs the economy depends on', () => {
  const gvm = C.UPGRADES.find((u) => u.id === 'globalValueMult');
  assert.ok(gvm, 'missing globalValueMult upgrade');
  assert.equal(gvm.effectKind, 'add');
  assert.equal(gvm.effectStep, 0.25);
  assert.equal(gvm.baseCost, 50);
  assert.equal(gvm.costGrowth, 1.18);

  const cap = C.UPGRADES.find((u) => u.id === 'ballCapacity');
  assert.ok(cap, 'missing ballCapacity upgrade');
  assert.equal(cap.effectKind, 'add');
  assert.equal(cap.effectStep, 1);
  assert.equal(cap.costGrowth, 1.30);
});

test('UPGRADES includes the budget/paddle/kick/spawn levers the deriver reads', () => {
  for (const id of ['goldenChance', 'pegBudget', 'blockBudget', 'paddleWidth', 'pegKick', 'spawnRate']) {
    assert.ok(C.UPGRADES.find((u) => u.id === id), `missing ${id}`);
  }
});

test('CORES_UPGRADES is a non-empty array of well-formed, unique-id defs', () => {
  assert.ok(Array.isArray(C.CORES_UPGRADES));
  assert.ok(C.CORES_UPGRADES.length > 0);
  const ids = new Set();
  const groups = new Set(['power', 'headstart', 'unlocks', 'offline']);
  for (const u of C.CORES_UPGRADES) {
    assert.equal(typeof u.id, 'string');
    assert.equal(typeof u.label, 'string');
    assert.ok(groups.has(u.group), `bad group on ${u.id}`);
    assert.equal(typeof u.baseCost, 'number');
    assert.equal(typeof u.costGrowth, 'number');
    assert.ok(u.effectKind === 'add' || u.effectKind === 'mul', `bad effectKind on ${u.id}`);
    assert.equal(typeof u.effectStep, 'number');
    assert.ok(!ids.has(u.id), `duplicate CORES_UPGRADES id ${u.id}`);
    ids.add(u.id);
  }
});

test('CORES_UPGRADES includes a permanent global mult + head-start + offline def', () => {
  assert.ok(C.CORES_UPGRADES.find((u) => u.id === 'globalValueMult' && u.group === 'power'), 'missing permanent global mult');
  assert.ok(C.CORES_UPGRADES.find((u) => u.id === 'startCreditsMult'), 'missing startCreditsMult');
  assert.ok(C.CORES_UPGRADES.find((u) => u.id === 'offlineEfficiencyAdd'), 'missing offlineEfficiencyAdd');
});

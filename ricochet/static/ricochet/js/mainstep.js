import { spawnNormal, FLAG_GOLDEN } from './physics.js';
import { SPAWN_MARGIN, SPAWN_Y, MAX_SPAWNS_PER_TICK } from './config.js';

// Spawn-accumulator tick. Rolls golden per ball and ORs in FLAG_GOLDEN.
// spawnFn defaults to the real spawnNormal; injectable for tests.
export function spawnTick(world, dt, spawnRate, rng = Math.random, spawnFn = spawnNormal) {
  world._spawnAcc = (world._spawnAcc || 0) + spawnRate * dt;
  const freeSlots = world.ceiling - world.normal.count;
  let n = Math.floor(world._spawnAcc);
  if (n > freeSlots) n = freeSlots;
  if (n > MAX_SPAWNS_PER_TICK) n = MAX_SPAWNS_PER_TICK;
  if (n < 0) n = 0;
  const band = world.W - 2 * SPAWN_MARGIN;
  for (let i = 0; i < n; i++) {
    const x = SPAWN_MARGIN + rng() * band;
    let flags = 0;
    if (rng() < world.goldenChance) flags |= FLAG_GOLDEN;
    spawnFn(world, x, SPAWN_Y, flags);
  }
  world._spawnAcc -= n; // consume only what we spawned (leftover carries)
  return n;
}

// HUD adapter — EXACT contract shape (NOT world itself).
export function buildHudAdapter(state, world, run) {
  return {
    credits: state.credits,
    creditsPerSec: run.creditsPerSec,
    cores: state.cores,
    ballCount: world.normal.count,
    capacity: world.baseCapacity,
    comboBonus: run.comboBonus,
    comboCapBonus: run.comboCapBonus,
    ceiling: world.ceiling,
  };
}

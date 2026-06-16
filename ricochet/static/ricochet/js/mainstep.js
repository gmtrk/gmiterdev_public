import { spawnNormal, spawnCount, rollGoldenFlag } from './physics.js';
import { SPAWN_MARGIN, SPAWN_Y, MAX_SPAWNS_PER_TICK } from './config.js';

// Spawn-accumulator tick. Uses the tested physics.spawnCount (accumulate/floor/
// clamp) and physics.rollGoldenFlag (golden roll) so there is ONE implementation
// of each rule. spawnFn defaults to the real spawnNormal; injectable for tests.
export function spawnTick(world, dt, spawnRate, rng = Math.random, spawnFn = spawnNormal) {
  const freeSlots = world.ceiling - world.normal.count;
  const { n, acc } = spawnCount(world._spawnAcc || 0, spawnRate, dt, freeSlots, MAX_SPAWNS_PER_TICK);
  world._spawnAcc = acc; // leftover carries
  const band = world.W - 2 * SPAWN_MARGIN;
  for (let i = 0; i < n; i++) {
    const x = SPAWN_MARGIN + rng() * band;
    const flags = rollGoldenFlag(world.goldenChance, rng);
    spawnFn(world, x, SPAWN_Y, flags);
  }
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

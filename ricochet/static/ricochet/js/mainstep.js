import { spawnNormal, spawnCount, rollGoldenFlag, FLAG_CAP_EXEMPT } from './physics.js';
import { SPAWN_MARGIN, SPAWN_Y, MAX_SPAWNS_PER_TICK, PEG_RADIUS, BALL_RADIUS } from './config.js';

// Aim-assist: nudge a top-spawn x onto a near-miss peg column so a straight
// drop actually lands on the peg. A ball already hits a peg when
// |x - pegX| <= hitRadius (= PEG_RADIUS + BALL_RADIUS). Only act in the
// near-miss band (hitRadius, hitRadius + helperDist]; snap to JUST INSIDE the
// hit zone on the side the ball came from (~11px off-center, not dead-center,
// so it glances off rather than pogo-ing on a peg with kick). Pure + tested.
export function snapSpawnX(x, pegXs, pegCount, hitRadius, helperDist, margin, W) {
  if (!pegXs || pegCount <= 0 || helperDist <= 0) return x;
  let bestI = -1;
  let bestD = Infinity;
  for (let i = 0; i < pegCount; i++) {
    const d = Math.abs(x - pegXs[i]);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  if (bestI < 0 || bestD <= hitRadius || bestD > hitRadius + helperDist) return x;
  const pegX = pegXs[bestI];
  const side = Math.sign(x - pegX) || 1;
  let snapped = pegX + side * (hitRadius * 0.85);
  if (snapped < margin) snapped = margin;
  else if (snapped > W - margin) snapped = W - margin;
  return snapped;
}

// Count cap-bound (timer-spawned) normal balls. Power-spawned balls carry
// FLAG_CAP_EXEMPT and live in reserved headroom above the capacity, so they do
// NOT consume capacity slots (spec: power balls are "not tied to the cap").
// Worlds without a flags array (minimal/test worlds) count every ball as bound.
function capBoundCount(world) {
  const p = world.normal;
  const f = p.flags;
  if (!f) return p.count;
  let n = 0;
  for (let i = 0; i < p.count; i++) {
    if ((f[i] & FLAG_CAP_EXEMPT) === 0) n++;
  }
  return n;
}

// Spawn-accumulator tick. Uses the tested physics.spawnCount (accumulate/floor/
// clamp) and physics.rollGoldenFlag (golden roll) so there is ONE implementation
// of each rule. spawnFn defaults to the real spawnNormal; injectable for tests.
// The timer fills up to the player's slot CAPACITY (baseCapacity), NOT the engine
// ceiling — capacity is the gameplay knob ("start with one ball; buy more slots").
// The ceiling (flyweight hard cap) only bounds it when capacity is unset.
export function spawnTick(world, dt, spawnRate, rng = Math.random, spawnFn = spawnNormal) {
  const cap = world.baseCapacity != null
    ? Math.min(world.baseCapacity, world.ceiling)
    : world.ceiling;
  const freeSlots = Math.max(0, cap - capBoundCount(world));
  const { n, acc } = spawnCount(world._spawnAcc || 0, spawnRate, dt, freeSlots, MAX_SPAWNS_PER_TICK);
  // Carry the leftover, but never bank more than the slots still open: at capacity
  // (no free slots) this resets to 0, so a freed slot waits a full 1/rate interval
  // before refilling (the deliberate ~0.3s respawn cadence) instead of refilling
  // instantly from a banked reserve.
  const remaining = freeSlots - n;
  world._spawnAcc = remaining > 0 ? Math.min(acc, remaining) : 0;
  const band = world.W - 2 * SPAWN_MARGIN;
  const helperDist = world.spawnHelperDist || 0;
  const pegs = world.pegs;
  const hitR = PEG_RADIUS + BALL_RADIUS;
  for (let i = 0; i < n; i++) {
    let x = SPAWN_MARGIN + rng() * band;
    if (helperDist > 0 && pegs && pegs.count > 0) {
      x = snapSpawnX(x, pegs.xs, pegs.count, hitR, helperDist, SPAWN_MARGIN, world.W);
    }
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

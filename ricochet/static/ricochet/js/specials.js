// specials.js — special-ball pool powers (Clacker / Splitter / Burster).
// Pure logic, unit-tested with `node --test`. No per-step allocations.
// stepPhysics (physics.js) integrates the special pool against the environment
// and runs the special-vs-special clack pass; THIS module supplies the powers
// those passes call (resolveClack / chargeBurster / tryBurst) plus the spawn
// planning + unlock helpers wired into main.js.
import { spawnNormal, CLACKER, SPLITTER, BURSTER, FLAG_CAP_EXEMPT } from './physics.js';
import {
  CLACK_COOLDOWN,
  RESERVED_OWNED,
  CEILING_DESKTOP,
  SPECIAL_CAP,
  BURSTER as BURSTER_CFG,
} from './config.js';

// Decrement every live special's clack cooldown toward 0, clamped at 0.
export function tickClackCooldowns(special, dt) {
  const cd = special.clackCooldown;
  for (let i = 0; i < special.count; i++) {
    const v = cd[i] - dt;
    cd[i] = v > 0 ? v : 0;
  }
}

// Per-clack Clacker credit yield. main.js may scale the accrued total via the
// emit.credits accounting; the base unit lives here.
export const CLACKER_CLACK_CREDITS = 250;
// Splitter emits 1 or 2 cap-exempt NORMAL balls per clack.
export const SPLITTER_MIN = 1, SPLITTER_MAX = 2;

// Apply ONE special end's per-end clack power: Clacker pays credits and Burster
// adds charge, both additively per end (a two-Clacker clack pays twice, etc.).
// Splitter is handled ONCE per clack in resolveClack (a single shared spawn at
// the contact midpoint), not per end, so it is intentionally not handled here.
function applyClackPower(special, i, emit) {
  switch (special.type[i]) {
    case CLACKER:
      emit.credits(CLACKER_CLACK_CREDITS);
      break;
    case BURSTER:
      special.charge[i] += BURSTER_CFG.chargePerClack;
      break;
    default:
      break;
  }
}

// Resolve a debounced clack between specials i and j in world.special.
// Fires ONLY when BOTH clackCooldown <= 0. On fire: set both cooldowns to
// CLACK_COOLDOWN, then apply each end's per-end power (Clacker credits, Burster
// charge). If EITHER end is a Splitter, emit exactly one cap-exempt 1-2 NORMAL
// ball spawn at the contact midpoint. Returns whether it fired. Emitted balls
// are NORMAL/cap-exempt (via emit.balls) and never re-enter the special pool,
// so there is no cascade. rng is injectable for determinism in tests.
export function resolveClack(world, i, j, emit, rng = Math.random) {
  const special = world.special;
  const cd = special.clackCooldown;
  if (cd[i] > 0 || cd[j] > 0) return false;
  cd[i] = CLACK_COOLDOWN;
  cd[j] = CLACK_COOLDOWN;
  applyClackPower(special, i, emit);
  applyClackPower(special, j, emit);
  if (special.type[i] === SPLITTER || special.type[j] === SPLITTER) {
    const mx = (special.x[i] + special.x[j]) * 0.5;
    const my = (special.y[i] + special.y[j]) * 0.5;
    const count = rng() < 0.5 ? SPLITTER_MIN : SPLITTER_MAX;
    emit.balls(count, mx, my);
  }
  return true;
}

// Add environmental-bounce charge to a Burster. No-op on non-Burster types so
// stepPhysics can call it unconditionally per live special. The caller passes
// amount = special.envHits[i] * BURSTER_CFG.chargePerBounce.
export function chargeBurster(special, i, amount) {
  if (special.type[i] !== BURSTER) return;
  special.charge[i] += amount;
}

// If a Burster has reached its threshold, emit ballsPerBurst cap-exempt NORMAL
// balls at its position and reset its charge to 0. Returns whether it burst.
export function tryBurst(world, i, emit) {
  const special = world.special;
  if (special.type[i] !== BURSTER) return false;
  if (special.charge[i] < BURSTER_CFG.threshold) return false;
  emit.balls(BURSTER_CFG.ballsPerBurst, special.x[i], special.y[i]);
  special.charge[i] = 0;
  return true;
}

// Build the per-step emit object passed into resolveClack / tryBurst.
// - credits(n): forward to the economy accumulator (addCredits) in main.js.
// - balls(count, x, y): spawn NORMAL, CAP_EXEMPT balls into world.normal via the
//   REAL spawnNormal, ONLY into the reserved-owned headroom. The request is
//   clamped to (world.ceiling - RESERVED_OWNED - world.normal.count); it fizzles
//   to zero when the arena is at/over the sub-ceiling so purchased (owned)
//   capacity is always protected. Reads live counts each call so spawns within
//   the same step are accounted for.
export function makeSpecialEmit(world, addCredits) {
  return {
    credits(n) {
      addCredits(n);
    },
    balls(count, x, y) {
      const sub = (world.ceiling ?? CEILING_DESKTOP) - RESERVED_OWNED;
      const headroom = sub - world.normal.count;
      if (headroom <= 0) return; // fizzle
      const n = count < headroom ? count : headroom;
      for (let k = 0; k < n; k++) spawnNormal(world, x, y, FLAG_CAP_EXEMPT);
    },
  };
}

// Ordered roster — also the spawn priority when the global cap is the binding
// constraint. Keys match the save-shape `state.specials` keys.
export const SPECIAL_TYPES = ['clacker', 'splitter', 'burster'];

// Decide how many of each special type may spawn this tick.
// Bounded by (a) per-type capacity headroom and (b) the global cap so that
// total live (existing + planned) never exceeds cap.
// saveSpecials = { clacker:{unlocked,capacity}, ... }; liveCounts = live counts.
export function specialSpawnPlan(saveSpecials, liveCounts, cap) {
  const plan = { clacker: 0, splitter: 0, burster: 0 };
  let liveTotal = 0;
  for (const t of SPECIAL_TYPES) liveTotal += liveCounts[t] || 0;
  let globalFree = cap - liveTotal;
  if (globalFree <= 0) return plan;
  for (const t of SPECIAL_TYPES) {
    if (globalFree <= 0) break;
    const c = saveSpecials[t];
    if (!c || !c.unlocked) continue;
    const typeFree = c.capacity - (liveCounts[t] || 0);
    if (typeFree <= 0) continue;
    const grant = typeFree < globalFree ? typeFree : globalFree;
    plan[t] = grant;
    globalFree -= grant;
  }
  return plan;
}

// Starter pack: how many of a type are granted the instant it's unlocked, so the
// tiny pool actually clacks right away (spec §6 "unlock-with-starter").
export const UNLOCK_STARTER = 4;

// Unlock a special type on the save: flip the flag, ensure capacity covers the
// starter pack, and return how many to spawn immediately (0 if already unlocked).
export function unlockSpecial(saveSpecials, type) {
  if (!SPECIAL_TYPES.includes(type)) {
    throw new Error(`unknown special type: ${type}`);
  }
  const c = saveSpecials[type];
  if (!c) throw new Error(`unknown special type: ${type}`);
  if (c.unlocked) return 0;
  c.unlocked = true;
  if (c.capacity < UNLOCK_STARTER) c.capacity = UNLOCK_STARTER;
  return UNLOCK_STARTER;
}

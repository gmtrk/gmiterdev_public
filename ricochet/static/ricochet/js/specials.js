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

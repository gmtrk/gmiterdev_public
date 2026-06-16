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

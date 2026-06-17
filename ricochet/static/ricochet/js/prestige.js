import { coresFromRun, prestigeThreshold } from './economy.js';
import { rebuildColliders } from './physics.js';
import { STARTING_CREDITS } from './config.js';

// A run's "speedup" feel-metric for the confirm modal: each projected Core is a
// felt permanent boost. We express the next-run head start as a simple, bounded,
// monotonic-in-cores factor so the modal can show "next run ~Nx faster".
// Pure presentation math (no economy authority) — tuned for a felt jump, not balance.
export function prestigeSpeedup(coresGained) {
  return 1 + Math.log2(1 + Math.max(0, coresGained));
}

// Projected outcome shown on the Big-Bang confirm modal BEFORE committing.
export function projectPrestige(state) {
  const runCredits = Number(state.credits);
  const cores = coresFromRun(runCredits);
  return {
    cores,
    canPrestige: runCredits >= prestigeThreshold(state.prestigeCount || 0),
    lifetimeAfter: state.lifetimeCores + cores,
    speedup: prestigeSpeedup(cores),
  };
}

// Commit the Big Bang: grant cores, then reset run progress IN PLACE while
// PERSISTING cores / lifetimeCores / coresShop / the placement blueprint (state.placed)
// and stats. Returns the cores gained.
export function performBigBang(state) {
  const gained = coresFromRun(Number(state.credits));
  // ---- persist (untouched): cores, lifetimeCores, coresShop, placed, stats ----
  state.cores += gained;
  state.lifetimeCores += gained;
  state.prestigeCount = (state.prestigeCount || 0) + 1; // drives the rising Big-Bang cost
  // ---- reset run progress (credits / Credits-shop / credit-bought specials) ----
  state.credits = 0;
  state.upgrades = {};
  for (const key of Object.keys(state.specials)) {
    state.specials[key] = { unlocked: false, capacity: 0 };
  }
  return gained;
}

// Re-seed a fresh run (first load AND post-Big-Bang) on the existing `world`.
// PRECONDITION: the caller has already run applyUpgradeEffects(world, state) so the
// derived levers (world.budgets, world.startCreditsMult) reflect the current state —
// buildWorld does this on first load, and the Big-Bang flow re-derives after the reset
// partition (Task 7.6). reinitFreshRun therefore reads the LIVE world.budgets as-is and
// never re-derives them (so a tiny post-reset budget is honored, not overwritten).
//   1. Seed starting credits = STARTING_CREDITS * startCreditsMult (Cores head-start; 1 default).
//   2. Rebuild the live colliders from the persisted blueprint.
// The persisted blueprint (state.placed) is NEVER trimmed — rebuildColliders clamps the
// LIVE world to world.budgets on every rebuild — so a tiny post-reset budget is honored
// while the saved layout stays intact and re-fills as the budget grows. (Earlier this
// clamp lived only here via a temp blueprint-swap, which let a later rebuild — e.g. buying
// an upgrade — resurrect the whole pre-prestige field; the clamp now belongs to
// rebuildColliders, so it holds on EVERY rebuild.)
export function reinitFreshRun(world, state) {
  const startMult = world.startCreditsMult != null ? world.startCreditsMult : 1;
  state.credits = STARTING_CREDITS * startMult;
  // Despawn every ball from the finished run — a fresh run starts empty and the
  // spawn tick refills it to capacity. Clearing the count empties each SoA pool;
  // reset the spawn accumulator so refilling restarts at the normal cadence.
  world.normal.count = 0;
  world.special.count = 0;
  world._spawnAcc = 0;
  rebuildColliders(world);
}

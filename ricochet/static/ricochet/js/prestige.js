import { coresFromRun, canPrestige } from './economy.js';
import { rebuildColliders } from './physics.js';
import { STARTING_CREDITS } from './config.js';
import { clampBlueprintToBudget } from './placement.js';

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
    canPrestige: canPrestige(runCredits),
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
//   2. Load the live colliders from a budget-clamped COPY of the blueprint.
// The persisted blueprint (state.placed) is NEVER trimmed — only the live world colliders
// are clamped — so growing the budget later re-fills the saved layout. We load the clamped
// copy by briefly pointing world.state.placed at it for the existing rebuildColliders pass
// (which reads world.state.placed.*), then restore the real persisted reference.
export function reinitFreshRun(world, state) {
  const startMult = world.startCreditsMult != null ? world.startCreditsMult : 1;
  state.credits = STARTING_CREDITS * startMult;

  // live = persisted blueprint trimmed to the current (post-reset) budgets; state.placed
  // stays untouched. clampBlueprintToBudget returns fresh sliced arrays (no mutation).
  const live = clampBlueprintToBudget(state.placed, world.budgets);
  const persisted = world.state.placed;
  world.state.placed = live;            // temporary: rebuildColliders reads world.state.placed
  rebuildColliders(world);              // load world.pegs/blocks/grid from the clamped copy
  world.state.placed = persisted;       // restore the untrimmed persisted blueprint
}

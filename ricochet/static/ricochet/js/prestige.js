import { coresFromRun, canPrestige } from './economy.js';

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

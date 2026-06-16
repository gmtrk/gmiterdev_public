import { CORES_UPGRADES } from './config.js';
import { upgradeCost, applyUpgradeEffects } from './economy.js';

// Offline bonuses are derived onto the world by applyUpgradeEffects from state.coresShop.
// Read them as VALUES off the world (never call a function to recompute per-frame).
// Default to 0 if a build of applyUpgradeEffects predates these fields.
export function coresOfflineBonuses(world) {
  return {
    efficiencyAdd: world.offlineEfficiencyAdd != null ? world.offlineEfficiencyAdd : 0,
    capAdd: world.offlineCapAdd != null ? world.offlineCapAdd : 0,
  };
}

// Buy one level of a Cores-shop upgrade: spend cores, WRITE state.coresShop, then
// re-derive world via applyUpgradeEffects (the contract buy path for cores buys).
// Returns true if the buy succeeded.
export function buyCoresUpgrade(world, state, id) {
  const def = CORES_UPGRADES.find((u) => u.id === id);
  if (!def) return false;
  const level = state.coresShop[id] || 0;
  if (def.max != null && level >= def.max) return false;
  const cost = upgradeCost(def, level);
  if (state.cores < cost) return false;
  state.cores -= cost;
  state.coresShop[id] = level + 1;
  applyUpgradeEffects(world, state);
  return true;
}

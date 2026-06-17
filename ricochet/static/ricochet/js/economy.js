import {
  EVENT_CAP, SURFACE_BASE, BASE_CAPACITY, GOLDEN, KICK,
  UPGRADES, CORES_UPGRADES, PEG_BUDGET_BASE, BLOCK_BUDGET_BASE,
  PRESTIGE, SPAWN_RATE_BASE,
} from './config.js';

export function computeEventMult(comboBonus, goldenBonus, breakBonus, cap = EVENT_CAP) {
  const sum = comboBonus + goldenBonus + breakBonus;
  return 1 + Math.min(cap, sum);
}

export function creditsFromCounters(counters, surfaceBase, globalValueMult, eventMult) {
  const base =
    counters.wall * surfaceBase.wall +
    counters.peg * surfaceBase.peg +
    counters.block * surfaceBase.block;
  return base * globalValueMult * eventMult;
}

export function updateCombo(comboBonus, scoredThisStep, dt, cfg) {
  let next = comboBonus;
  if (scoredThisStep) {
    next += Math.min(cfg.gainPerSec * dt, cfg.perStepGainCap);
  } else {
    next -= cfg.decayPerSec * dt;
  }
  if (next < 0) next = 0;
  if (next > cfg.capBonusStart) next = cfg.capBonusStart;
  return next;
}

export function upgradeCost(def, level) {
  return def.baseCost * def.costGrowth ** level;
}

export function upgradeEffect(def, level) {
  if (def.effectKind === 'mul') {
    return (1 + def.effectStep) ** level;
  }
  return def.effectStep * level;
}

function _level(map, id) {
  const v = map && map[id];
  return typeof v === 'number' ? v : 0;
}

function _def(table, id) {
  return table.find((d) => d.id === id);
}

export function applyUpgradeEffects(world, state) {
  const up = state.upgrades || {};
  const cs = state.coresShop || {};

  // globalValueMult = (1 + credits-add) * cores-power-mult
  const valueDef = _def(UPGRADES, 'globalValueMult');
  const creditsValue = 1 + upgradeEffect(valueDef, _level(up, 'globalValueMult'));
  const coresValueDef = _def(CORES_UPGRADES, 'globalValueMult');
  const coresValue = upgradeEffect(coresValueDef, _level(cs, 'globalValueMult'));
  world.globalValueMult = creditsValue * coresValue;

  // baseCapacity = BASE_CAPACITY + credits add + cores add
  const capDef = _def(UPGRADES, 'ballCapacity');
  const coresCapDef = _def(CORES_UPGRADES, 'baseCapacity');
  world.baseCapacity =
    BASE_CAPACITY +
    upgradeEffect(capDef, _level(up, 'ballCapacity')) +
    upgradeEffect(coresCapDef, _level(cs, 'baseCapacity'));

  // goldenChance = GOLDEN.chance + credits add + cores add
  const goldDef = _def(UPGRADES, 'goldenChance');
  const coresGoldDef = _def(CORES_UPGRADES, 'goldenChance');
  world.goldenChance =
    GOLDEN.chance +
    upgradeEffect(goldDef, _level(up, 'goldenChance')) +
    upgradeEffect(coresGoldDef, _level(cs, 'goldenChance'));

  // spawn rate = SPAWN_RATE_BASE + credits add (balls/sec the main spawn tick reads)
  const spawnDef = _def(UPGRADES, 'spawnRate');
  world.spawnRate = SPAWN_RATE_BASE + upgradeEffect(spawnDef, _level(up, 'spawnRate'));

  // placement budgets
  const pegBudgetDef = _def(UPGRADES, 'pegBudget');
  const blockBudgetDef = _def(UPGRADES, 'blockBudget');
  world.budgets.pegs = PEG_BUDGET_BASE + upgradeEffect(pegBudgetDef, _level(up, 'pegBudget'));
  world.budgets.blocks = BLOCK_BUDGET_BASE + upgradeEffect(blockBudgetDef, _level(up, 'blockBudget'));

  // peg kick
  const kickDef = _def(UPGRADES, 'pegKick');
  world.kick = KICK + upgradeEffect(kickDef, _level(up, 'pegKick'));

  // ramps: how many ramp pairs are active (0/1/2). rebuildRamps reads this.
  world.rampsLevel = _level(up, 'ramps');

  // Cores head-start: starting-credits multiplier (multiplicative; 1 when unbought).
  // reinitFreshRun (Phase 7) reads world.startCreditsMult to scale the cold-open grant.
  const startMultDef = _def(CORES_UPGRADES, 'startCreditsMult');
  world.startCreditsMult = upgradeEffect(startMultDef, _level(cs, 'startCreditsMult'));

  // Cores offline levers (additive; 0 when unbought). coresOfflineBonuses (Phase 7)
  // reads world.offlineEfficiencyAdd / world.offlineCapAdd.
  const offEffDef = _def(CORES_UPGRADES, 'offlineEfficiencyAdd');
  const offCapDef = _def(CORES_UPGRADES, 'offlineCapAdd');
  world.offlineEfficiencyAdd = upgradeEffect(offEffDef, _level(cs, 'offlineEfficiencyAdd'));
  world.offlineCapAdd = upgradeEffect(offCapDef, _level(cs, 'offlineCapAdd'));

  return world;
}

export function coresFromRun(runCredits, coreK = PRESTIGE.coreK, coreScale = PRESTIGE.coreScale) {
  return Math.floor(coreK * Math.sqrt(runCredits / coreScale));
}

export function canPrestige(runCredits, min = PRESTIGE.minCredits) {
  return runCredits >= min;
}

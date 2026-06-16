import { EVENT_CAP } from './config.js';

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

import { RESERVED_OWNED } from './config.js';

// Manual quality toggle: when ON (lowQuality=true) it clamps the LIVE ceiling
// to a fraction of the design ceiling. The adaptive reducer (gameloop.adaptCeiling)
// still runs on top of this; the two compose (min wins in practice).
export const QUALITY_LOW_FACTOR = 0.4;
// Floor so the toggle never starves owned spawns; must exceed RESERVED_OWNED.
export const QUALITY_MIN_CEILING = RESERVED_OWNED + 600;

export function qualityCeiling(ceiling, lowQuality) {
  if (!lowQuality) return ceiling;
  const lowered = Math.floor(ceiling * QUALITY_LOW_FACTOR);
  return Math.max(lowered, QUALITY_MIN_CEILING);
}

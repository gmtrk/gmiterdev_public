// Pure motion-FX policy. No DOM access here: callers pass already-resolved
// booleans (matchMedia result + quality toggle) so this stays node-testable.

export const FULL_MOTION = Object.freeze({
  trails: true,
  trailAlpha: 0.18,   // translucent fade strength for the full-canvas trail
  particles: true,
  particleScale: 1,
  shake: true,
});

export const REDUCED_MOTION = Object.freeze({
  trails: false,
  trailAlpha: 0,
  particles: true,
  particleScale: 0.25,
  shake: false,
});

// reducedMotion (prefers-reduced-motion) OR lowQuality both disable fade+shake.
// reducedMotion additionally dampens particles. reducedMotion dominates.
export function motionProfile(opts) {
  const reducedMotion = !!(opts && opts.reducedMotion);
  const lowQuality = !!(opts && opts.lowQuality);
  if (reducedMotion) return REDUCED_MOTION;
  if (lowQuality) {
    return Object.freeze({
      trails: false,
      trailAlpha: 0,
      particles: true,
      particleScale: 1,
      shake: false,
    });
  }
  return FULL_MOTION;
}

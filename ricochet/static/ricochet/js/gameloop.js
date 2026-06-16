import { DT, MAX_SUBSTEPS } from './config.js';

// Pure fixed-timestep reducer. Adds frameDt to acc, runs up to maxSubsteps
// whole dt steps, and DROPS any time beyond the cap (no spiral-of-death).
export function advance(acc, frameDt, dt, maxSubsteps) {
  const a = acc + frameDt;
  const whole = Math.floor(a / dt);
  // Sub-dt leftover, computed from the UNCAPPED whole-step count so that
  // capping drops the excess whole-dt debt instead of carrying it.
  let rem = a - whole * dt;
  if (rem < 0) rem = 0;
  const steps = whole > maxSubsteps ? maxSubsteps : whole;
  return { steps, acc: rem };
}

// Fixed-timestep loop. tick(nowMs) is the rAF callback, exposed for tests.
export function createLoop({ step, render, onFrameTime }) {
  let acc = 0;
  let lastMs = null;
  let running = false;
  let rafId = 0;

  function tick(nowMs) {
    let frameMs;
    if (lastMs === null) {
      frameMs = 0;          // first frame seeds the clock
    } else {
      frameMs = nowMs - lastMs;
    }
    lastMs = nowMs;
    if (onFrameTime) onFrameTime(frameMs);

    const frameDt = frameMs / 1000;
    const r = advance(acc, frameDt, DT, MAX_SUBSTEPS);
    acc = r.acc;
    for (let i = 0; i < r.steps; i++) step(DT);
    render();

    if (running && typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(tick);
    }
  }

  return {
    tick,
    start() {
      if (running) return;
      running = true;
      lastMs = null;
      if (typeof requestAnimationFrame === 'function') {
        rafId = requestAnimationFrame(tick);
      }
    },
    stop() {
      running = false;
      if (typeof cancelAnimationFrame === 'function' && rafId) {
        cancelAnimationFrame(rafId);
      }
    },
  };
}

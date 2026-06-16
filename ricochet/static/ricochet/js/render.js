import { PALETTE, BALL_RADIUS, PEG_RADIUS } from './config.js';

const FT_LIFE = 0.9;          // floating-text lifetime (seconds)
const FT_RISE = 40;           // px/sec upward drift

// --- pure helpers (Node-testable) ---

export function bucketRadius(r) {
  const b = Math.round(r);
  return b < 1 ? 1 : b;
}

export function atlasKey(typeName, r) {
  return `${typeName}@${bucketRadius(r)}`;
}

// Pooled floating credit text. Fixed cap; extra spawns overwrite oldest.
export function createFloatingTextPool(cap) {
  const xs = new Float32Array(cap);
  const ys = new Float32Array(cap);
  const life = new Float32Array(cap);
  const texts = new Array(cap).fill('');
  let head = 0;

  return {
    spawn(x, y, text) {
      xs[head] = x;
      ys[head] = y;
      life[head] = FT_LIFE;
      texts[head] = text;
      head = (head + 1) % cap;
    },
    update(dt) {
      for (let i = 0; i < cap; i++) {
        if (life[i] > 0) {
          life[i] -= dt;
          ys[i] -= FT_RISE * dt;
          if (life[i] < 0) life[i] = 0;
        }
      }
    },
    forEach(fn) {
      for (let i = 0; i < cap; i++) {
        if (life[i] > 0) {
          fn({ x: xs[i], y: ys[i], text: texts[i], life: life[i], maxLife: FT_LIFE });
        }
      }
    },
  };
}

// Ring-buffer particle pool. Fixed cap; emit overwrites oldest.
export function createParticleRing(cap) {
  const xs = new Float32Array(cap);
  const ys = new Float32Array(cap);
  const vxs = new Float32Array(cap);
  const vys = new Float32Array(cap);
  const life = new Float32Array(cap);
  let head = 0;

  return {
    emit(x, y, vx, vy, lifeSec) {
      xs[head] = x;
      ys[head] = y;
      vxs[head] = vx;
      vys[head] = vy;
      life[head] = lifeSec;
      head = (head + 1) % cap;
    },
    update(dt) {
      for (let i = 0; i < cap; i++) {
        if (life[i] > 0) {
          xs[i] += vxs[i] * dt;
          ys[i] += vys[i] * dt;
          life[i] -= dt;
          if (life[i] < 0) life[i] = 0;
        }
      }
    },
    forEach(fn) {
      for (let i = 0; i < cap; i++) {
        if (life[i] > 0) {
          fn({ x: xs[i], y: ys[i], life: life[i] });
        }
      }
    },
  };
}

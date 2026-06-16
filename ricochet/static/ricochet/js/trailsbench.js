import { performance } from 'node:perf_hooks';

// Three candidate trail techniques from spec §11. This is a REAL representative
// per-frame draw loop (NOT a sketch): the production caller injects a real
// 2D context; benchmarks/tests inject a counting stub. The op sequence here is
// exactly what render.js would issue per frame for each technique.
export const TECHNIQUES = Object.freeze(['clear', 'fade', 'pertrail']);

const TRAIL_ALPHA = 0.18;
const TRAIL_STEP_PX = 4; // ghost spacing along the velocity direction

function drawHead(ctx, sprite, x, y) {
  // Flyweight blit: ctx.drawImage(sprite, x - r, y - r). r derived from sprite.
  const r = sprite.width / 2;
  ctx.drawImage(sprite, x - r, y - r, sprite.width, sprite.height);
}

function blitFrame(technique, ctx, balls, sprite, trailLen) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  if (technique === 'fade') {
    // (b) translucent full-canvas fade — the costly full-DPR overdraw op.
    ctx.globalAlpha = TRAIL_ALPHA;
    ctx.fillStyle = '#0a0a16';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  } else {
    // (a) clear-each-frame and (c) per-trail both hard-clear first.
    ctx.clearRect(0, 0, W, H);
  }

  const n = balls.count;
  for (let i = 0; i < n; i++) {
    const x = balls.xs[i];
    const y = balls.ys[i];
    if (technique === 'pertrail') {
      // (c) short per-ball trail: a few decaying ghost blits behind the head.
      for (let g = trailLen; g >= 1; g--) {
        ctx.globalAlpha = TRAIL_ALPHA * (g / (trailLen + 1));
        drawHead(ctx, sprite, x - g * TRAIL_STEP_PX, y - g * TRAIL_STEP_PX);
      }
      ctx.globalAlpha = 1;
    }
    drawHead(ctx, sprite, x, y);
  }
}

export function benchTechnique(technique, ctx, balls, sprite, trailLen = 1, frames = 1) {
  if (!TECHNIQUES.includes(technique)) {
    throw new Error(`unknown trails technique: ${technique}`);
  }
  const t0 = performance.now();
  for (let f = 0; f < frames; f++) {
    blitFrame(technique, ctx, balls, sprite, trailLen);
  }
  const t1 = performance.now();
  return { technique, frames, balls: balls.count, ms: t1 - t0 };
}

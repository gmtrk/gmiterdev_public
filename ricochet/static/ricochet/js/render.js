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

// --- canvas atlas (browser only; verified manually) ---

const ATLAS_TYPES = {
  normal: PALETTE.ballCyan,
  golden: PALETTE.ballYellow,
  clacker: PALETTE.clacker,
  splitter: PALETTE.splitter,
  burster: PALETTE.burster,
};

function renderGlowSprite(color, r, dpr) {
  const pad = Math.ceil(r * 1.8);
  const size = Math.ceil((r + pad) * 2);
  const cnv = document.createElement('canvas');
  cnv.width = Math.ceil(size * dpr);
  cnv.height = Math.ceil(size * dpr);
  const c = cnv.getContext('2d');
  c.scale(dpr, dpr);
  const cx = size / 2;
  const cy = size / 2;
  const grad = c.createRadialGradient(cx, cy, r * 0.2, cx, cy, r + pad);
  grad.addColorStop(0, color);
  grad.addColorStop(0.45, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = grad;
  c.beginPath();
  c.arc(cx, cy, r + pad, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#ffffff';
  c.globalAlpha = 0.9;
  c.beginPath();
  c.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
  c.fill();
  return { canvas: cnv, half: size / 2 };
}

// Build per-(type x radius bucket) glow sprites. radii: array of radii to bucket.
export function buildAtlas(palette, radii, dpr) {
  const cappedDpr = Math.min(dpr || 1, 2);
  const sprites = {};
  const types = {
    normal: palette.ballCyan,
    golden: palette.ballYellow,
    clacker: palette.clacker,
    splitter: palette.splitter,
    burster: palette.burster,
  };
  for (const typeName of Object.keys(types)) {
    for (const raw of radii) {
      const r = bucketRadius(raw);
      const key = atlasKey(typeName, r);
      if (!sprites[key]) {
        sprites[key] = renderGlowSprite(types[typeName], r, cappedDpr);
      }
    }
  }
  return { sprites, dpr: cappedDpr };
}

// Map a special pool type code to its atlas type-name. Type codes come from
// physics.js: NORMAL=0, CLACKER=1, SPLITTER=2, BURSTER=3.
const SPECIAL_TYPE_NAME = ['normal', 'clacker', 'splitter', 'burster'];

function blitSprite(ctx, atlas, key, x, y) {
  const sp = atlas.sprites[key];
  if (!sp) return;
  const w = sp.canvas.width / atlas.dpr;
  const h = sp.canvas.height / atlas.dpr;
  ctx.drawImage(sp.canvas, x - w / 2, y - h / 2, w, h);
}

// FLAG_GOLDEN bit (mirrors physics.js). Kept local for the golden-sprite select;
// render.js does import the physics ball-type constants (BURSTER) in Task 6.8 for
// the charge-ring hue — that's a one-way import (physics never imports render), no cycle.
const FLAG_GOLDEN = 1;

export function draw(ctx, world, atlas, view) {
  const P = view.PALETTE;

  // background
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, world.W, world.H);

  // pegs
  ctx.fillStyle = P.peg;
  const pegs = world.pegs;
  for (let i = 0; i < pegs.count; i++) {
    ctx.beginPath();
    ctx.arc(pegs.xs[i], pegs.ys[i], pegs.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // blocks — ALL share world.blockW/blockH; half-extent = /2; NO per-block hw/hh
  const blocks = world.blocks;
  const hw = world.blockW / 2;
  const hh = world.blockH / 2;
  for (let i = 0; i < blocks.count; i++) {
    if (blocks.respawnAt[i] > world.now) continue; // inactive (respawning) — invisible
    ctx.strokeStyle = blocks.golden[i] ? P.ballYellow : P.peg;
    ctx.lineWidth = 2;
    ctx.strokeRect(blocks.xs[i] - hw, blocks.ys[i] - hh, world.blockW, world.blockH);
    ctx.fillStyle = 'rgba(255,61,240,0.08)';
    ctx.fillRect(blocks.xs[i] - hw, blocks.ys[i] - hh, world.blockW, world.blockH);
  }

  // paddle
  const pd = world.paddle;
  ctx.fillStyle = P.ballCyan;
  ctx.fillRect(pd.x - pd.w / 2, pd.y - pd.h / 2, pd.w, pd.h);

  // normal balls — golden flag selects the golden sprite
  const n = world.normal;
  for (let i = 0; i < n.count; i++) {
    const typeName = (n.flags[i] & FLAG_GOLDEN) ? 'golden' : 'normal';
    blitSprite(ctx, atlas, atlasKey(typeName, n.radius[i]), n.x[i], n.y[i]);
  }

  // special balls — sprite by type name; charge ring stroke uses per-type hue
  // (specialHue) and the arc extent comes from chargeRing (both authored in
  // Task 6.8 at module scope — no inline /60 literal).
  const s = world.special;
  for (let i = 0; i < s.count; i++) {
    const typeName = SPECIAL_TYPE_NAME[s.type[i]] || 'clacker';
    blitSprite(ctx, atlas, atlasKey(typeName, s.radius[i]), s.x[i], s.y[i]);
    if (typeName === 'burster' && s.charge) {
      const { frac, startAngle, endAngle } = chargeRing(s.charge[i], BURSTER_CFG.threshold);
      if (frac > 0) {
        ctx.strokeStyle = specialHue(BURSTER, view.PALETTE);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x[i], s.y[i], s.radius[i] + 4, startAngle, endAngle);
        ctx.stroke();
      }
    }
  }

  // particles
  ctx.fillStyle = P.ballYellow;
  if (view.particles) {
    view.particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    });
    ctx.globalAlpha = 1;
  }

  // floating text
  if (view.floatingText) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    view.floatingText.forEach((ft) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, ft.life / ft.maxLife));
      ctx.fillText(ft.text, ft.x, ft.y);
    });
    ctx.globalAlpha = 1;
  }
}

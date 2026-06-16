// Ricochet bootstrap stub (Phase 0): paints the neon void background so the
// page proves the canvas pipeline works. Phase 4 replaces the DOM bootstrap
// with the full migrate(deserialize(...)) -> buildWorld -> createLoop wiring.

export const BG_COLOR = '#0a0a16';

export function paintBackground(ctx, width, height, bgColor = BG_COLOR) {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
}

function boot() {
  const canvas = document.getElementById('ricochet-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  paintBackground(ctx, canvas.width, canvas.height, BG_COLOR);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}

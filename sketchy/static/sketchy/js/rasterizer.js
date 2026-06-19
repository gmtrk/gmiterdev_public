// Strokes -> Float32Array(64*64) model input. MUST stay parity-identical to
// sketchy/rasterizer.py (pinned by rasterizer_golden.json). Uses a canvas in the
// browser; under node --test it uses a pure-JS supersampled rasterization that
// matches PIL's draw-big-then-BOX-downsample closely enough for the parity gate.
export const SIZE = 64;
export const RENDER = 256;
export const RENDER_MARGIN = 16;
export const LINE_WIDTH = 6;

export function bbox(strokes) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [xs, ys] of strokes) {
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] < minx) minx = xs[i];
      if (xs[i] > maxx) maxx = xs[i];
      if (ys[i] < miny) miny = ys[i];
      if (ys[i] > maxy) maxy = ys[i];
    }
  }
  return [minx, miny, maxx, maxy];
}

function hasPoints(strokes) {
  for (const [xs] of strokes) if (xs.length) return true;
  return false;
}

export function transformParams(strokes) {
  const [minx, miny, maxx, maxy] = bbox(strokes);
  const w = Math.max(maxx - minx, 1e-6);
  const h = Math.max(maxy - miny, 1e-6);
  const inner = RENDER - 2 * RENDER_MARGIN;
  const scale = inner / Math.max(w, h);
  const drawnW = (maxx - minx) * scale;
  const drawnH = (maxy - miny) * scale;
  const offx = (RENDER - drawnW) / 2 - minx * scale;
  const offy = (RENDER - drawnH) / 2 - miny * scale;
  return { scale, offx, offy };
}

// Draw at RENDER resolution into a Uint8 buffer (white ink on black) using a
// supersampled coverage approximation, then box-downsample to SIZE.
function rasterCpu(strokes) {
  const { scale, offx, offy } = transformParams(strokes);
  const buf = new Float32Array(RENDER * RENDER);
  const r = LINE_WIDTH / 2;
  const stamp = (px, py) => {
    const x0 = Math.max(0, Math.floor(px - r)), x1 = Math.min(RENDER - 1, Math.ceil(px + r));
    const y0 = Math.max(0, Math.floor(py - r)), y1 = Math.min(RENDER - 1, Math.ceil(py + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
        const cov = Math.max(0, Math.min(1, r + 0.5 - d)); // 1px AA edge
        if (cov > buf[y * RENDER + x]) buf[y * RENDER + x] = cov;
      }
    }
  };
  for (const [xs, ys] of strokes) {
    const pts = xs.map((x, i) => [x * scale + offx, ys[i] * scale + offy]);
    if (pts.length === 1) { stamp(pts[0][0], pts[0][1]); continue; }
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let s = 0; s <= steps; s++) {
        stamp(ax + (bx - ax) * (s / steps), ay + (by - ay) * (s / steps));
      }
    }
  }
  // box-downsample RENDER -> SIZE (factor 4)
  const f = RENDER / SIZE;
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let acc = 0;
      for (let dy = 0; dy < f; dy++)
        for (let dx = 0; dx < f; dx++)
          acc += buf[(y * f + dy) * RENDER + (x * f + dx)];
      out[y * SIZE + x] = acc / (f * f);
    }
  }
  return out;
}

// Browser path: real canvas with round caps/joins, then drawImage downscale.
function rasterCanvas(strokes) {
  const { scale, offx, offy } = transformParams(strokes);
  const big = document.createElement('canvas');
  big.width = RENDER; big.height = RENDER;
  const bg = big.getContext('2d');
  bg.fillStyle = '#000'; bg.fillRect(0, 0, RENDER, RENDER);
  bg.strokeStyle = '#fff'; bg.fillStyle = '#fff';
  bg.lineWidth = LINE_WIDTH; bg.lineCap = 'round'; bg.lineJoin = 'round';
  for (const [xs, ys] of strokes) {
    if (!xs.length) continue;
    if (xs.length === 1) {
      bg.beginPath();
      bg.arc(xs[0] * scale + offx, ys[0] * scale + offy, LINE_WIDTH / 2, 0, Math.PI * 2);
      bg.fill(); continue;
    }
    bg.beginPath();
    bg.moveTo(xs[0] * scale + offx, ys[0] * scale + offy);
    for (let i = 1; i < xs.length; i++) bg.lineTo(xs[i] * scale + offx, ys[i] * scale + offy);
    bg.stroke();
  }
  const small = document.createElement('canvas');
  small.width = SIZE; small.height = SIZE;
  const sg = small.getContext('2d');
  sg.imageSmoothingEnabled = true;
  sg.drawImage(big, 0, 0, SIZE, SIZE);
  const { data } = sg.getImageData(0, 0, SIZE, SIZE);
  const out = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4] / 255; // R channel (gray)
  return out;
}

export function strokesToInput(strokes) {
  if (!hasPoints(strokes)) return new Float32Array(SIZE * SIZE);
  return (typeof document !== 'undefined' && document.createElement)
    ? rasterCanvas(strokes)
    : rasterCpu(strokes);
}

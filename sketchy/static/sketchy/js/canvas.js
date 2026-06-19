// Pointer-driven sketch surface. Emits strokes as [[xs],[ys]] (Quick Draw shape).
const INK = '#2b2b2b';
const WIDTH = 4;

export function createCanvas(el, { onChange } = {}) {
  const ctx = el.getContext('2d');
  let strokes = [];
  let cur = null;
  let drawing = false;

  function resize() {
    const rect = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(rect.width * dpr);
    el.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw(rect.width, rect.height);
  }

  function redraw(w, h) {
    ctx.clearRect(0, 0, w || el.width, h || el.height);
    ctx.strokeStyle = INK; ctx.lineWidth = WIDTH;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [xs, ys] of strokes) drawStroke(xs, ys);
  }

  function drawStroke(xs, ys) {
    if (!xs.length) return;
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.stroke();
  }

  function pos(e) {
    const rect = el.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    drawing = true;
    const [x, y] = pos(e);
    cur = [[x], [y]];
    strokes.push(cur);
  });
  el.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    e.preventDefault();
    const [x, y] = pos(e);
    cur[0].push(x); cur[1].push(y);
    const rect = el.getBoundingClientRect();
    ctx.strokeStyle = INK; ctx.lineWidth = WIDTH; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const n = cur[0].length;
    ctx.beginPath();
    ctx.moveTo(cur[0][n - 2], cur[1][n - 2]);
    ctx.lineTo(cur[0][n - 1], cur[1][n - 1]);
    ctx.stroke();
    if (onChange) onChange();
  });
  const end = (e) => {
    if (!drawing) return;
    drawing = false; cur = null;
    if (onChange) onChange();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.style.touchAction = 'none'; // suppress scroll/zoom while drawing

  window.addEventListener('resize', resize);
  resize();

  return {
    getStrokes: () => strokes,
    clear() { strokes = []; cur = null; const r = el.getBoundingClientRect(); redraw(r.width, r.height); if (onChange) onChange(); },
  };
}

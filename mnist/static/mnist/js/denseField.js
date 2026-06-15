import { buildTiledRGBA } from './tiling.js';

export function createDenseField({ canvas, cols, lut }) {
  const ctx = canvas.getContext('2d');

  function render({ data, shape }) {
    const channels = shape[shape.length - 1];
    const t = buildTiledRGBA({ data, height: 1, width: 1, channels, cols, gap: 1, lut });
    canvas.width = t.canvasWidth;
    canvas.height = t.canvasHeight;
    ctx.putImageData(new ImageData(t.rgba, t.canvasWidth, t.canvasHeight), 0, 0);
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { render, clear };
}

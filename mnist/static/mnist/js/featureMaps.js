import { buildTiledRGBA, buildCompositeRGBA } from './tiling.js';

// Renders one conv stage: a tiled grid of all its feature maps + a composite
// max-projection header. `cols`/`gap` control the grid layout.
export function createStageRenderer({ gridCanvas, compositeCanvas, cols, gap, lut }) {
  const gctx = gridCanvas.getContext('2d');
  const cctx = compositeCanvas.getContext('2d');
  let last = null; // { data, height, width, channels } — for hover-enlarge (Task 8)

  function paint(canvas, ctx, { rgba, canvasWidth, canvasHeight }) {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.putImageData(new ImageData(rgba, canvasWidth, canvasHeight), 0, 0);
  }

  function render({ data, shape }) {
    const [, height, width, channels] = shape;
    last = { data, height, width, channels };
    paint(gridCanvas, gctx, buildTiledRGBA({ data, height, width, channels, cols, gap, lut }));
    paint(compositeCanvas, cctx, buildCompositeRGBA({ data, height, width, channels, lut }));
  }

  function clear() {
    gctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    cctx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
    last = null;
  }

  return { render, clear, getLast: () => last };
}

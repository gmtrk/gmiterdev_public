import { buildTiledRGBA, buildCompositeRGBA, buildChannelRGBA } from './tiling.js';

// Renders one conv stage: a tiled grid of all its feature maps + a composite
// max-projection header. `cols`/`gap` control the grid layout.
export function createStageRenderer({ gridCanvas, compositeCanvas, cols, gap, lut }) {
  const gctx = gridCanvas.getContext('2d');
  const cctx = compositeCanvas.getContext('2d');
  let last = null; // { data, height, width, channels } — for hover-enlarge

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

  // Map a pointer event on the grid canvas to a channel index, or -1 if on a gap/outside.
  function channelAt(event) {
    if (!last) return -1;
    const rect = gridCanvas.getBoundingClientRect();
    const sx = gridCanvas.width / rect.width;
    const sy = gridCanvas.height / rect.height;
    const px = (event.clientX - rect.left) * sx;
    const py = (event.clientY - rect.top) * sy;
    const col = Math.floor(px / (last.width + gap));
    const row = Math.floor(py / (last.height + gap));
    // reject the gap pixels between tiles
    if (px % (last.width + gap) >= last.width) return -1;
    if (py % (last.height + gap) >= last.height) return -1;
    const ch = row * cols + col;
    return ch >= 0 && ch < last.channels ? ch : -1;
  }

  function channelImage(ch) {
    return buildChannelRGBA({
      data: last.data, height: last.height, width: last.width,
      channels: last.channels, channel: ch, lut,
    });
  }

  return { render, clear, getLast: () => last, channelAt, channelImage };
}

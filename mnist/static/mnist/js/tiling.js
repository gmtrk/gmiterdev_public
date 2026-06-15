import { colorFor } from './colormap.js';
import { makeNormalizer } from './normalize.js';

// HWC activation index helper: value of channel c at pixel (h,w).
function at(data, h, w, c, width, channels) {
  return data[(h * width + w) * channels + c];
}

function fillBackground(rgba, lut) {
  const [r, g, b] = colorFor(lut, 0);
  for (let p = 0; p < rgba.length; p += 4) {
    rgba[p] = r;
    rgba[p + 1] = g;
    rgba[p + 2] = b;
    rgba[p + 3] = 255;
  }
}

// Tile all `channels` feature maps (each height x width) into a grid `cols` wide
// with `gap` background pixels between tiles. Normalization is global across the
// whole stage so brightness is comparable map-to-map.
// Returns { rgba: Uint8ClampedArray, canvasWidth, canvasHeight }.
export function buildTiledRGBA({ data, height, width, channels, cols, gap, lut }) {
  const rows = Math.ceil(channels / cols);
  const canvasWidth = cols * width + (cols - 1) * gap;
  const canvasHeight = rows * height + (rows - 1) * gap;
  const rgba = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
  fillBackground(rgba, lut);
  const norm = makeNormalizer(data);
  for (let c = 0; c < channels; c++) {
    const originX = (c % cols) * (width + gap);
    const originY = Math.floor(c / cols) * (height + gap);
    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        const [r, g, b] = colorFor(lut, norm.scale(at(data, h, w, c, width, channels)));
        const p = ((originY + h) * canvasWidth + (originX + w)) * 4;
        rgba[p] = r;
        rgba[p + 1] = g;
        rgba[p + 2] = b;
        rgba[p + 3] = 255;
      }
    }
  }
  return { rgba, canvasWidth, canvasHeight };
}

// Collapse all channels into one image via per-pixel max across channels.
export function buildCompositeRGBA({ data, height, width, channels, lut }) {
  const proj = new Float32Array(height * width);
  for (let h = 0; h < height; h++) {
    for (let w = 0; w < width; w++) {
      let m = -Infinity;
      for (let c = 0; c < channels; c++) {
        const v = at(data, h, w, c, width, channels);
        if (v > m) m = v;
      }
      proj[h * width + w] = m;
    }
  }
  const norm = makeNormalizer(proj);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < proj.length; i++) {
    const [r, g, b] = colorFor(lut, norm.scale(proj[i]));
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, canvasWidth: width, canvasHeight: height };
}

// One single channel as its own image (used by hover-to-enlarge).
// Normalized against that channel's own min/max for maximum contrast.
export function buildChannelRGBA({ data, height, width, channels, channel, lut }) {
  const single = new Float32Array(height * width);
  for (let h = 0; h < height; h++) {
    for (let w = 0; w < width; w++) {
      single[h * width + w] = at(data, h, w, channel, width, channels);
    }
  }
  const norm = makeNormalizer(single);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < single.length; i++) {
    const [r, g, b] = colorFor(lut, norm.scale(single[i]));
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, canvasWidth: width, canvasHeight: height };
}

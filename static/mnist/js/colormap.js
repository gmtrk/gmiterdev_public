// Inferno colormap. Eight control stops sampled from matplotlib's "inferno",
// linearly interpolated into a 256-entry RGB lookup table. Pure / no DOM.
const STOPS = [
  [0.00, 0, 0, 4],
  [0.14, 40, 11, 84],
  [0.29, 101, 21, 110],
  [0.43, 159, 42, 99],
  [0.57, 212, 72, 66],
  [0.71, 245, 125, 21],
  [0.86, 250, 193, 39],
  [1.00, 252, 255, 164],
];

export function buildInfernoLUT() {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = STOPS[0];
    let b = STOPS[STOPS.length - 1];
    for (let s = 0; s < STOPS.length - 1; s++) {
      if (t >= STOPS[s][0] && t <= STOPS[s + 1][0]) {
        a = STOPS[s];
        b = STOPS[s + 1];
        break;
      }
    }
    const span = b[0] - a[0];
    const f = span === 0 ? 0 : (t - a[0]) / span;
    lut[i * 3] = Math.round(a[1] + (b[1] - a[1]) * f);
    lut[i * 3 + 1] = Math.round(a[2] + (b[2] - a[2]) * f);
    lut[i * 3 + 2] = Math.round(a[3] + (b[3] - a[3]) * f);
  }
  return lut;
}

// t in [0,1] -> [r,g,b]. Clamps t outside the range.
export function colorFor(lut, t) {
  let i = Math.round(t * 255);
  if (i < 0) i = 0;
  else if (i > 255) i = 255;
  return [lut[i * 3], lut[i * 3 + 1], lut[i * 3 + 2]];
}

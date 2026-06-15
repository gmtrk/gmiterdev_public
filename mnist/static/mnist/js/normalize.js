// Min/max normalizer over a flat (typed) array of activations.
// Returns { min, max, scale } where scale(v) maps v into [0,1].
// If all values are equal (e.g. a blank canvas -> all zeros), scale() returns 0.
export function makeNormalizer(data) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  return {
    min,
    max,
    scale: span === 0 ? () => 0 : (v) => (v - min) / span,
  };
}

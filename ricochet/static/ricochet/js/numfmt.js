// Suffix table per contract: index i covers 10^(3*i).
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa'];
const SCI_THRESHOLD = 1e18; // abs(n) >= this -> scientific toExponential(1), lowercased

// Pure, allocation-light number formatter. Never returns NaN/undefined/null.
export function formatNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '0';
  if (n === 0) return '0';

  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);

  if (abs >= SCI_THRESHOLD) {
    // toExponential yields 'e+18'; the contract wants 'e18' (no plus).
    return sign + abs.toExponential(1).toLowerCase().replace('e+', 'e');
  }

  // Largest suffix whose 10^(3*i) is <= abs.
  let idx = Math.floor(Math.log10(abs) / 3);
  if (idx < 0) idx = 0;
  if (idx >= SUFFIXES.length) idx = SUFFIXES.length - 1;

  const scaled = abs / Math.pow(1000, idx);

  if (idx === 0) {
    // Below 1000: integer, no decimals, no suffix.
    return sign + String(Math.floor(scaled));
  }
  return sign + scaled.toFixed(1) + SUFFIXES[idx];
}

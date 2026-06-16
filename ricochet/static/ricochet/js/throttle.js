// makeThrottle(intervalMs): returns a gate(nowMs) closure that yields true at
// most once per intervalMs. The first call always passes. Used for ~6 Hz HUD.
export function makeThrottle(intervalMs) {
  let last = -Infinity;
  return function gate(nowMs) {
    if (nowMs - last >= intervalMs) {
      last = nowMs;
      return true;
    }
    return false;
  };
}

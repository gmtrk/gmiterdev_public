// Speed-points: whole seconds remaining at recognition, clamped.
export function pointsForRecognition(secondsLeft, roundSeconds = 20) {
  return Math.max(0, Math.min(roundSeconds, Math.floor(secondsLeft)));
}

export function roundTotal(results) {
  return results.reduce((sum, r) => sum + (r.points || 0), 0);
}

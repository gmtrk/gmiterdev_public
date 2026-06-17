import { OFFLINE } from './config.js';

// EMA of the steady earn rate (credits/sec). Half-life form: weight of the new
// sample over an interval dt is 1 - 0.5^(dt/halfLife). The EMA is asymmetric — it
// reacts normally to DOWN moves but down-weights UP moves: an incoming sample above
// the current rate is clamped to a bounded multiple of it (prev*1.5 + epsilon)
// before blending. That caps how far a single transient jackpot (a golden/burst
// spike) can drag the persisted rate (spike-resistance, unit-tested) while a
// sustained higher rate still converges over many samples because each step lifts
// the clamp ceiling. Downward samples pass through unclamped so the rate falls fast
// when real earnings drop.
const EARN_RATE_UP_EPSILON = 100; // absolute upward-step allowance so climb-from-zero converges
export function updateEarnRate(prevRate, sampleRate, dt, halfLifeSec = OFFLINE.emaHalfLifeSec) {
  if (!(halfLifeSec > 0) || !(dt > 0)) return prevRate;
  const alpha = 1 - Math.pow(0.5, dt / halfLifeSec);
  let sample = sampleRate;
  if (sample > prevRate) {
    // Asymmetric down-weighting of upward moves: clamp the spike to a bounded growth.
    sample = Math.min(sample, prevRate * 1.5 + EARN_RATE_UP_EPSILON);
  }
  return prevRate + alpha * (sample - prevRate);
}

// Symmetric half-life EMA for a DISPLAY rate: blends up and down equally (unlike
// updateEarnRate, which is asymmetric/anti-spike and would under-report a display
// value). Smooths the per-second HUD so it doesn't read 0 on the many steps with
// no contact. Pure + tested.
export function smoothRate(prevRate, sampleRate, dt, halfLifeSec) {
  if (!(halfLifeSec > 0) || !(dt > 0)) return prevRate;
  const alpha = 1 - Math.pow(0.5, dt / halfLifeSec);
  return prevRate + alpha * (sampleRate - prevRate);
}

// Seconds elapsed since the last save, clamped: future-dated (now < lastSaveTime) -> 0
// (clock-skew/fraud guard); beyond the cap -> cap. Times are in milliseconds.
export function clampAwaySeconds(nowMs, lastSaveMs, capSeconds = OFFLINE.capSeconds) {
  const seconds = (nowMs - lastSaveMs) / 1000;
  if (!(seconds > 0)) return 0;
  return Math.min(seconds, capSeconds);
}

// Offline efficiency = base 0.30 + Cores-shop additive bonus (already summed by caller).
export function offlineEfficiency(coresEfficiencyAdd = 0) {
  return OFFLINE.efficiencyBase + coresEfficiencyAdd;
}

export function offlineCredits(rate, awaySeconds, efficiency) {
  return rate * awaySeconds * efficiency;
}

// Combine the pieces for the "while you were gone" flow.
//   stats: { recentEarnRate, lastSaveTime }
//   nowMs: current wall clock (ms)
//   coresEfficiencyAdd / coresCapAdd: derived Cores-shop bonuses
// Returns { awaySeconds, efficiency, credits, showModal }.
export function computeOffline(stats, nowMs, coresEfficiencyAdd = 0, coresCapAdd = 0) {
  const rate = Number(stats.recentEarnRate) || 0;
  const cap = OFFLINE.capSeconds + coresCapAdd;
  const awaySeconds = clampAwaySeconds(nowMs, Number(stats.lastSaveTime) || 0, cap);
  const efficiency = offlineEfficiency(coresEfficiencyAdd);
  const credits = rate > 0 && awaySeconds > 0 ? offlineCredits(rate, awaySeconds, efficiency) : 0;
  return { awaySeconds, efficiency, credits, showModal: credits > 0 };
}

// Grant offline earnings exactly once: add to state.credits and advance lastSaveTime
// to `now` so a reload can't re-collect the same interval (kills reload-farming).
export function grantOffline(state, credits, nowMs) {
  state.credits = Number(state.credits) + credits;
  state.stats.lastSaveTime = nowMs;
  return credits;
}

// voice.js — pure phrasing for the presence. Picks a spoken best-guess line
// (confidence-tiered, grammar-aware) and formats runner-up rows. Randomness is
// injected so this is unit-testable; DOM writing lives in guesses.js.
import { article } from './guesses.js';

const HIGH = [
  (w, p) => `Hmm, I think that's <b>${article(w)} ${w}</b> <span class="sk-pct">(${p}%)</span>`,
  (w, p) => `I'm <span class="sk-pct">${p}%</span> sure that's <b>${article(w)} ${w}</b>~`,
  (w, p) => `Ooh — <b>${article(w)} ${w}</b>? <span class="sk-pct">${p}%</span>, I'd say ♡`,
  (w, p) => `That's gotta be <b>${article(w)} ${w}</b>, right? <span class="sk-pct">${p}%</span>`,
];
const MID = [
  (w, p) => `maybe <b>${article(w)} ${w}</b>? <span class="sk-pct">${p}%</span>…`,
  (w, p) => `looks like <b>${article(w)} ${w}</b> to me. <span class="sk-pct">${p}%</span>?`,
];
const LOW = [
  (w, p) => `uhh… <b>${article(w)} ${w}</b>? <span class="sk-pct">${p}%</span>. don't judge me`,
  (w, p) => `I wanna say <b>${article(w)} ${w}</b> but only <span class="sk-pct">${p}%</span> of me believes it`,
];

export function pickLine(topk, { rng = Math.random } = {}) {
  if (!topk || !topk.length) return 'draw something for me ♡';
  const w = topk[0].label;
  const p = Math.round(topk[0].prob * 100);
  const pool = p >= 75 ? HIGH : p >= 40 ? MID : LOW;
  return pool[Math.floor(rng() * pool.length) % pool.length](w, p);
}

export function runnerUps(topk, n = 2) {
  if (!topk) return [];
  return topk.slice(1, 1 + n).map((g) => ({ label: g.label, pct: Math.round(g.prob * 100) }));
}

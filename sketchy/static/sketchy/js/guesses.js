// "a" / "an" by leading vowel letter — correct for all Sketchy categories.
export function article(word) {
  return /^[aeiou]/i.test(String(word).trim()) ? 'an' : 'a';
}

import { pickLine, runnerUps } from './voice.js';

// Re-render the dialogue only when the TOP-1 prediction changes, so the spoken
// line + bars stay steady while you keep drawing the same thing (instead of
// re-rolling on every ~80ms percent tick). null (empty canvas) resets the gate.
let lastTop = null;

// Render the dialogue: spoken best-guess line into headlineEl, runner-up
// question-rows (with bars) into `container`.
export function renderGuesses(container, topk, { headlineEl, rng } = {}) {
  const top = (topk && topk.length) ? topk[0].label : null;
  if (top === lastTop) return;
  lastTop = top;
  if (headlineEl) headlineEl.innerHTML = pickLine(topk, { rng });
  if (!container) return;
  const alts = runnerUps(topk, 2);
  container.innerHTML = alts.map((a) =>
    `<div class="sk-alt"><span class="sk-alt__q">…or ${article(a.label)} ${a.label}?</span>`
    + `<span class="sk-alt__track"><i style="width:${a.pct}%"></i></span>`
    + `<span class="sk-alt__pct">${a.pct}%</span></div>`).join('');
}

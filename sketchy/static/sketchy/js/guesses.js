// "a" / "an" by leading vowel letter — correct for all Sketchy categories.
export function article(word) {
  return /^[aeiou]/i.test(String(word).trim()) ? 'an' : 'a';
}

import { pickLine, runnerUps } from './voice.js';

// Render the dialogue: spoken best-guess line into headlineEl, runner-up
// question-rows (with bars) into `container`.
export function renderGuesses(container, topk, { headlineEl, rng } = {}) {
  if (headlineEl) headlineEl.innerHTML = pickLine(topk, { rng });
  if (!container) return;
  const alts = runnerUps(topk, 2);
  container.innerHTML = alts.map((a) =>
    `<div class="sk-alt"><span class="sk-alt__q">…or ${article(a.label)} ${a.label}?</span>`
    + `<span class="sk-alt__track"><i style="width:${a.pct}%"></i></span>`
    + `<span class="sk-alt__pct">${a.pct}%</span></div>`).join('');
}

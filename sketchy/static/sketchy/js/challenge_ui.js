import { pickPrompts } from './prompts.js';
import { createRound, currentPrompt, isOver, isRecognized, recordResult } from './challenge.js';
import { roundTotal } from './scoring.js';
import { predictTopK } from './model.js';
import { renderGuesses } from './guesses.js';

const ROUND_SECONDS = 20;
const PROMPTS_PER_ROUND = 6;

export function startChallenge({ canvas, bundle, els, state, persist, lb }) {
  let round = createRound(pickPrompts(bundle.labels, PROMPTS_PER_ROUND), ROUND_SECONDS);
  let deadline = 0;
  let raf = 0;
  let advanceTimer = 0;
  let lastRun = 0;
  let topk = [];
  const promptWordEl = document.querySelector('.sk-prompt__word');
  const scoreEl = document.getElementById('sk-score');
  const fillEl = document.getElementById('sk-timer-fill');
  const secEl = document.getElementById('sk-timer-sec');

  function startPrompt() {
    canvas.clear();
    topk = [];
    renderGuesses(els.guesses, [], { headlineEl: els.headline });
    promptWordEl.textContent = (currentPrompt(round) || '').toUpperCase();
    deadline = performance.now() + ROUND_SECONDS * 1000;
    tick();
  }

  function secondsLeft() { return Math.max(0, (deadline - performance.now()) / 1000); }

  function tick() {
    const left = secondsLeft();
    fillEl.style.width = `${(left / ROUND_SECONDS) * 100}%`;
    secEl.textContent = `${Math.ceil(left)}s`;
    if (left <= 0) { timeout(); return; }
    raf = requestAnimationFrame(tick);
  }

  function onDraw(strokes) {
    if (!strokes || strokes.length === 0) return;
    const now = Date.now();
    if (now - lastRun < 80 || !bundle) return;
    lastRun = now;
    topk = predictTopK(bundle, strokes, 6);
    renderGuesses(els.guesses, topk, { headlineEl: els.headline });
    if (topk.length && isRecognized(topk[0].label, currentPrompt(round))) win();
  }

  function win() {
    cancelAnimationFrame(raf);
    round = recordResult(round, { won: true, secondsLeft: secondsLeft() });
    scoreEl.textContent = String(roundTotal(round.results));
    advance();
  }

  function timeout() {
    cancelAnimationFrame(raf);
    const sawGuess = topk.length ? topk[0].label : 'nothing';
    toast(`⏱ time! I was sure it was a <span class="sk-toast__word">${sawGuess}</span> 🤷 → next!`);
    round = recordResult(round, { won: false, secondsLeft: 0 });
    advance();
  }

  function skip() { cancelAnimationFrame(raf); round = recordResult(round, { won: false, secondsLeft: 0 }); advance(); }

  function advance() {
    if (isOver(round)) return finish();
    advanceTimer = setTimeout(startPrompt, 350);
  }

  function finish() {
    const total = roundTotal(round.results);
    const prevBest = state.bestPoints;
    if (total > prevBest) { state.bestPoints = total; persist(); }
    if (lb) lb.onRoundEnd();
    showRecap(round, total, total > prevBest);
  }

  function toast(html) {
    const t = document.getElementById('sk-toast');
    t.innerHTML = html; t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.hidden = true; }, 1900);
  }

  function showRecap(r, total, isBest) {
    const recap = document.getElementById('sk-recap');
    const rows = r.results.map((x) =>
      `<div class="sk-recap__row"><span>${x.target}</span>`
      + (x.won ? `<span class="ok">✓ +${x.points}</span>` : `<span class="no">✗ timed out +0</span>`)
      + `</div>`).join('');
    recap.innerHTML =
      `<div class="sk-recap__card"><div class="sk-recap__title">round over!</div>${rows}`
      + `<div class="sk-recap__total">${total} points</div>`
      + (isBest ? `<div class="sk-recap__hi">★ new personal best! ★</div>` : '')
      + `<div style="text-align:center;margin-top:14px"><button class="sk-chip" id="sk-again">Play again ↻</button></div></div>`;
    recap.hidden = false;
    document.getElementById('sk-again').addEventListener('click', () => {
      recap.hidden = true;
      round = createRound(pickPrompts(bundle.labels, PROMPTS_PER_ROUND), ROUND_SECONDS);
      scoreEl.textContent = '0';
      startPrompt();
    });
  }

  els.skip.onclick = skip;
  scoreEl.textContent = '0';
  startPrompt();

  return {
    onDraw,
    stop() { cancelAnimationFrame(raf); clearTimeout(advanceTimer); const r = document.getElementById('sk-recap'); if (r) r.hidden = true; els.skip.onclick = null; },
  };
}

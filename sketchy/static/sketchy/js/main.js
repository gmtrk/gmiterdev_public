import { createCanvas } from './canvas.js';
import { loadModel, predictTopK } from './model.js';
import { renderGuesses } from './guesses.js';
import { loadSave, persistSave } from './save.js';
import { setupLeaderboard } from './leaderboard.js';
import { startChallenge } from './challenge_ui.js';
import { mountEyes } from './eyes.js';
import { createGlitchEngine, applyBeat, readSignals, bumpVisit } from './glitch.js';

const state = loadSave();
const els = {
  canvas: document.getElementById('sk-canvas'),
  guesses: document.getElementById('sk-guesses'),
  headline: document.getElementById('sk-headline'),
  clear: document.getElementById('sk-clear'),
  modes: [...document.querySelectorAll('.sk-mode')],
  chhead: document.querySelector('.sk-chhead'),
  skip: document.getElementById('sk-skip'),
};

let bundle = null;        // { model, labels }
let mode = 'sandbox';
let lb = null;
let challenge = null;
let lastRun = 0;
let eyes = null;
let glitch = null;
let clearCount = 0;

// throttle: re-predict at most ~12/s while drawing
function scheduleSandboxPredict() {
  if (mode !== 'sandbox' || !bundle || !glitch) return;
  const now = Date.now();
  if (now - lastRun < 80) return;
  lastRun = now;
  const topk = predictTopK(bundle, canvas.getStrokes(), 6);
  renderGuesses(els.guesses, topk, { headlineEl: els.headline });
  const beat = glitch.roll({ signals: readSignals({ strokes: canvas.getStrokes(), clears: clearCount }) });
  if (beat) applyBeat(beat, {
    dialog: document.querySelector('.sk-dialog'),
    name: document.getElementById('sk-name'),
    headline: els.headline, eyes,
  });
}

const canvas = createCanvas(els.canvas, {
  onChange() {
    if (mode === 'sandbox') scheduleSandboxPredict();
    else if (challenge) challenge.onDraw(canvas.getStrokes());
  },
});

els.clear.addEventListener('click', () => {
  canvas.clear();
  clearCount += 1;
  if (mode === 'sandbox') renderGuesses(els.guesses, [], { headlineEl: els.headline });
});

function setMode(next) {
  // Challenge needs bundle.labels — ignore the click until the model has loaded.
  if (next === 'challenge' && !bundle) return;
  mode = next;
  els.modes.forEach((b) => b.classList.toggle('sk-mode--active', b.dataset.mode === next));
  els.chhead.hidden = next !== 'challenge';
  els.skip.hidden = next !== 'challenge';
  const railJoin = document.querySelector('.sk-lb-join');
  if (railJoin) railJoin.hidden = (next === 'challenge');
  canvas.clear();
  // Tear down any in-flight challenge before (re)entering a mode — re-clicking
  // "Challenge" must not spawn a second one with its own timers/RAF loop.
  if (challenge) { challenge.stop(); challenge = null; }
  if (next === 'sandbox') {
    renderGuesses(els.guesses, [], { headlineEl: els.headline });
  } else {
    challenge = startChallenge({ canvas, bundle, els, state, persist: () => persistSave(state), lb, glitch, eyes });
  }
}
els.modes.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

(async function init() {
  els.headline.textContent = 'loading the AI…';
  bundle = await loadModel();
  els.headline.textContent = 'draw something…';
  const loadingEl = document.getElementById('sk-loading');
  if (loadingEl) loadingEl.hidden = true;
  lb = setupLeaderboard(state, { persist: () => persistSave(state) });
  eyes = mountEyes(document.getElementById('sk-eyes'));
  bumpVisit();
  glitch = createGlitchEngine({});
})();

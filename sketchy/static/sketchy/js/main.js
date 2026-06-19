import { createCanvas } from './canvas.js';
import { loadModel, predictTopK } from './model.js';
import { renderGuesses } from './guesses.js';
import { loadSave, persistSave } from './save.js';
import { setupLeaderboard } from './leaderboard.js';
import { startChallenge } from './challenge_ui.js';

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

// throttle: re-predict at most ~12/s while drawing
function scheduleSandboxPredict() {
  if (mode !== 'sandbox' || !bundle) return;
  const now = Date.now();
  if (now - lastRun < 80) return;
  lastRun = now;
  const topk = predictTopK(bundle, canvas.getStrokes(), 6);
  renderGuesses(els.guesses, topk, { headlineEl: els.headline });
}

const canvas = createCanvas(els.canvas, {
  onChange() {
    if (mode === 'sandbox') scheduleSandboxPredict();
    else if (challenge) challenge.onDraw(canvas.getStrokes());
  },
});

els.clear.addEventListener('click', () => {
  canvas.clear();
  if (mode === 'sandbox') renderGuesses(els.guesses, [], { headlineEl: els.headline });
});

function setMode(next) {
  mode = next;
  els.modes.forEach((b) => b.classList.toggle('sk-mode--active', b.dataset.mode === next));
  els.chhead.hidden = next !== 'challenge';
  els.skip.hidden = next !== 'challenge';
  canvas.clear();
  if (next === 'sandbox') {
    if (challenge) { challenge.stop(); challenge = null; }
    renderGuesses(els.guesses, [], { headlineEl: els.headline });
  } else {
    challenge = startChallenge({ canvas, bundle, els, state, persist: () => persistSave(state), lb });
  }
}
els.modes.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

(async function init() {
  els.headline.textContent = 'loading the AI…';
  bundle = await loadModel();
  els.headline.textContent = 'draw something…';
  lb = setupLeaderboard(state, { persist: () => persistSave(state) });
})();

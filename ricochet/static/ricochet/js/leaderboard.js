// Ricochet leaderboard client: fetch top scores, initials modal, submit.
// Pure clampCores is node-tested; the DOM flow mirrors metaguess/game.js.
import { formatNumber } from './numfmt.js';

// Mirror the server-side HARD_MAX (= int(1e12), <= 2**53) so the client never
// submits a value the endpoint would reject as out-of-range.
export const LB_HARD_MAX = 1e12;

// Sanitize lifetime Cores into a safe integer in [0, LB_HARD_MAX] before submit.
export function clampCores(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v >= LB_HARD_MAX) return LB_HARD_MAX;
  return Math.floor(v);
}

function getCSRFToken() {
  const el = document.querySelector('[name=csrfmiddlewaretoken]');
  return el ? el.value : '';
}

// Fetch the top scores and render them into #rc-lb-table.
export function fetchHighScores() {
  return fetch('/ricochet/get-high-scores/')
    .then((r) => r.json())
    .then((data) => {
      const table = document.getElementById('rc-lb-table');
      if (table) {
        table.innerHTML = (Array.isArray(data) ? data : [])
          .map(
            (entry, i) =>
              `<div class="rc-lb__row"><span><span class="rc-lb__rank">${i + 1}</span><span class="rc-lb__ini">${entry.initials}</span></span><span class="rc-lb__pts">${formatNumber(entry.cores)}</span></div>`
          )
          .join('');
      }
      return Array.isArray(data) ? data : [];
    })
    .catch((err) => {
      console.error('Error fetching high scores:', err);
      return [];
    });
}

// Submit lifetime Cores. On success, set state.stats.lastSubmittedCores so the
// Big-Bang submit trigger won't re-offer the same score.
export function submitScore(state, initials) {
  const ini = String(initials).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(ini)) {
    alert('Please enter exactly 3 letters for initials.');
    return Promise.resolve(false);
  }
  const cores = clampCores(state.lifetimeCores); // NOT state.cores
  return fetch('/ricochet/add-high-score/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
    body: JSON.stringify({ initials: ini, cores }),
  })
    .then((r) => r.json())
    .then(() => {
      state.stats.lastSubmittedCores = state.lifetimeCores;
      return fetchHighScores().then(() => true);
    })
    .catch((err) => {
      console.error('Error submitting high score:', err);
      return false;
    });
}

// True when the player has unsubmitted lifetime Cores worth offering.
export function canSubmit(state) {
  return state.lifetimeCores > state.stats.lastSubmittedCores;
}

// Wire the leaderboard panel: refresh table, the manual "Submit to leaderboard"
// button, and the Big-Bang-modal submit offer (shown only when canSubmit).
export function setupLeaderboard(state) {
  fetchHighScores();
  const manualBtn = document.getElementById('rc-lb-submit-btn');
  const initialsInput = document.getElementById('rc-lb-initials');
  if (manualBtn && initialsInput) {
    manualBtn.addEventListener('click', () => {
      submitScore(state, initialsInput.value);
    });
  }
  return {
    // Called by the Big-Bang confirm modal (Phase 7) to decide whether to show
    // the in-modal "Submit to leaderboard" affordance.
    offerOnBigBang() {
      const offer = document.getElementById('rc-bigbang-submit');
      if (!offer) return;
      offer.classList.toggle('rc-hidden', !canSubmit(state));
    },
  };
}

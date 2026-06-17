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

// --- identity + eligibility (pure) --------------------------------------
export function isJoined(state) {
  return !!state.playerId;
}
export function canJoin(state) {
  return !state.playerId && Number(state.lifetimeCores) >= 1 && !state.debugUsed;
}
export function shouldAutoUpdate(state) {
  return isJoined(state) && !state.debugUsed && Number(state.lifetimeCores) >= 1;
}

// Stable per-browser id (UUID when available, else a timestamp+random fallback).
function genPlayerId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// POST the current lifetime Cores under the stored identity (player_id dedupes
// server-side). No-op if not joined.
export function submitScore(state) {
  if (!isJoined(state)) return Promise.resolve(false);
  const cores = clampCores(state.lifetimeCores); // NOT state.cores
  return fetch('/ricochet/add-high-score/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
    body: JSON.stringify({ initials: state.leaderboardInitials, cores, player_id: state.playerId }),
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

// One-time join: validate initials + eligibility, mint an id, submit, persist.
export function joinLeaderboard(state, initials, persist) {
  const ini = String(initials).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(ini)) {
    alert('Please enter exactly 3 letters for initials.');
    return Promise.resolve(false);
  }
  if (!canJoin(state)) return Promise.resolve(false);
  state.playerId = genPlayerId();
  state.leaderboardInitials = ini;
  if (persist) persist();
  return submitScore(state);
}

// Push current Cores if eligible (called on load + after each Big Bang).
export function maybeAutoUpdate(state) {
  if (!shouldAutoUpdate(state)) return Promise.resolve(false);
  return submitScore(state);
}

// Render the Scores-tab controls for the current state. els = {status, form, input, joinBtn}.
export function renderLeaderboardControls(state, els) {
  if (!els) return;
  const { status, form, input, joinBtn } = els;
  const showForm = (on) => { if (form) form.classList.toggle('rc-hidden', !on); };
  const setStatus = (msg) => {
    if (!status) return;
    status.textContent = msg || '';
    status.classList.toggle('rc-hidden', !msg);
  };
  if (state.debugUsed) {
    showForm(false);
    setStatus('🔒 Leaderboard disabled — debug mode was used on this save.');
  } else if (isJoined(state)) {
    showForm(false);
    setStatus(`On the board as ${state.leaderboardInitials} — auto-updates with your Cores.`);
  } else {
    showForm(true);
    setStatus('');
    const eligible = Number(state.lifetimeCores) >= 1;
    if (joinBtn) {
      joinBtn.disabled = !eligible;
      joinBtn.title = eligible ? '' : 'Earn a Core (Big Bang) to join';
    }
    if (input) input.disabled = !eligible;
  }
}

// Wire the leaderboard panel. deps = { persist }. Returns { refresh, onBigBang }.
export function setupLeaderboard(state, deps = {}) {
  const els = {
    status: document.getElementById('rc-lb-status'),
    form: document.getElementById('rc-lb-form'),
    input: document.getElementById('rc-lb-initials'),
    joinBtn: document.getElementById('rc-lb-submit-btn'),
  };
  fetchHighScores();
  maybeAutoUpdate(state);
  const refresh = () => renderLeaderboardControls(state, els);
  if (els.joinBtn && els.input) {
    els.joinBtn.addEventListener('click', () => {
      joinLeaderboard(state, els.input.value, deps.persist).then(() => refresh());
    });
  }
  refresh();
  return {
    refresh,
    onBigBang() { maybeAutoUpdate(state).then(() => refresh()); },
  };
}

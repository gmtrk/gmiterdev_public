const LB_HARD_MAX = 100000;

export function genPlayerId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function canJoin(state) {
  return !state.playerId && Number(state.bestPoints) >= 1;
}

export function clampPoints(n) {
  const v = Number(n);
  if (Number.isNaN(v) || v < 0) return 0;
  return Math.min(LB_HARD_MAX, Math.floor(v));
}

export function validInitials(s) {
  return /^[A-Z]{3}$/.test(String(s));
}

function getCSRFToken() {
  const el = document.querySelector('[name=csrfmiddlewaretoken]');
  return el ? el.value : '';
}

export function fetchHighScores() {
  return fetch('/sketchy/get-high-scores/')
    .then((r) => r.json())
    .then((data) => {
      const table = document.getElementById('sk-lb');
      if (table) {
        table.innerHTML = (Array.isArray(data) ? data : [])
          .map((e, i) => `<div class="sk-lb__row"><span><span class="sk-lb__rank">${i + 1}</span> ${e.initials}</span><span>${e.points}</span></div>`)
          .join('');
      }
      return Array.isArray(data) ? data : [];
    })
    .catch(() => []);
}

export function submitScore(state) {
  if (!state.playerId) return Promise.resolve(false);
  return fetch('/sketchy/add-high-score/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
    body: JSON.stringify({
      initials: state.initials,
      points: clampPoints(state.bestPoints),
      player_id: state.playerId,
    }),
  })
    .then((r) => { if (!r.ok) throw new Error(`add-high-score ${r.status}`); return r.json(); })
    .then(() => fetchHighScores().then(() => true))
    .catch((err) => { console.error(err); return false; });
}

export function joinLeaderboard(state, initials, persist) {
  const ini = String(initials).trim().toUpperCase();
  if (!validInitials(ini) || !canJoin(state)) return Promise.resolve(false);
  state.playerId = genPlayerId();
  state.initials = ini;
  if (persist) persist();
  return submitScore(state);
}

// Wire the Scores panel; returns { refresh, onRoundEnd }.
export function setupLeaderboard(state, deps = {}) {
  const input = document.getElementById('sk-lb-initials');
  const joinBtn = document.getElementById('sk-lb-join');
  const status = document.getElementById('sk-lb-status');
  const refresh = () => {
    if (!status) return;
    if (state.playerId) status.textContent = `on the board as ${state.initials} — auto-updating`;
    else if (canJoin(state)) status.textContent = 'join the board:';
    else status.textContent = 'play a round (earn ≥1 pt) to join';
    if (input) input.disabled = !canJoin(state);
    if (joinBtn) joinBtn.disabled = !canJoin(state);
  };
  fetchHighScores();
  if (state.playerId) submitScore(state);
  if (joinBtn && input) {
    joinBtn.addEventListener('click', () => {
      joinLeaderboard(state, input.value, deps.persist).then(refresh);
    });
  }
  refresh();
  return {
    refresh,
    onRoundEnd() { if (state.playerId) submitScore(state).then(refresh); else refresh(); },
  };
}

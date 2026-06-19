const KEY = 'sketchy.save';

export function defaultSave() {
  return { playerId: '', initials: '', bestPoints: 0 };
}

export function mergeSave(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const pts = Number(raw.bestPoints);
  return {
    playerId: typeof raw.playerId === 'string' ? raw.playerId : '',
    initials: typeof raw.initials === 'string' ? raw.initials : '',
    bestPoints: Number.isFinite(pts) && pts > 0 ? Math.floor(pts) : 0,
  };
}

export function loadSave() {
  try { return mergeSave(JSON.parse(localStorage.getItem(KEY))); }
  catch { return defaultSave(); }
}

export function persistSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      playerId: state.playerId, initials: state.initials, bestPoints: state.bestPoints,
    }));
  } catch { /* storage disabled — ignore */ }
}

// UI: HUD (throttled ~6Hz), Credits/Place shop rows, buy handler.
// buyUpgrade is pure (state transition); updateHUD/renderShop touch the DOM.
import { UPGRADES, CORES_UPGRADES } from './config.js';
import { upgradeCost, upgradeEffect } from './economy.js';
import { formatNumber } from './numfmt.js';

// Player-facing effect string for an upgrade at `level`. Unlock rows show no
// effect (the row uses OWNED/NEW). 'mul' → ×N.NN; 'add' → +N for integers, else
// the real fractional value (formatNumber floors < 1000, which hid 0.25/level as
// "+0" — this shows "+0.25"/"+1.5"/"+0.0025"). Pure + tested.
export function effectLabel(def, level) {
  if (def.unlock) return '';
  const eff = upgradeEffect(def, level);
  if (def.effectKind === 'mul') return '×' + eff.toFixed(2);
  if (eff === 0) return '+0';
  if (Number.isInteger(eff)) return '+' + formatNumber(eff);
  return '+' + String(Number(eff.toFixed(4)));
}

// --- Buying --------------------------------------------------------------
// Reads/writes state.credits (a JS number) and state.upgrades, then calls
// applyEffects(world, state) so derived world stats (budgets, mults, ...) catch
// up. Returns true on success, false if unaffordable / maxed / unknown.
export function buyUpgrade(world, state, id, applyEffects) {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) return false;
  const level = state.upgrades[id] || 0;
  if (def.max != null && level >= def.max) return false;
  const cost = upgradeCost(def, level);
  if (state.credits < cost) return false;
  state.credits -= cost;
  state.upgrades[id] = level + 1;
  applyEffects(world, state);
  return true;
}

// Look up an UPGRADES def by id and return it iff it is a special-unlock row
// (i.e. carries an `unlock` save-key). Returns undefined otherwise.
export function specialUnlockDef(id) {
  const def = UPGRADES.find((u) => u.id === id);
  return def && def.unlock ? def : undefined;
}

// Buy a one-shot special-ball unlock. Returns false (no mutation) when the id is
// not an unlock row, the type is already unlocked, or credits are insufficient.
// On success: debit credits, mark state.upgrades[id]=1 (so the shop row shows as
// maxed), call grantUnlock(type) — main.js passes unlockSpecialAndSeed so the
// pool flips unlocked + seeds its starter pack — and return true.
export function buySpecialUnlock(state, id, grantUnlock) {
  const def = specialUnlockDef(id);
  if (!def) return false;
  const type = def.unlock;
  const sp = state.specials && state.specials[type];
  if (sp && sp.unlocked) return false;
  const cost = upgradeCost(def, 0);
  if (state.credits < cost) return false;
  state.credits -= cost;
  state.upgrades[id] = 1;
  grantUnlock(type);
  return true;
}

// --- HUD ------------------------------------------------------------------
// Receives the HUD ADAPTER object (NOT world):
//   { credits, creditsPerSec, ballCount, capacity, comboBonus, comboCapBonus, ceiling }
// `els` is a map of DOM nodes resolved once at startup. Writes textContent only.
export function updateHUD(adapter, els) {
  els.credits.textContent = formatNumber(adapter.credits);
  els.creditsPerSec.textContent = formatNumber(adapter.creditsPerSec) + '/s';
  // Cores is an optional HUD node (some template variants omit it); guard it.
  if (els.cores) els.cores.textContent = formatNumber(adapter.cores);
  els.balls.textContent =
    formatNumber(adapter.ballCount) + ' / ' + formatNumber(adapter.capacity);
  els.saturation.textContent =
    Math.round((100 * adapter.ballCount) / Math.max(1, adapter.ceiling)) + '%';
  const comboMult = 1 + adapter.comboBonus;
  els.combo.textContent = '×' + comboMult.toFixed(1);
}

// --- Quality toggle -------------------------------------------------------
// Wire the "Low quality (perf)" checkbox (#quality-toggle). Sets the box to the
// initial state, then calls onChange(checked) whenever the user toggles it.
// No-op if the control is absent (headless / template variant).
export function setupQualityToggle(onChange, initial) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('quality-toggle');
  if (!el) return;
  el.checked = !!initial;
  el.addEventListener('change', () => { onChange(el.checked); });
}

// --- Modal ----------------------------------------------------------------
// Minimal confirm/notice modal. Builds (once) a single overlay element and
// reuses it. Accepts { title, body, confirmLabel, cancelLabel, onConfirm }.
// `body` may contain newlines (rendered as <br>). The cancel button is shown
// only when `cancelLabel` is provided. Returns nothing; clicking confirm runs
// onConfirm() (if any) then closes; clicking cancel / backdrop just closes.
let _modalEl = null;
export function showModal({ title, body, confirmLabel = 'OK', cancelLabel, onConfirm } = {}) {
  if (typeof document === 'undefined') return; // headless guard (tests)
  if (!_modalEl) {
    _modalEl = document.createElement('div');
    _modalEl.className = 'rc-modal';
    _modalEl.hidden = true;
    document.body.append(_modalEl);
  }
  const el = _modalEl;
  el.replaceChildren();

  const backdrop = document.createElement('div');
  backdrop.className = 'rc-modal__backdrop';

  const card = document.createElement('div');
  card.className = 'rc-modal__card';

  const h = document.createElement('h2');
  h.className = 'rc-modal__title';
  h.textContent = title || '';

  const p = document.createElement('p');
  p.className = 'rc-modal__body';
  const lines = String(body || '').split('\n');
  lines.forEach((line, i) => {
    if (i > 0) p.append(document.createElement('br'));
    p.append(document.createTextNode(line));
  });

  const actions = document.createElement('div');
  actions.className = 'rc-modal__actions';

  const close = () => { el.hidden = true; el.replaceChildren(); };

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'rc-modal__confirm';
  confirm.textContent = confirmLabel;
  confirm.addEventListener('click', () => { close(); if (onConfirm) onConfirm(); });

  actions.append(confirm);

  if (cancelLabel) {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'rc-modal__cancel';
    cancel.textContent = cancelLabel;
    cancel.addEventListener('click', close);
    actions.append(cancel);
  }

  backdrop.addEventListener('click', close);
  card.append(h, p, actions);
  el.append(backdrop, card);
  el.hidden = false;
}

// Pure per-row view-model for the Credits shop — one entry per UPGRADES def.
// renderShop builds the row DOM once and updates it from this model, so the
// 500ms affordability refresh never tears down the button under the cursor.
export function creditsRowModel(state) {
  return UPGRADES.map((def) => {
    const level = state.upgrades[def.id] || 0;
    const isUnlock = !!def.unlock;
    const unlocked = isUnlock && state.specials && state.specials[def.unlock] && state.specials[def.unlock].unlocked;
    const maxed = unlocked || (def.max != null && level >= def.max);
    const cost = upgradeCost(def, level);
    const afford = !maxed && state.credits >= cost;
    return {
      id: def.id,
      group: def.group || '',
      isUnlock,
      label: isUnlock ? def.label : def.label + ' (Lv ' + level + ')',
      effectText: isUnlock ? (unlocked ? 'OWNED' : 'NEW') : effectLabel(def, level),
      costText: maxed ? (isUnlock ? 'OWNED' : 'MAX') : (afford ? 'BUY ' + formatNumber(cost) : formatNumber(cost)),
      afford,
      maxed,
      desc: def.desc || '',
    };
  });
}

// --- Credits shop ---------------------------------------------------------
// Render rows for the requested tab into `container`. `onBuy(id)` is the click
// handler the caller wires (it calls buyUpgrade + refreshes). Affordable rows
// get the 'rc-row--afford' class.
export function renderShop(tab, { container, state, onBuy, rows }) {
  if (tab === 'cores') {
    // Cores tab: render the pure coresShopRows model. `rows` is coresShopRows(state)
    // (which already encodes affordability against state.cores); `onBuy(id)` routes
    // to buyCoresUpgrade.
    container.replaceChildren();
    for (const r of rows) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'rc-row' + (r.affordable ? ' rc-row--afford' : '');
      row.disabled = r.maxed;
      row.dataset.upgradeId = r.id;
      row.dataset.group = r.group;

      const label = document.createElement('span');
      label.className = 'rc-row__label';
      label.textContent = r.label + ' (Lv ' + r.level + ')';

      const price = document.createElement('span');
      price.className = 'rc-row__cost';
      price.textContent = r.maxed ? 'MAX' : formatNumber(r.cost) + ' ★';

      row.append(label, price);
      row.addEventListener('click', () => onBuy(r.id));
      container.append(row);
    }
    return;
  }
  if (tab !== 'credits') return;
  const model = creditsRowModel(state);
  if (!container._rcRows) {
    // First render: build the row buttons once and cache them by id.
    container.replaceChildren();
    container._rcRows = {};
    for (const r of model) {
      const row = document.createElement('button');
      row.type = 'button';
      row.dataset.upgradeId = r.id;
      if (r.group) row.dataset.group = r.group;
      const label = document.createElement('span');
      label.className = 'rc-row__label';
      const effect = document.createElement('span');
      effect.className = 'rc-row__effect';
      const price = document.createElement('span');
      price.className = 'rc-row__cost';
      row.append(label, effect, price);
      row.addEventListener('click', () => onBuy(r.id));
      container.append(row);
      container._rcRows[r.id] = { row, label, effect, price };
    }
  }
  // Update every row's volatile state in place (no DOM teardown).
  for (const r of model) {
    const refs = container._rcRows[r.id];
    if (!refs) continue;
    refs.row.className = 'rc-row' + (r.afford ? ' rc-row--afford' : '');
    refs.row.disabled = r.maxed;
    refs.label.textContent = r.label;
    refs.effect.textContent = r.effectText;
    refs.price.textContent = r.costText;
  }
  return;
}

// --- Cores shop -----------------------------------------------------------
// Pure row model for the Cores tab. One row per CORES_UPGRADES entry, carrying its
// group (power/headstart/unlocks/offline), current level, next-level cost, whether
// it's maxed, and whether it's affordable against state.cores. The renderShop('cores')
// DOM builder consumes these rows. Exported per the integration contract so Phase 7
// can import it (MUST-HONOR: authored & exported here before use).
export function coresShopRows(state) {
  return CORES_UPGRADES.map((def) => {
    const level = (state.coresShop && state.coresShop[def.id]) || 0;
    const maxed = def.max != null && level >= def.max;
    const cost = upgradeCost(def, level);
    const affordable = !maxed && state.cores >= cost;
    return {
      id: def.id,
      label: def.label,
      group: def.group,
      level,
      cost,
      maxed,
      affordable,
    };
  });
}

// --- Stat-card export -----------------------------------------------------
// Build the four headline lines for the stat-card. Peak combo is shown as the
// player-facing multiplier (comboMult = 1 + comboBonus). Pure + node-tested.
export function statCardLines(stats) {
  const cores = formatNumber(stats.lifetimeCores || 0);
  const combo = 1 + (stats.peakCombo || 0);
  const balls = formatNumber(stats.biggestBallCount || 0);
  const earnings = formatNumber(stats.runEarnings || 0);
  return [
    `Lifetime Cores  ${cores}`,
    `Peak Combo  x${combo}`,
    `Most Balls  ${balls}`,
    `Run Earnings  ${earnings}`,
  ];
}

// Render a shareable stat-card: the live arena snapshot + headline numbers +
// the gmiter•dev wordmark, then download or copy it. `arenaCanvas` is the live
// game canvas; `stats` is the headline-numbers object (see statCardLines).
// `palette` is the live view.PALETTE object (lowercase keys: bg/ballCyan/peg).
export function exportStatCard(arenaCanvas, stats, palette, mode = 'download') {
  const W = 900;
  const H = 1200;
  const card = document.createElement('canvas');
  card.width = W;
  card.height = H;
  const ctx = card.getContext('2d');

  // Background.
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  // Arena snapshot (scaled to fit the upper region, preserving aspect ratio).
  const pad = 40;
  const arenaMaxW = W - pad * 2;
  const arenaMaxH = 760;
  const scale = Math.min(arenaMaxW / arenaCanvas.width, arenaMaxH / arenaCanvas.height);
  const aw = arenaCanvas.width * scale;
  const ah = arenaCanvas.height * scale;
  ctx.drawImage(arenaCanvas, (W - aw) / 2, pad, aw, ah);

  // Headline numbers.
  const lines = statCardLines(stats);
  ctx.textAlign = 'center';
  ctx.fillStyle = palette.ballCyan;
  ctx.font = "bold 38px 'Courier New', monospace";
  let y = pad + arenaMaxH + 70;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += 56;
  }

  // gmiter•dev wordmark.
  ctx.fillStyle = palette.peg;
  ctx.font = "bold 30px 'Courier New', monospace";
  ctx.fillText('gmiter•dev', W / 2, H - 36);

  if (mode === 'copy' && navigator.clipboard && window.ClipboardItem) {
    card.toBlob((blob) => {
      navigator.clipboard
        .write([new window.ClipboardItem({ 'image/png': blob })])
        .catch((err) => console.error('Stat-card copy failed:', err));
    });
    return card;
  }

  // Default: download.
  const link = document.createElement('a');
  link.download = 'ricochet-stat-card.png';
  link.href = card.toDataURL('image/png');
  link.click();
  return card;
}

// UI: HUD (throttled ~6Hz), Credits/Place shop rows, buy handler.
// buyUpgrade is pure (state transition); updateHUD/renderShop touch the DOM.
import { UPGRADES, CORES_UPGRADES } from './config.js';
import { upgradeCost, upgradeEffect } from './economy.js';
import { formatNumber } from './numfmt.js';

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

// --- HUD ------------------------------------------------------------------
// Receives the HUD ADAPTER object (NOT world):
//   { credits, creditsPerSec, ballCount, capacity, comboBonus, comboCapBonus, ceiling }
// `els` is a map of DOM nodes resolved once at startup. Writes textContent only.
export function updateHUD(adapter, els) {
  els.credits.textContent = formatNumber(adapter.credits);
  els.creditsPerSec.textContent = formatNumber(adapter.creditsPerSec) + '/s';
  els.balls.textContent =
    formatNumber(adapter.ballCount) + ' / ' + formatNumber(adapter.capacity);
  els.saturation.textContent =
    Math.round((100 * adapter.ballCount) / Math.max(1, adapter.ceiling)) + '%';
  const comboMult = 1 + adapter.comboBonus;
  els.combo.textContent = '×' + comboMult.toFixed(1);
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

// --- Credits shop ---------------------------------------------------------
// Render rows for the requested tab into `container`. `onBuy(id)` is the click
// handler the caller wires (it calls buyUpgrade + refreshes). Affordable rows
// get the 'rc-row--afford' class.
export function renderShop(tab, { container, state, onBuy, rows, cores }) {
  if (tab === 'cores') {
    // Cores tab: render the pure coresShopRows model. `rows` is coresShopRows(state),
    // `cores` is the spendable balance, `onBuy(id)` routes to buyCoresUpgrade.
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
  container.replaceChildren();
  for (const def of UPGRADES) {
    const level = state.upgrades[def.id] || 0;
    const maxed = def.max != null && level >= def.max;
    const cost = upgradeCost(def, level);
    const afford = !maxed && state.credits >= cost;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'rc-row' + (afford ? ' rc-row--afford' : '');
    row.disabled = maxed;
    row.dataset.upgradeId = def.id;

    const label = document.createElement('span');
    label.className = 'rc-row__label';
    label.textContent = def.label + ' (Lv ' + level + ')';

    const effect = document.createElement('span');
    effect.className = 'rc-row__effect';
    const eff = upgradeEffect(def, level);
    effect.textContent =
      def.effectKind === 'mul'
        ? '×' + eff.toFixed(2)
        : '+' + formatNumber(eff);

    const price = document.createElement('span');
    price.className = 'rc-row__cost';
    price.textContent = maxed ? 'MAX' : formatNumber(cost);

    row.append(label, effect, price);
    row.addEventListener('click', () => onBuy(def.id));
    container.append(row);
  }
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

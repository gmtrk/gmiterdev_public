// UI: HUD (throttled ~6Hz), Credits/Place shop rows, buy handler.
// buyUpgrade is pure (state transition); updateHUD/renderShop touch the DOM.
import { UPGRADES } from './config.js';
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

// --- Credits shop ---------------------------------------------------------
// Render rows for the requested tab into `container`. `onBuy(id)` is the click
// handler the caller wires (it calls buyUpgrade + refreshes). Affordable rows
// get the 'rc-row--afford' class.
export function renderShop(tab, { container, state, onBuy }) {
  if (tab !== 'credits') return; // Cores tab is authored in Phase 7
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

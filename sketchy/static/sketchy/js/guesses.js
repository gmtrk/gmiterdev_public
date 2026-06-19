// Render top-k guesses as labeled confidence bars + an optional headline.
export function renderGuesses(container, topk, { headlineEl } = {}) {
  if (!container) return;
  container.innerHTML = topk.map((g) => {
    const pct = Math.round(g.prob * 100);
    return `<div class="sk-g"><div class="sk-g__lab"><span>${g.label}</span><span>${pct}%</span></div>`
      + `<div class="sk-bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
  if (headlineEl) {
    headlineEl.textContent = topk.length ? `i think it's a ${topk[0].label}` : 'draw something…';
  }
}

export function createPredictions(container) {
  const fills = [];
  const texts = [];
  const rows = [];
  for (let i = 0; i < 10; i++) {
    fills[i] = container.querySelector(`[data-pred="${i}"]`);
    texts[i] = container.querySelector(`[data-pred-text="${i}"]`);
    rows[i] = container.querySelector(`[data-pred-row="${i}"]`);
  }

  function render({ data }) {
    let top = 0;
    for (let i = 1; i < 10; i++) if (data[i] > data[top]) top = i;
    for (let i = 0; i < 10; i++) {
      const pct = (data[i] * 100).toFixed(1);
      fills[i].style.width = pct + '%';
      texts[i].textContent = pct + '%';
      rows[i].classList.toggle('is-winner', i === top);
    }
  }

  function reset() {
    for (let i = 0; i < 10; i++) {
      fills[i].style.width = '0%';
      texts[i].textContent = '0%';
      rows[i].classList.remove('is-winner');
    }
  }

  return { render, reset };
}

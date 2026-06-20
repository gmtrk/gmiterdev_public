// glitch.js — the uncanny engine. Pure decision core (roll/cooldown/guarantee,
// FLAT probability + mild time ramp) is unit-tested; the DOM effects are thin,
// each guarded so a thrown effect can never wedge the guess loop.

const EFFECTS = ['rgb', 'corrupt', 'scramble', 'eyes', 'shake', 'spasm'];

// "she knows" lines, each tagged with the client-side-only signal it needs.
// Nothing here is ever sent to the server.
const KNOWS = [
  { sig: 'firstStroke', line: () => `you always draw a cat first. everyone does.` },
  { sig: 'clock', line: (s) => `it's ${s.clock} where you are. shouldn't you be asleep?` },
  { sig: 'clears', line: (s) => `you've cleared the canvas ${s.clears} times. hiding something?` },
  { sig: 'visits', line: (s) => `back again? that's your ${s.visits}${ord(s.visits)} visit.` },
  { sig: 'idle', line: () => `i can see the cursor even when you're not drawing.` },
  { sig: 'browser', line: (s) => `so it's ${s.browser}. figures.` },
];
function ord(n) { const v = n % 100; if (v >= 11 && v <= 13) return 'th'; return ['th','st','nd','rd'][Math.min(n % 10, 4)] || 'th'; }

export function createGlitchEngine({ rng = Math.random, now = Date.now,
  baseP = 0.005, rampPerMin = 0.0015, cooldown = 200, guaranteeMs = 150000 } = {}) {
  const start = now();
  let cd = 0, fired = false;
  return {
    get fired() { return fired; },
    sinceStart() { return now() - start; },
    roll(ctx = {}) {
      if (cd > 0) { cd -= 1; return null; }
      const mins = (now() - start) / 60000;
      const p = Math.min(0.05, baseP + rampPerMin * mins);
      const force = !fired && (now() - start) >= guaranteeMs;
      if (!force && rng() >= p) return null;
      fired = true; cd = cooldown;
      const effect = EFFECTS[Math.floor(rng() * EFFECTS.length) % EFFECTS.length];
      const signals = ctx.signals || {};
      const avail = KNOWS.filter((k) => signals[k.sig] != null && signals[k.sig] !== false);
      const line = avail.length ? avail[Math.floor(rng() * avail.length) % avail.length].line(signals) : null;
      return { effect, line };
    },
  };
}

// Thin DOM effects. ctx = { dialog, name, headline, eyes }. Each guarded.
export function applyBeat(beat, ctx) {
  if (!beat) return;
  try {
    const { dialog, name, headline, eyes } = ctx;
    if (beat.line && headline) {
      const prev = headline.innerHTML;
      const html = `<span class="sk-gl-mono">${beat.line}</span>`;
      headline.innerHTML = html;
      // a beat is transient: snap back to the normal line after ~1.9s (unless
      // the dialogue changed meanwhile, e.g. a new top guess re-rendered it).
      setTimeout(() => { if (headline.innerHTML === html) headline.innerHTML = prev; }, 1900);
    }
    switch (beat.effect) {
      case 'rgb': flashClass(headline, 'sk-gl-rgb', 1600); break;
      case 'corrupt': if (headline) headline.classList.add('sk-gl-mono'),
        setTimeout(() => headline.classList.remove('sk-gl-mono'), 1600); break;
      case 'scramble': flashClass(name, 'sk-gl-scramble', 1400, () => {
        const o = name.textContent; name.textContent = '?̷?̴y̸?̷';
        setTimeout(() => { name.textContent = o; }, 1400);
      }); break;
      case 'eyes': if (eyes && eyes.stare) eyes.stare(); break;
      case 'shake': flashClass(dialog, 'sk-gl-shake', 1200); addScanline(dialog); break;
      case 'spasm': spasm(ctx); break;
    }
  } catch (_) { /* effects must never break the guess loop */ }
}
function flashClass(el, cls, ms, also) { if (!el) return; el.classList.add(cls); if (also) also(); setTimeout(() => el.classList.remove(cls), ms); }
function addScanline(parent) {
  if (!parent) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const s = document.createElement('div'); s.className = 'sk-scanline';
  parent.appendChild(s); setTimeout(() => s.remove(), 1100);
}
function spasm(ctx) {
  const bars = ctx.dialog ? ctx.dialog.querySelectorAll('.sk-alt__track > i') : [];
  bars.forEach((b) => { const o = b.style.width; let n = 0;
    const id = setInterval(() => { b.style.width = `${Math.floor(Math.random() * 100)}%`; if (++n > 6) { clearInterval(id); b.style.width = o; } }, 70); });
}

// Build the client-side-only signal bag (no network, no PII leaves the browser).
export function readSignals({ strokes, clears, idle } = {}) {
  const s = {};
  if (strokes != null && strokes.length === 1) s.firstStroke = true;
  if (clears != null) s.clears = clears;
  if (idle) s.idle = true;
  try {
    const d = new Date();
    s.clock = `${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')}${d.getHours() < 12 ? 'am' : 'pm'}`;
    const key = 'sketchy:visits';
    const v = (parseInt(localStorage.getItem(key) || '0', 10) || 0);
    if (v > 1) s.visits = v;
    const ua = navigator.userAgent;
    s.browser = /edg/i.test(ua) ? 'Edge' : /chrome/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : null;
    if (!s.browser) delete s.browser;
  } catch (_) { /* private mode / no storage — skip those signals */ }
  return s;
}

// Bump the visit counter once per page load (call from main.js init).
export function bumpVisit() {
  try { const k = 'sketchy:visits'; localStorage.setItem(k, String((parseInt(localStorage.getItem(k) || '0', 10) || 0) + 1)); } catch (_) {}
}

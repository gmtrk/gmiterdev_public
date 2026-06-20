// eyes.js — the "presence": anime watching-eyes that track the cursor and can
// snap into a dead-front red stare (an uncanny beat). The pupil math is a pure
// helper (pupilOffset) for unit testing; the rest is thin DOM/SVG.

// Pure: clamp a viewBox-unit delta to a max radius (keeps the iris inside the eye).
export function pupilOffset(dxVB, dyVB, maxR) {
  const d = Math.hypot(dxVB, dyVB) || 1;
  const k = Math.min(maxR, d) / d;
  return { x: dxVB * k, y: dyVB * k };
}

const SVG = `
<svg viewBox="0 0 300 150" class="sk-eyesvg" aria-hidden="true">
  <defs>
    <radialGradient id="sk-irisG" cx="50%" cy="68%" r="62%">
      <stop offset="0%" stop-color="#d3ecff"/><stop offset="34%" stop-color="#5fabef"/>
      <stop offset="72%" stop-color="#2a6cc9"/><stop offset="100%" stop-color="#123a7e"/></radialGradient>
    <radialGradient id="sk-irisR" cx="50%" cy="68%" r="62%">
      <stop offset="0%" stop-color="#ffd6e3"/><stop offset="34%" stop-color="#ff5683"/>
      <stop offset="72%" stop-color="#cf1248"/><stop offset="100%" stop-color="#6e0c2a"/></radialGradient>
    <radialGradient id="sk-lid" cx="50%" cy="0%" r="90%">
      <stop offset="0%" stop-color="#06203a" stop-opacity=".5"/>
      <stop offset="55%" stop-color="#06203a" stop-opacity="0"/></radialGradient>
    <clipPath id="sk-clipL"><path d="M48,79 C62,45 114,45 128,79 C112,109 64,109 48,79 Z"/></clipPath>
    <clipPath id="sk-clipR"><path d="M132,79 C146,45 198,45 212,79 C196,109 148,109 132,79 Z"/></clipPath>
  </defs>
  <g transform="translate(20,0)">
    <g transform="translate(-34,0)">
      <path d="M48,79 C62,45 114,45 128,79 C112,109 64,109 48,79 Z" fill="#fbffff"/>
      <g clip-path="url(#sk-clipL)">
        <g class="sk-mover" data-eye="l"><g transform="translate(88,80) scale(0.78) translate(-88,-80)">
          <ellipse class="sk-iris" cx="88" cy="80" rx="31" ry="33"/>
          <ellipse class="sk-ring" cx="88" cy="80" rx="31" ry="33" fill="none" stroke-width="3" opacity=".55"/>
          <ellipse cx="88" cy="98" rx="19" ry="9" fill="#eaf3ff" opacity=".4"/>
          <ellipse class="sk-pup" cx="88" cy="82" rx="12.5" ry="15" fill="#130c10"/>
          <ellipse class="sk-hl" cx="76" cy="66" rx="9.5" ry="12" fill="#fff" transform="rotate(-20 76 66)"/>
          <circle class="sk-hl" cx="99" cy="92" r="4.5" fill="#fff"/>
          <circle class="sk-hl" cx="70" cy="58" r="2.2" fill="#fff"/>
        </g></g>
        <path d="M48,79 C62,45 114,45 128,79 C120,58 56,58 48,79 Z" fill="url(#sk-lid)"/>
      </g>
      <path d="M48,79 C62,45 114,45 128,79 C110,60.8 66,60.8 48,79 Z" fill="#1f0f19"/>
      <path d="M48,79 L30,72 L51,81 Z" fill="#1f0f19"/>
      <path d="M55,71 L46,60 L61,76 Z" fill="#1f0f19"/>
    </g>
    <g transform="translate(34,0)">
      <path d="M132,79 C146,45 198,45 212,79 C196,109 148,109 132,79 Z" fill="#fbffff"/>
      <g clip-path="url(#sk-clipR)">
        <g class="sk-mover" data-eye="r"><g transform="translate(172,80) scale(0.78) translate(-172,-80)">
          <ellipse class="sk-iris" cx="172" cy="80" rx="31" ry="33"/>
          <ellipse class="sk-ring" cx="172" cy="80" rx="31" ry="33" fill="none" stroke-width="3" opacity=".55"/>
          <ellipse cx="172" cy="98" rx="19" ry="9" fill="#eaf3ff" opacity=".4"/>
          <ellipse class="sk-pup" cx="172" cy="82" rx="12.5" ry="15" fill="#130c10"/>
          <ellipse class="sk-hl" cx="160" cy="66" rx="9.5" ry="12" fill="#fff" transform="rotate(-20 160 66)"/>
          <circle class="sk-hl" cx="183" cy="92" r="4.5" fill="#fff"/>
          <circle class="sk-hl" cx="154" cy="58" r="2.2" fill="#fff"/>
        </g></g>
        <path d="M132,79 C146,45 198,45 212,79 C204,58 140,58 132,79 Z" fill="url(#sk-lid)"/>
      </g>
      <path d="M132,79 C146,45 198,45 212,79 C194,60.8 150,60.8 132,79 Z" fill="#1f0f19"/>
      <path d="M212,79 L230,72 L209,81 Z" fill="#1f0f19"/>
      <path d="M205,71 L214,60 L199,76 Z" fill="#1f0f19"/>
    </g>
  </g>
</svg>`;

export function mountEyes(host) {
  if (!host) return { stare() {}, destroy() {} };
  host.innerHTML = SVG;
  const svg = host.querySelector('svg');
  const movers = [
    { g: svg.querySelector('[data-eye="l"]'), cx: 74 },
    { g: svg.querySelector('[data-eye="r"]'), cx: 226 },
  ];
  const VBW = 300, VBH = 150, maxR = 7, EY = 80;
  let staring = false, timer = 0;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function onMove(ev) {
    if (staring) return;
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const sx = VBW / r.width, sy = VBH / r.height;
    movers.forEach((m) => {
      const ecx = r.left + (m.cx / VBW) * r.width;
      const ecy = r.top + (EY / VBH) * r.height;
      const o = pupilOffset((ev.clientX - ecx) * sx, (ev.clientY - ecy) * sy, maxR);
      m.g.setAttribute('transform', `translate(${o.x.toFixed(1)},${o.y.toFixed(1)})`);
    });
  }
  window.addEventListener('mousemove', onMove);

  function stare() {
    if (staring || reduce) return;
    staring = true;
    movers.forEach((m) => m.g.setAttribute('transform', 'translate(0,0)'));
    svg.classList.add('sk-staring');
    clearTimeout(timer);
    timer = setTimeout(() => { staring = false; svg.classList.remove('sk-staring'); }, 1600);
  }

  return {
    stare,
    destroy() { window.removeEventListener('mousemove', onMove); clearTimeout(timer); },
  };
}

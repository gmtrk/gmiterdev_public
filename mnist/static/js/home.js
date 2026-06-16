// Typewriter for the home-page dialogue box. Skippable; respects reduced motion.
(function () {
  var el = document.getElementById("ud-lines");
  if (!el) return;

  var script = [
    "* hi! my name is JAKUB.\n",
    "* i'm a software engineer who\n  loves building little things.\n",
    "* welcome to my website!\n",
    "* pick something below to play."
  ];
  var full = script.join("");
  function render(s) { return s.replace(/JAKUB/g, "<b>JAKUB</b>"); }
  var caret = '<span class="ud-caret">_</span>';

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { el.innerHTML = render(full); return; }

  var li = 0, ci = 0, buf = "", done = false, timer = null;
  function finish() {
    done = true;
    if (timer) clearTimeout(timer);
    el.innerHTML = render(full) + caret;
  }
  function tick() {
    if (done) return;
    if (li >= script.length) { el.innerHTML = render(buf) + caret; return; }
    var line = script[li];
    if (ci < line.length) {
      buf += line[ci++];
      el.innerHTML = render(buf) + caret;
      timer = setTimeout(tick, line[ci - 1] === "\n" ? 180 : 34);
    } else { li++; ci = 0; timer = setTimeout(tick, 320); }
  }
  // click anywhere or press a key to skip to the end
  document.addEventListener("click", function () { if (!done) finish(); });
  document.addEventListener("keydown", function () { if (!done) finish(); });
  tick();
})();

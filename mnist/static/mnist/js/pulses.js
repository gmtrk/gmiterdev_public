// Collects the .nn-pulse dots inside [data-connector] elements and re-fires their
// one-shot CSS animation on demand.
export function createPulses(root = document) {
  const dots = Array.from(root.querySelectorAll('[data-connector] .nn-pulse'));

  function fire() {
    dots.forEach((dot, i) => {
      dot.classList.remove('run');
      void dot.offsetWidth; // force reflow so the animation can restart
      dot.style.animationDelay = `${i * 60}ms`;
      dot.classList.add('run');
    });
  }

  return { fire };
}

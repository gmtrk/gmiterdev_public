const SIZE = 28;   // native MNIST resolution
const BRUSH = 2;   // 2x2 pixel brush

export function createDrawCanvas(canvas, onDraw) {
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = 'white';

  let drawing = false;

  function coords(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor((event.clientX - rect.left) * (SIZE / rect.width)),
      y: Math.floor((event.clientY - rect.top) * (SIZE / rect.height)),
    };
  }

  function brush(x, y) {
    for (let i = 0; i < BRUSH; i++) {
      for (let j = 0; j < BRUSH; j++) {
        ctx.fillRect(Math.min(x + i, SIZE - 1), Math.min(y + j, SIZE - 1), 1, 1);
      }
    }
  }

  function start(e) {
    drawing = true;
    const { x, y } = coords(e);
    brush(x, y);
    onDraw();
  }
  function move(e) {
    if (!drawing) return;
    const { x, y } = coords(e);
    brush(x, y);
    onDraw();
  }
  function stop() {
    if (drawing) onDraw();
    drawing = false;
  }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', stop);
  canvas.addEventListener('mouseout', stop);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); start(e.touches[0]); });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); move(e.touches[0]); });
  canvas.addEventListener('touchend', (e) => { e.preventDefault(); stop(); });

  return {
    getImageData: () => ctx.getImageData(0, 0, SIZE, SIZE),
    clear() {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = 'white';
    },
  };
}

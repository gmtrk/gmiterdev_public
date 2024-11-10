let model;
let isDrawing = false;
let context;
const CANVAS_SIZE = 28; // Native MNIST size
const DISPLAY_SCALE = 14; // Increased scale factor for larger display
const BRUSH_SIZE = 2; // 2x2 pixel brush

async function loadModel() {
    try {
        model = await tf.loadLayersModel('/static/mnist/model/model.json');
        console.log('Model loaded successfully');
    } catch (error) {
        console.error('Error loading model:', error);
    }
}

function initializeCanvas() {
    const canvas = document.getElementById('drawingCanvas');

    // Set displayed size (scaled up)
    canvas.style.width = `${CANVAS_SIZE * DISPLAY_SCALE}px`;
    canvas.style.height = `${CANVAS_SIZE * DISPLAY_SCALE}px`;

    // Set actual canvas size
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    context = canvas.getContext('2d');

    // Set black background for MNIST compatibility
    context.fillStyle = 'black';
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Set drawing style to white
    context.strokeStyle = 'white';
    context.fillStyle = 'white';

    // Mouse events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Touch events
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startDrawing(e.touches[0]);
    });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        draw(e.touches[0]);
    });
    canvas.addEventListener('touchend', stopDrawing);

    // Clear button
    document.getElementById('clearButton').addEventListener('click', clearCanvas);
}

function getCanvasCoordinates(event) {
    const rect = event.target.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;

    return {
        x: Math.floor((event.clientX - rect.left) * scaleX),
        y: Math.floor((event.clientY - rect.top) * scaleY)
    };
}

function draw2x2Pixel(x, y) {
    for (let i = 0; i < BRUSH_SIZE; i++) {
        for (let j = 0; j < BRUSH_SIZE; j++) {
            const pixelX = Math.min(x + i, CANVAS_SIZE - 1);
            const pixelY = Math.min(y + j, CANVAS_SIZE - 1);
            context.fillRect(pixelX, pixelY, 1, 1);
        }
    }
}

function startDrawing(event) {
    isDrawing = true;
    const coords = getCanvasCoordinates(event);
    draw2x2Pixel(coords.x, coords.y);
}

function draw(event) {
    if (!isDrawing) return;

    const coords = getCanvasCoordinates(event);
    draw2x2Pixel(coords.x, coords.y);

    // Use requestAnimationFrame for smoother predictions
    requestAnimationFrame(predict);
}

function stopDrawing() {
    isDrawing = false;
}

function clearCanvas() {
    // Reset to black background
    context.fillStyle = 'black';
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    context.fillStyle = 'white'; // Reset to white for drawing

    // Reset predictions
    for (let i = 0; i < 10; i++) {
        document.getElementById(`pred${i}`).style.width = '0%';
        document.getElementById(`pred${i}Text`).textContent = '0%';
    }
}

function debugModelInput() {
    const imageData = context.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const pixels = new Uint8Array(imageData.data.buffer);
    console.log('Sample pixels:', pixels.slice(0, 20));

    // Create a temporary canvas to display the processed image
    const debugCanvas = document.createElement('canvas');
    debugCanvas.width = CANVAS_SIZE;
    debugCanvas.height = CANVAS_SIZE;
    const debugCtx = debugCanvas.getContext('2d');
    debugCtx.putImageData(imageData, 0, 0);

    // Log data URL to see actual input
    console.log('Debug image:', debugCanvas.toDataURL());
}

async function predict() {
    if (!model) return;

    // Get canvas data and normalize
    const imageData = context.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    let input = tf.browser.fromPixels(imageData, 1)
        .div(255.0)        // Normalize to 0-1
        .expandDims(0);    // Add batch dimension

    // Debug: Log input range
    const inputMin = await input.min().data();
    const inputMax = await input.max().data();
    console.log('Input range:', inputMin[0], inputMax[0]);

    // Get prediction
    const predictions = await model.predict(input).data();

    // Log the highest prediction for debugging
    const maxPred = Math.max(...predictions);
    const predictedDigit = predictions.indexOf(maxPred);
    console.log('Predicted digit:', predictedDigit, 'with confidence:', maxPred);

    // Update prediction bars
    predictions.forEach((pred, i) => {
        const percentage = (pred * 100).toFixed(1);
        document.getElementById(`pred${i}`).style.width = `${percentage}%`;
        document.getElementById(`pred${i}Text`).textContent = `${percentage}%`;
    });

    // Clean up tensor
    input.dispose();
}

// Initialize everything when the page loads
window.addEventListener('load', async () => {
    initializeCanvas();
    await loadModel();
});
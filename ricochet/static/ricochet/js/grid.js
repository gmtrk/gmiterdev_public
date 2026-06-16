// Allocation-free uniform spatial grid (counting-sort buckets in flat typed arrays).
// All buffers are allocated once in the constructor and reused on every rebuild():
// zero per-frame GC. Indices are the caller's point indices (0..count-1).
export class Grid {
  constructor(width, height, cell) {
    this.width = width;
    this.height = height;
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(width / cell));
    this.rows = Math.max(1, Math.ceil(height / cell));
    const nCells = this.cols * this.rows;

    // Per-cell bucket bookkeeping (counting sort).
    this.cellCount = new Int32Array(nCells); // # points in each cell
    this.cellStart = new Int32Array(nCells); // start offset of each cell's run in ballIndex
    // point indices grouped by cell; allocated up front and only grown if a rebuild
    // exceeds capacity (rare), so the typical per-frame path reuses this same buffer.
    this.ballIndex = new Int32Array(nCells);
    this.count = 0;
  }

  _cellOf(x, y) {
    let cx = (x / this.cell) | 0;
    let cy = (y / this.cell) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  rebuild(xs, ys, count) {
    this.count = count;
    this._xs = xs;
    this._ys = ys;

    // Grow the index buffer only if it cannot hold all points (rare; not per-typical-frame).
    if (this.ballIndex.length < count) {
      this.ballIndex = new Int32Array(count);
    }

    // 1) reset and count occupancy per cell.
    this.cellCount.fill(0);
    for (let i = 0; i < count; i++) {
      this.cellCount[this._cellOf(xs[i], ys[i])]++;
    }

    // 2) prefix-sum into cellStart.
    let acc = 0;
    for (let c = 0; c < this.cellCount.length; c++) {
      this.cellStart[c] = acc;
      acc += this.cellCount[c];
    }

    // 3) scatter point indices into their cell runs (reuse cellCount as a write cursor).
    this.cellCount.fill(0);
    for (let i = 0; i < count; i++) {
      const c = this._cellOf(xs[i], ys[i]);
      this.ballIndex[this.cellStart[c] + this.cellCount[c]] = i;
      this.cellCount[c]++;
    }
  }

  // Calls fn(pointIndex) for every point in the 3x3 block of cells around (x,y).
  forEachNeighbor(x, y, fn) {
    let cx = (x / this.cell) | 0;
    let cy = (y / this.cell) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;

    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= this.rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        if (nx < 0 || nx >= this.cols) continue;
        const c = ny * this.cols + nx;
        const start = this.cellStart[c];
        const end = start + this.cellCount[c];
        for (let k = start; k < end; k++) {
          fn(this.ballIndex[k]);
        }
      }
    }
  }
}

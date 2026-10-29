// Silinx toolchain - the Spartan-6's bit regions (#732; measured in research/s6, #725 #726): where a tile's bits are in the frame
// data (a switch box's by its name, any tile's by the device's grid) and a frame's column. Browser + Node.

// the INT-like tile types: each its FAR column's switch box
const INT_LIKE = /^(INT|INT_BRK|INT_BRAM|INT_BRAM_BRK|IOI_INT|LIOI_INT|INT_GCLK)$/;

/**
 * Any INT-like tile's region by the rule its CLB columns follow: the FAR column X + 1 (tile X), the row Y div 16, the
 * band of Y mod 16 (Y15 at bit 0 … Y8 at 448, Y7 at 528 … Y0 at 976: the HCLK word between).
 */
export function tileRegion(dev, tile) {
  const [x, y] = tile.match(/X(\d+)Y(\d+)$/).slice(1).map(Number), m = y % 16;
  let c = 0;
  for (let i = 0; i <= x; i++) c += dev.columns[i];
  return [Math.floor(y / 16) * dev.rowFrames + c, (15 - m) * 64 + (m <= 7 ? 16 : 0)];
}

/**
 * A tile's region from the device's grid: [first frame, first bit, frames, bits]: the FAR column of the nearest INT-like
 * tile at or left of its grid column (an INT tile X is FAR column X + 1; the centre's clock column is column 0), the band of its grid row's INT-like tiles
 * (by Y), a row between Y 16k + 7 and 16k + 8 (a clock row) the 16 bits between the halves.
 */
export function gridRegion(device, dev, tile, cache = gridRegion.cache ??= new WeakMap()) {
  let g = cache.get(device);
  if (!g) {
    const far = new Map(), y = new Map();
    // the centre's clock column (CMT, REG_V, CLKC, REG_T / REG_B) is FAR column 0, its 4 frames
    for (let k = 0; k < device.tileNames.length; k++) if (/^(REG_V|CLKC|CMT_|REG_C_CMT|REG_T|REG_B)/.test(device.tileType(k))) far.set(device.tileCol[k], 0);
    for (let k = 0; k < device.tileNames.length; k++) {
      if (!INT_LIKE.test(device.tileType(k))) continue;
      const [x, yy] = device.tileNames[k].match(/X(\d+)Y(\d+)$/).slice(1).map(Number);
      far.set(device.tileCol[k], x + 1); y.set(device.tileRow[k], yy);
    }
    g = { far, y };
    cache.set(device, g);
  }
  const k = device.tile(tile), col = device.tileCol[k], row = device.tileRow[k];
  let c = col;
  while (c >= 0 && !g.far.has(c)) c--;
  const farCol = c < 0 ? 0 : g.far.get(c);
  let c0 = 0;
  for (let i = 0; i < farCol; i++) c0 += dev.columns[i];
  const band = yy => { const m = yy % 16; return (15 - m) * 64 + (m <= 7 ? 16 : 0); };
  if (g.y.has(row)) { const yy = g.y.get(row); return [Math.floor(yy / 16) * dev.rowFrames + c0, band(yy), dev.columns[farCol], 64]; }
  let up = row, down = row;
  while (up >= 0 && !g.y.has(up)) up--;
  while (down < device.rows && !g.y.has(down)) down++;
  const a = g.y.get(up), b = g.y.get(down);
  if (a !== undefined && b !== undefined && Math.floor(a / 16) === Math.floor(b / 16) && new Set([a % 16, b % 16]).has(7) && new Set([a % 16, b % 16]).has(8)) return [Math.floor(a / 16) * dev.rowFrames + c0, 512, dev.columns[farCol], 16];
  const yy = a ?? b;
  return [Math.floor(yy / 16) * dev.rowFrames + c0, band(yy), dev.columns[farCol], 64];
}

/** The first frame and the frame count of the column holding a frame (index in FDRI's frames). */
export function columnOf(dev, frame) {
  const row = Math.floor(frame / dev.rowFrames);
  let f = row * dev.rowFrames;
  for (const n of dev.columns) { if (frame < f + n) return [f, n]; f += n; }
  throw new Error(`frame ${frame}: in no column (a pad frame)`);
}

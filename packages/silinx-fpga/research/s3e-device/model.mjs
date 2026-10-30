// Silinx - device measurements: from observed joins to the joins of the whole chip
// (research/s3e-device/README.md).
//
// The general routing of the Spartan-3E is one switch box repeated in every CLB, block-RAM
// interconnect and I/O tile (the bit database found the same bits for the same PIPs in all of
// them: research/s3e-bitstream/README.md, stage D). The doubles, hexes and long lines join switch
// boxes a fixed number of switch boxes apart, whatever lies between them (block-RAM site and
// feed-through tiles, the clock column and rows have no switch box). So a join observed between two
// switch boxes is written as a rule in switch-box coordinates and applied to every switch box that
// has the wire. Every join so predicted is a hypothesis until a test design confirms it
// (hypotheses.mjs).

import { tileXY } from './observe.mjs';

const splitKey = k => { const i = k.indexOf('/'); return [k.slice(0, i), k.slice(i + 1)]; };

/**
 * The switch-box grid of a set of tiles: { rowXs: Map y -> sorted X of the row's switch boxes,
 * colYs: Map x -> sorted Y of the column's, at: Map 'x,y' -> tile name, pos: Map tile name ->
 * [x, y] }. switchTiles: the names of the tiles that hold a switch box (one per X / Y). The
 * block-RAM columns have one switch box (the interconnect tile) where the CLB rows above and below
 * them have four, and the DCMs interrupt some columns, so offsets are counted in switch boxes of
 * the row (then of the column), not in tile X / Y.
 */
export function switchGrid(switchTiles) {
  const at = new Map(), pos = new Map(), rows = new Map(), cols = new Map();
  for (const t of switchTiles) {
    const { x, y } = tileXY(t);
    const k = `${x},${y}`;
    if (at.has(k)) throw new Error(`two switch boxes at X${x}Y${y}: ${at.get(k)}, ${t}`);
    at.set(k, t); pos.set(t, [x, y]);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(x);
    if (!cols.has(x)) cols.set(x, []);
    cols.get(x).push(y);
  }
  const sorted = m => new Map([...m].map(([k, v]) => [k, v.sort((a, b) => a - b)]));
  return { rowXs: sorted(rows), colYs: sorted(cols), at, pos };
}

/**
 * A join between two switch boxes as a rule 'E2BEG0 2,0 E2END0': wires, offset in switch boxes of
 * the first one's row, then in switch boxes of that column. Null when the second tile's X has no
 * switch box in the first one's row.
 */
export function gridRule(a, b, grid) {
  const [ta, wa] = splitKey(a), [tb, wb] = splitKey(b);
  const pa = grid.pos.get(ta), pb = grid.pos.get(tb);
  if (!pa || !pb) return null;
  const xs = grid.rowXs.get(pa[1]);
  const ia = xs.indexOf(pa[0]), ib = xs.indexOf(pb[0]);
  if (ib < 0) return null;
  const ys = grid.colYs.get(pb[0]);
  return `${wa} ${ib - ia},${ys.indexOf(pb[1]) - ys.indexOf(pa[1])} ${wb}`;
}

/**
 * The joins the rules predict: for every switch box that has the rule's first wire, the switch box
 * at the offset, when it exists and has the second wire. wiresOf(tile) -> Set of its wire names.
 * Returns [[ 'TILE/WIRE', 'TILE/WIRE' ]].
 */
export function applyRules(rules, grid, wiresOf) {
  const parsed = [...rules].map(r => { const [wa, off, wb] = r.split(' '); const [dc, dy] = off.split(',').map(Number); return { wa, dc, dy, wb }; });
  const byWire = new Map();
  for (const r of parsed) { if (!byWire.has(r.wa)) byWire.set(r.wa, []); byWire.get(r.wa).push(r); }
  const out = [];
  for (const [t, [x, y]] of grid.pos) {
    const xs = grid.rowXs.get(y), c = xs.indexOf(x);
    for (const w of wiresOf(t)) for (const r of byWire.get(w) || []) {
      const xt = xs[c + r.dc];
      if (xt === undefined) continue;
      const ys = grid.colYs.get(xt), iy = ys.indexOf(y);
      const yt = iy < 0 ? undefined : ys[iy + r.dy];
      const u = yt === undefined ? undefined : grid.at.get(`${xt},${yt}`);
      if (u && wiresOf(u).has(r.wb)) out.push([`${t}/${w}`, `${u}/${r.wb}`]);
    }
  }
  return out;
}

/**
 * More rules from the rules of one wire: the wires a wire is joined to are joined to each other
 * (E2BEG0 1,0 E2MID0 and E2BEG0 2,0 E2END0 give E2MID0 1,0 E2END0), which reaches the taps whose
 * beginning lies outside the chip. Offsets are added as if every row had the same switch boxes;
 * the tests catch where they have not.
 */
export function closeRules(rules) {
  const by = new Map();
  for (const r of rules) {
    const [wa, off, wb] = r.split(' ');
    const [dc, dy] = off.split(',').map(Number);
    if (!by.has(wa)) by.set(wa, [{ w: wa, dc: 0, dy: 0 }]);
    by.get(wa).push({ w: wb, dc, dy });
  }
  const out = new Set(rules);
  for (const ts of by.values()) for (const a of ts) for (const b of ts) {
    if (a !== b && !(a.w === b.w && a.dc === b.dc && a.dy === b.dy)) out.add(`${a.w} ${b.dc - a.dc},${b.dy - a.dy} ${b.w}`);
  }
  return out;
}

/**
 * Rules from the names alone (hypotheses for the taps no routed design used): a double or a hex of
 * direction D and length L starts at D<L>BEG<i> and passes the taps in order, one switch box apart —
 * BEG, MID, END for a double; BEG, A, B, MID, C, D, END for a hex (UG331) —, with the same index i;
 * the END_S / END_N taps are the END's switch box one row down / up. indexes: the wire indexes
 * (0-7 on the Spartan-3E). pairs: also each tap to every later tap (a segment whose BEG is in a tile no test drives
 * from, an I/O or block-RAM switch box: its other taps joined to each other).
 */
export function segmentRules(indexes = [0, 1, 2, 3, 4, 5, 6, 7], { pairs = false } = {}) {
  const taps = { 2: ['BEG', 'MID', 'END'], 6: ['BEG', 'A', 'B', 'MID', 'C', 'D', 'END'] };
  const step = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };
  const out = new Set();
  for (const d of 'NSEW') for (const len of [2, 6]) for (const i of indexes) {
    const [sc, sy] = step[d];
    const end = taps[len].length - 1;
    // the taps after a start j (BEG only, or every one with pairs), END_S / END_N among them
    for (let j = 0; j < (pairs ? end : 1); j++) {
      const a = `${d}${len}${taps[len][j]}${i}`;
      taps[len].forEach((tap, k) => { if (k > j) out.add(`${a} ${sc * (k - j)},${sy * (k - j)} ${d}${len}${tap}${i}`); });
      out.add(`${a} ${sc * (end - j)},${sy * (end - j) - 1} ${d}${len}END_S${i}`);
      out.add(`${a} ${sc * (end - j)},${sy * (end - j) + 1} ${d}${len}END_N${i}`);
    }
  }
  return out;
}

/** Union-find over 'TILE/WIRE' keys: the nodes the joins make. Returns Map key -> root key. */
export function nodesOf(joins) {
  const parent = new Map();
  const find = x => { let r = x; while (parent.get(r) !== r) r = parent.get(r); let y = x; while (y !== r) { const n = parent.get(y); parent.set(y, r); y = n; } return r; };
  for (const [a, b] of joins) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) { if (ra < rb) parent.set(rb, ra); else parent.set(ra, rb); }
  }
  const out = new Map();
  for (const k of parent.keys()) out.set(k, find(k));
  return out;
}

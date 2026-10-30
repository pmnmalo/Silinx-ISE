// #3, the measured description: hypotheses by a wire's index, for what ISE's routes showed at some indexes only (no
// shipped graph: the measured graph's wires, the observations and the tests' verdicts).
//   pips:  each PIP seen in a tile of the clock column (CLKT, CLKB, CLKL, CLKR, CLKV, CLKC, DCM, GCLK*), its wires' last
//          number varied over 0-15, among the measured graph's wires of the tile, not seen nor probed: arc-probe
//          candidates (probe-run.mjs). (The CLKT tile's doubles across the clock column: CLKV_E2BEG5 -> CLKT_SELDUB2.)
//   joins: each join seen with an end in the clock column, the index varied the same way: join hypotheses
//          (prototype.mjs tests)
//   clock: each known join (observed or confirmed) of two clock lines with an end in an I/O tile, at every index 0-7
//          and at every tile of the same prefix at the same offset: join hypotheses, tested from a BUFGMUX (BUFGSRC=1,
//          MAXDEPTH=10 MAXJOINS=8: the spine, the row and the I/O column's line are a long way from it)
//   rows:  each known join of two clock lines (GCLK…) whose ends are in one tile row or one tile column, moved to every
//          other row (column) where tiles at the same X (Y) have the same wires, at every index 0-7: the clock rows and
//          vertical lines ISE's designs did not use (the GCLKH row at Y13, GCLKV_X6Yk)
//   edge:  each known join (observed or confirmed) with an end in an edge tile or a corner, the index varied: the hexes
//          and doubles a terminal tile turns back (CLB_X2Y33/N6BEG1 ~ TTERM_X2Y35/TBTERM_N6B1)
//   taps:  the taps of each double and hex from any of them, whatever the wire's prefix, in the tiles of their places:
//          the segments that start beyond the chip's edge (TTERM_X2Y35/TBTERM_S6A2 ~ CLB_X2Y33/S6MID2)
//   long:  the long lines: every pair of tiles six apart along a row (LH) or a column (LV) that both have the wires, the
//          index six on, modulo 24, eastwards (LH) or southwards (LV) — the rule every known long-line join follows
//          (BIOIS_X11Y0/LH0 ~ BIOIS_X17Y0/LH6, LIOIS_X0Y29/LV6 ~ LIOIS_X0Y23/LV12): the I/O rows' and columns' ends no
//          route took (TIOIS_X1Y35/LH12 ~ TIOIS_X7Y35/LH18)
//   spine: the observations' ambiguous joins of the clock spine (a CLKT, CLKB, CLKC, GCLKVC, GCLKVM or GCLKH wire, not a
//          row's GCLKH_GCLK_UP / DN, which clocktests.mjs tests by removal), each with every spine candidate: tested from a
//          BUFGMUX (BUFGSRC=1), round after round, each round's joins the next one's paths (CLKC_GCLK0 ~
//          GCLKVML_GCLKCORE0, then the vertical spine, the rows)
//   pins:  the observations' ambiguous joins of a block RAM's pin wires (BRAMSITE2/BRAM_CLK2_INT1, its interconnect
//          tile's BRAM_CLK2 among the column's), each with every candidate: the designs clock every block RAM alike, so
//          the intersection cannot tell them apart (the XC3S100E's 4)
//   [SWITCHTILES=switch-tiles.txt] node varyjoins.mjs pips|joins|edge|taps|clock|rows|long|spine|pins measured.json.gz obs.json out.json [probe.json,… | verdict-dir…]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { tileXY, wireFamily } from './observe.mjs';
import { switchGrid } from './model.mjs';
import { fileURLToPath } from 'node:url';

/** The pairs of wire names a pair takes with its last number varied over 0..n-1: the same index at both ends when they
 *  had the same, else each end alone; okA / okB: the names that exist. [[a, b]], the pair itself among them. */
export function indexVariants(a, b, okA, okB, n = 16) {
  const A = /^(.*?)(\d+)$/.exec(a), B = /^(.*?)(\d+)$/.exec(b), out = new Map();
  if (!A && !B) return [];
  const add = (x, y) => out.set(`${x} ${y}`, [x, y]);
  for (let j = 0; j < n; j++) {
    if (A && B && A[2] === B[2]) { const x = A[1] + j, y = B[1] + j; if (okA(x) && okB(y)) add(x, y); }
    else { if (A && okA(A[1] + j)) add(A[1] + j, b); if (B && okB(B[1] + j)) add(a, B[1] + j); }
  }
  return [...out.values()];
}

const CLOCK_COLUMN = /^(CLKT|CLKB|CLKV|CLKC|CLKL|CLKR|DCM|GCLK)/;
// (the edge tiles and corners, edgejoins.mjs's edgeTile)
const EDGE = /^(LTERM|RTERM|TTERM|BTERM|COB_|CNR_|UL_|UR_|LL_|LR_)/;
const ord = j => [j[0], j[1]].sort().join('|');
/** The DCM tiles that hold a switch box (the long lines cross them), which the tile probe's list leaves out: the
 *  XC3S250E's DCM_TL_CENTER…, and the XC3S100E's left ones, DCMAUX_TL_CENTER / DCMAUX_BL_CENTER. */
export const DCM_SWITCH = /^DCM(AUX)?_[TB][LR]_CENTER_/;

/** The arc-probe candidates: [{ tile, from, to }]. wiresOf(tile): the measured wires of a tile (a Set) or null; asked:
 *  'tile from to' already seen or probed. */
export function pipVariants(pips, wiresOf, asked) {
  const out = new Map();
  for (const p of pips) {
    if (!CLOCK_COLUMN.test(p.tile)) continue;
    const w = wiresOf(p.tile);
    if (!w) continue;
    for (const [x, y] of indexVariants(p.from, p.to, v => w.has(v), v => w.has(v))) {
      const k = `${p.tile} ${x} ${y}`;
      if (!asked.has(k)) out.set(k, { tile: p.tile, from: x, to: y });
    }
  }
  return [...out.values()];
}

/** The join hypotheses of the clock column (or of the tiles `tiles` matches: the edge tiles) by index: [[a, b]], none
 *  known or tested. */
export function joinVariants(joins, wiresOf, done, tiles = CLOCK_COLUMN) {
  const out = new Map();
  for (const [a, b] of joins) {
    const [ta, wa] = a.split('/'), [tb, wb] = b.split('/');
    if (!tiles.test(ta) && !tiles.test(tb)) continue;
    const A = wiresOf(ta), B = wiresOf(tb);
    if (!A || !B) continue;
    for (const [x, y] of indexVariants(wa, wb, v => A.has(v), v => B.has(v))) { const j = [`${ta}/${x}`, `${tb}/${y}`]; if (!done.has(ord(j))) out.set(ord(j), j); }
  }
  return [...out.values()];
}

/** The I/O columns' clock lines: each known join of two clock lines with an end in an I/O tile, at every index 0-7 and
 *  every tile of the same prefix at the same offset: [[a, b]], none known or tested. tiles: every tile name. */
export function clockLineVariants(joins, tiles, wiresOf, done) {
  const io = t => /IOIS|IBUFS/.test(t);
  const at = new Set(tiles), byPrefix = new Map();
  for (const t of tiles) { const x = tileXY(t); if (x) { if (!byPrefix.has(x.prefix)) byPrefix.set(x.prefix, []); byPrefix.get(x.prefix).push(x); } }
  const out = new Map();
  for (const [a, b] of joins) {
    const [ta, wa] = a.split('/'), [tb, wb] = b.split('/');
    if (!(io(ta) || io(tb)) || wireFamily(wa) !== 'gclk' || wireFamily(wb) !== 'gclk') continue;
    const A = tileXY(ta), B = tileXY(tb), ma = /^(.*?)(\d+)$/.exec(wa), mb = /^(.*?)(\d+)$/.exec(wb);
    if (!A || !B || !ma || !mb) continue;
    for (const X of byPrefix.get(A.prefix) || []) {
      const t1 = `${A.prefix}_X${X.x}Y${X.y}`, t2 = `${B.prefix}_X${X.x + B.x - A.x}Y${X.y + B.y - A.y}`;
      if (!at.has(t2)) continue;
      for (let j = 0; j < 8; j++) {
        const h = [`${t1}/${ma[1]}${j}`, `${t2}/${mb[1]}${j}`];
        if (wiresOf(t1)?.has(ma[1] + j) && wiresOf(t2)?.has(mb[1] + j) && !done.has(ord(h))) out.set(ord(h), h);
      }
    }
  }
  return [...out.values()];
}

/** The clock rows and vertical lines moved: each known join of two GCLK wires in one tile row (or column), at every
 *  other row (column) where a tile at the same X (Y) has each wire, at every index 0-7: [[a, b]], none known or tested. */
export function clockRowVariants(joins, tiles, wiresOf, done) {
  const at = new Map();
  for (const t of tiles) { const x = tileXY(t); if (x) { const k = `${x.x},${x.y}`; if (!at.has(k)) at.set(k, []); at.get(k).push(t); } }
  const ys = [...new Set(tiles.map(t => tileXY(t)?.y).filter(y => y !== undefined))], xs = [...new Set(tiles.map(t => tileXY(t)?.x).filter(x => x !== undefined))];
  const find = (x, y, w) => (at.get(`${x},${y}`) || []).find(t => wiresOf(t)?.has(w));
  const out = new Map();
  for (const [a, b] of joins) {
    const [ta, wa] = a.split('/'), [tb, wb] = b.split('/');
    if (!/GCLK/.test(wa) || !/GCLK/.test(wb)) continue;
    const A = tileXY(ta), B = tileXY(tb), ma = /^(.*?)(\d+)$/.exec(wa), mb = /^(.*?)(\d+)$/.exec(wb);
    if (!A || !B || !ma || !mb || ma[2] !== mb[2]) continue;
    const moves = A.y === B.y ? ys.map(y => [[A.x, y], [B.x, y]]) : A.x === B.x ? xs.map(x => [[x, A.y], [x, B.y]]) : [];
    for (const [[xa, ya], [xb, yb]] of moves) for (let j = 0; j < 8; j++) {
      const t1 = find(xa, ya, ma[1] + j), t2 = find(xb, yb, mb[1] + j);
      if (!t1 || !t2 || t1 === t2) continue;
      const h = [`${t1}/${ma[1]}${j}`, `${t2}/${mb[1]}${j}`];
      if (!done.has(ord(h))) out.set(ord(h), h);
    }
  }
  return [...out.values()];
}

/** The taps of a double or a hex (BEG, MID, END; BEG, A, B, MID, C, D, END) from any of them, whatever the wire's prefix
 *  (an edge tile's TBTERM_S6A2, a corner's W6END0): the other taps of the segment, each in the tile of its place on it
 *  (one tile on per tap, in the line's direction) that has a wire of that tap: [[a, b]], none on one node already nor
 *  tested. The segments that start beyond the chip's edge (a hex south from the top: its A in the terminal tile). */
export function tapVariants(tiles, wiresOf, sameNode, done) {
  const TAPS = { 2: ['BEG', 'MID', 'END'], 6: ['BEG', 'A', 'B', 'MID', 'C', 'D', 'END'] }, STEP = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };
  const re = /^(?:[A-Z0-9]+_)*?([NSEW])(2|6)(BEG|A|B|MID|C|D|END)(\d+)$/;
  const at = new Map();
  for (const t of tiles) { const x = tileXY(t); if (x) { const k = `${x.x},${x.y}`; if (!at.has(k)) at.set(k, []); at.get(k).push(t); } }
  // (a tile's wire of a tap: its name with or without a prefix)
  const tapWire = (x, y, d, len, tap, i) => {
    for (const t of at.get(`${x},${y}`) || []) for (const w of wiresOf(t) || []) { const m = re.exec(w); if (m && m[1] === d && m[2] === len && m[3] === tap && m[4] === i) return `${t}/${w}`; }
    return null;
  };
  const out = new Map();
  for (const t of tiles) {
    const p = tileXY(t);
    if (!p) continue;
    for (const w of wiresOf(t) || []) {
      const m = re.exec(w);
      if (!m) continue;
      const [, d, len, tap, i] = m, taps = TAPS[len], k = taps.indexOf(tap), [sx, sy] = STEP[d];
      const add = o => { if (!o) return; const h = [`${t}/${w}`, o]; if (h[0] !== h[1] && !done.has(ord(h)) && !sameNode(h[0], h[1])) out.set(ord(h), h); };
      taps.forEach((tp, j) => { if (j > k) add(tapWire(p.x + sx * (j - k), p.y + sy * (j - k), d, len, tp, i)); });
      // (the same tap in another tile of the same place: a terminal tile and the I/O tile it shares X / Y with,
      // TTERM_X2Y35/TBTERM_N6BEG2 ~ TIBUFS_X2Y35/N6BEG2; the END's switch box one row down / up, END_S / END_N)
      for (const u of at.get(`${p.x},${p.y}`) || []) if (u !== t) for (const v of wiresOf(u) || []) { const n = re.exec(v); if (n && n[1] === d && n[2] === len && n[3] === tap && n[4] === i) add(`${u}/${v}`); }
      if (tap === 'END') for (const [dy, sfx] of [[-1, 'S'], [1, 'N']]) for (const u of at.get(`${p.x},${p.y + dy}`) || []) for (const v of wiresOf(u) || []) if (v.endsWith(`${d}${len}END_${sfx}${i}`)) add(`${u}/${v}`);
    }
  }
  return [...out.values()];
}

/** The long lines' joins by their rule (six on, the index six on modulo 24: eastwards for LH, southwards for LV),
 *  between the tiles that have the wires, none on one node already (sameNode(a, b)) nor tested: [[a, b]]. grid
 *  (model.mjs switchGrid): six switch boxes of the row / column on, else six tile X / Y (a DCM's terminal rows in the
 *  clock column's neighbours hold none: TIBUFS_X13Y35/LV18 ~ CLB_X13Y26/LV0, the DCM tile Y34 one of the six). */
export function longLineVariants(tiles, wiresOf, sameNode, done, grid = null) {
  const at = new Map();
  for (const t of tiles) { const x = tileXY(t); if (x) { const k = `${x.x},${x.y}`; if (!at.has(k)) at.set(k, []); at.get(k).push(t); } }
  const find = (x, y, w) => (at.get(`${x},${y}`) || []).find(t => wiresOf(t)?.has(w));
  const out = new Map();
  // (the place six on: in switch boxes when the tile is one of the grid's)
  const step = (p, d, t) => {
    if (!grid?.pos.has(t)) return d === 'H' ? [p.x + 6, p.y] : [p.x, p.y - 6];
    const line = d === 'H' ? grid.rowXs.get(p.y) : grid.colYs.get(p.x), i = line.indexOf(d === 'H' ? p.x : p.y), o = line[d === 'H' ? i + 6 : i - 6];
    return o === undefined ? [NaN, NaN] : d === 'H' ? [o, p.y] : [p.x, o];
  };
  for (const t of tiles) {
    const p = tileXY(t), w = wiresOf(t);
    if (!p || !w) continue;
    for (let i = 0; i < 24; i++) for (const d of ['H', 'V']) {
      if (!w.has(`L${d}${i}`)) continue;
      const [x, y] = step(p, d, t), j = (i + 6) % 24, u = find(x, y, `L${d}${j}`);
      if (!u) continue;
      const h = [`${t}/L${d}${i}`, `${u}/L${d}${j}`];
      if (!done.has(ord(h)) && !sameNode(h[0], h[1])) out.set(ord(h), h);
    }
  }
  return [...out.values()];
}

/** The ambiguous joins of the clock spine, each with every spine candidate, less those a test decided (`done`) and the
 *  wires already joined (`joined`). A row's UP / DN wire is driven by a PIP from its own tile's row line: a test of it
 *  from a BUFGMUX may reach the other end over a join of that line not yet known, and so is left to the removal tests. */
export function spineVariants(ambiguous, done, joined) {
  const spine = k => /^(CLKT|CLKB|CLKC|GCLKVC|GCLKVM|GCLKH)/.test(k) && !/GCLK_(UP|DN)\d+$/.test(k);
  const out = new Map();
  for (const { from, candidates } of ambiguous) {
    if (!spine(from) || joined.has(from)) continue;
    for (const c of candidates) if (spine(c) && !done.has(ord([c, from])) && !out.has(ord([c, from]))) out.set(ord([c, from]), [c, from]);
  }
  return [...out.values()];
}

/** The ambiguous joins of a block RAM's pin wires (<pin>_INTk), each with every candidate, less those a test decided. */
export function pinVariants(ambiguous, done) {
  const pin = k => /^BRAM[A-Z0-9_]*_INT\d+$/.test(k.slice(k.indexOf('/') + 1));
  const out = new Map();
  for (const { from, candidates } of ambiguous) {
    if (!pin(from) && !candidates.some(pin)) continue;
    for (const c of candidates) if (!done.has(ord([c, from])) && !out.has(ord([c, from]))) out.set(ord([c, from]), [c, from]);
  }
  return [...out.values()];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, gf, of, out, ...rest] = process.argv.slice(2);
  const { loadDevice } = await import('../../src/fpga/device.js');
  const G = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(gf))));
  const obs = JSON.parse(fs.readFileSync(of, 'utf8'));
  const cache = new Map();
  const wiresOf = t => { if (!cache.has(t)) { const k = G.tile(t); cache.set(t, k === undefined ? null : new Set(Array.from(G.templates[G.tileTemplate[k]].wires, i => G.names[i]))); } return cache.get(t); };
  if (cmd === 'pips') {
    const asked = new Set(obs.pips.map(p => `${p.tile} ${p.from} ${p.to}`));
    for (const f of (rest[0] || '').split(',').filter(Boolean)) { const p = JSON.parse(fs.readFileSync(f, 'utf8')).pips; for (const x of [...p.yes, ...p.no]) asked.add(`${x.tile} ${x.from} ${x.to}`); }
    const pips = pipVariants(obs.pips, wiresOf, asked);
    fs.writeFileSync(out, JSON.stringify({ part: process.env.PART || 'xc3s250ecp132-4', pips, sites: [] }));
    console.log(`${pips.length} PIP candidates`);
  } else {
    const verdicts = rest.flatMap(d => JSON.parse(fs.readFileSync(path.join(d, 'verdicts.json'), 'utf8')));
    const known = [...obs.joins, ...verdicts.filter(v => v[2] === 'join').map(v => [v[0], v[1]])];
    const done = new Set([...known, ...verdicts.filter(v => v[2] === 'no-join')].map(ord));
    const node = k => { const i = k.indexOf('/'); return G.node(k.slice(0, i), k.slice(i + 1)); };
    const hyp = cmd === 'spine' ? spineVariants(obs.ambiguous, done, new Set(known.flat())) : cmd === 'pins' ? pinVariants(obs.ambiguous, done)
      : cmd === 'joins' ? joinVariants(obs.joins, wiresOf, done) : cmd === 'edge' ? joinVariants(known, wiresOf, done, EDGE) : cmd === 'rows' ? clockRowVariants(known, G.tileNames, wiresOf, done)
      : cmd === 'taps' ? tapVariants(G.tileNames, wiresOf, (a, b) => node(a) >= 0 && node(a) === node(b), done)
      : cmd === 'long' ? longLineVariants(G.tileNames, wiresOf, (a, b) => node(a) >= 0 && node(a) === node(b), done,
        // (the DCM tiles hold a switch box too: TIBUFS_X13Y35/LV18 -> DCM_TL_CENTER_X13Y34/LV19 -> CLB_X13Y30/LV20)
        process.env.SWITCHTILES ? switchGrid([...new Set([...fs.readFileSync(process.env.SWITCHTILES, 'utf8').split('\n').filter(Boolean), ...G.tileNames.filter(t => DCM_SWITCH.test(t))])]) : null)
        : clockLineVariants(known, G.tileNames, wiresOf, done);
    fs.writeFileSync(out, JSON.stringify(hyp));
    console.log(`${hyp.length} join hypotheses`);
  }
}

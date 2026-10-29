// Silinx toolchain - the packer's wide multiplexers (#405: out of packWith in core/fpga/pack.js): trees of MUXF5 ..
// MUXF8 on the dedicated F5 / FX connections in their CLB pattern, any other multiplexer a LUT3.
import { MUXF, WIDE_MUX } from './pack.js';

/** packWith's wide multiplexers packed (nothing returned). */
export function mountMuxes(ctx) {
  const {
    absorbFf, cells, ci, driverCell, loadsOf, lutFor, macros, newSlice, otherLoads, relabel, setBypass, setSink, stats,
    where
  } = ctx;

  // ---------------------------------------------------------------- wide multiplexers
  // A multiplexer tree uses the dedicated F5 / FX connections only when each input of an F6 / F7 / F8
  // is the output of the level below and nothing else claims it; any other multiplexer becomes a
  // 3-input LUT (O = S ? I1 : I0).
  const muxes = cells.filter(c => MUXF[c.type]);
  stats.muxes = muxes.length;
  const claimed = new Set();
  const childOk = (m, pin) => {
    const d = driverCell(m.pins[pin]);
    return d && MUXF[d.type] === MUXF[m.type] - 1 && !claimed.has(d) && !d.lut3;
  };
  const tree = m => {   // claim the whole tree under m (or fail without claiming)
    const lvl = MUXF[m.type];
    if (lvl === 5) return [m];
    if (!childOk(m, 'I0') || !childOk(m, 'I1')) return null;
    const a = tree(driverCell(m.pins.I1)), b = a && tree(driverCell(m.pins.I0));
    return a && b ? [m, ...a, ...b] : null;
  };
  const roots = [];
  for (const lvl of [8, 7, 6, 5]) for (const m of muxes.filter(x => MUXF[x.type] === lvl && !claimed.has(x))) {
    const t = tree(m);
    if (!t) { m.lut3 = true; continue; }
    // a level-5 tree whose parent became a LUT is a root of its own
    for (const x of t) claimed.add(x);
    roots.push(m);
  }
  // multiplexers that became LUT3: inputs (I0, I1, S) -> LUT3 INIT for O = S ? I1 : I0 (I0 = bit 0)
  for (const m of muxes) if (m.lut3) {
    stats.muxLuts = (stats.muxLuts || 0) + 1;
    m.type = 'LUT3'; m.params = { INIT: '11001010' };
    m.pins = { I0: m.pins.I0, I1: m.pins.I1, I2: m.pins.S, O: m.pins.O };
    relabel(m, { S: 'I2' });
  }

  // place a tree: the F5 of `leaf` slices, the FiMUX at their fixed spots inside the CLB(s)
  for (const root of roots) {
    const lvl = MUXF[root.type];
    // slices of the macro by position: lvl 5 -> 1 slice, 6 -> 2, 7 -> 4 (a CLB), 8 -> 8 (two CLBs)
    const members = [];
    const at = new Map();
    const sliceAt = (dx, dy) => {
      const k = `${dx},${dy}`;
      if (!at.has(k)) { const s = newSlice(); at.set(k, s); members.push({ inst: s.idx, dx, dy }); }
      return at.get(k);
    };
    // where each multiplexer of the tree goes: (mux, dx, dy)
    const put = (m, dx, dy) => {
      const l = MUXF[m.type];
      const s = sliceAt(dx, dy);
      if (l === 5) { placeF5(s, m); return; }
      s.fi = m;
      where.set(ci(m), { inst: s.idx, bel: 'F6MUX' });
      setBypass(s, 'Y', m.pins.S);
      setSink(ci(m), 'S', { inst: s.idx, pin: 'BY', kind: 'gen' });
      const spec = WIDE_MUX[l].find(w => w.at[0] === ((dx % 2) + 2) % 2 && w.at[1] === ((dy % 2) + 2) % 2);
      const base = [dx - spec.at[0], dy - spec.at[1]];
      const ca = driverCell(m.pins.I1), cb = driverCell(m.pins.I0);
      const pa = [base[0] + spec.a[0], base[1] + spec.a[1]], pb = [base[0] + spec.b[0], base[1] + spec.b[1]];
      const kind = l === 6 ? 'f5' : 'fx';
      setSink(ci(m), 'I1', { inst: s.idx, pin: 'FXINA', kind });
      setSink(ci(m), 'I0', { inst: s.idx, pin: 'FXINB', kind });
      put(ca, pa[0], pa[1]);
      put(cb, pb[0], pb[1]);
    };
    // the root's own position: F6 at S0, F7 at S1, F8 at S3 (of the upper CLB: its F7 below)
    const r0 = lvl === 5 ? [0, 0] : WIDE_MUX[lvl][0].at;
    put(root, r0[0], r0[1]);
    // normalise the offsets (the lowest slice at dy = 0) and record the macro
    const minDy = Math.min(...members.map(x => x.dy));
    for (const x of members) x.dy -= minDy;
    // F6 pairs start on an even slice row, F7 / F8 on a CLB (even column and row)
    macros.push({ kind: lvl === 5 ? 'F5' : `F${lvl}`, members, align: lvl === 5 ? [1, 1] : lvl === 6 ? [1, 2] : [2, 2] });
    // the FiMUX output feeds GYMUX (Y) / the flip-flop on the Y side
    for (const [, s] of at) if (s.fi) {
      const o = s.fi.pins.O;
      const parent = loadsOf(o).filter(l => MUXF[cells[l.cell].type] && claimed.has(cells[l.cell]) && where.get(l.cell)?.bel === 'F6MUX');
      if (otherLoads(o, parent.map(l => [l.cell, l.pin])).length) s.out.Y = 'FX';
      if (!s.out.Y || s.out.Y === 'FX') { absorbFf(s, 'Y', o); if (s.ff.Y) s.out.Y = s.out.Y || 'FX'; }
    }
  }
  // a single-slice multiplexer of two LUTs: F = I1, G = I0, BX selects (BX = 1 -> F)
  function placeF5(s, m) {
    s.f5 = m;
    where.set(ci(m), { inst: s.idx, bel: 'F5MUX' });
    setBypass(s, 'X', m.pins.S);
    setSink(ci(m), 'S', { inst: s.idx, pin: 'BX', kind: 'gen' });
    lutFor(s, 'F', m.pins.I1, [[ci(m), 'I1']], false);
    lutFor(s, 'G', m.pins.I0, [[ci(m), 'I0']], !s.fi);
    if (s.lut.G.cell >= 0 && otherLoads(s.lut.G.out, [[ci(m), 'I0']]).length) s.out.Y = 'G';
    const o = m.pins.O;
    const parent = loadsOf(o).filter(l => MUXF[cells[l.cell].type] && claimed.has(cells[l.cell]));
    if (otherLoads(o, parent.map(l => [l.cell, l.pin])).length) s.out.X = 'F5';
    if (!s.out.X || s.out.X === 'F5') { absorbFf(s, 'X', o); if (s.ff.X) s.out.X = 'F5'; }
  }
}

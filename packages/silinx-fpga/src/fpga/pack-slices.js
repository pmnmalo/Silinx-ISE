// Silinx toolchain - the packer's placed elements and the slices under construction (#405: out of packWith in
// core/fpga/pack.js): the sites' pins of the cells, the LUTs (a cell, a copy, a route-through) in a slice's slots, the
// flip-flops' control sets.
import { paramBits, paramInt } from './netlist.js';
import { LUT_K, PackError, clean, ffKind } from './pack.js';

/** { ctrlOk, extra, ffs, insts, lutFor, lutOf, newSlice, otherLoads, placeFf, placeLut, setBypass, setSink, sink, stats, tapOf, uniqueName, uniqueNet, where } of packWith. */
export function mountSlices(ctx) {
  const {
    cells, ci, driverCell, isLut, loadsOf, nets
  } = ctx;

  // ---------------------------------------------------------------- the placed elements
  // Every netlist cell lands in one place. Its input pins are either internal to the site
  // (sink[cell][pin] = 'int') or a site pin { inst, pin, kind }; its output gets site pins when
  // something outside needs it (src[cell] = { gen: { inst, pin }, f5: …, fx: …, cy: … }).
  const insts = [];
  const sink = new Map();          // `${cell}:${pin}` -> 'int' | { inst, pin, kind }
  const extra = [];                // inputs of LUTs added by the packer (copies, route-throughs): { net, inst, pin }
  const where = new Map();         // cell -> { inst, bel }
  const tapOf = new Map();         // MUXCY cell -> { inst, bel } of the XOR that brings its carry out (carryOut 'xor')
  const setSink = (c, pin, v) => sink.set(`${c}:${pin}`, v);
  const stats = { copies: 0, passthru: 0 };
  let ucount = 0;
  const unique = names => base => { let n = clean(base); if (names.has(n)) { let k = 1; while (names.has(`${n}_${k}`)) k++; n = `${n}_${k}`; } names.add(n); return n; };
  const uniqueName = unique(new Set());       // instances
  const uniqueNet = unique(new Set());        // nets

  // A slice under construction.
  const newSlice = () => {
    const s = { kind: 'slice', type: 'SLICEL', lut: { F: null, G: null }, ff: { X: null, Y: null }, f5: null, fi: null,
      carry: null, out: { X: null, Y: null }, b: { X: null, Y: null }, ctrl: null, idx: insts.length };
    insts.push(s);
    return s;
  };
  // a LUT for a slot: { name, k, init (msb first), inputs: [net], pins: [site pin of each input], cell (index or -1), out: net }
  const lutOf = c => ({ name: c.name, k: LUT_K[c.type], init: lutInit(c), inputs: Array.from({ length: LUT_K[c.type] }, (_, j) => c.pins[`I${j}`]), pins: [1, 2, 3, 4].slice(0, LUT_K[c.type]), cell: ci(c), out: c.pins.O });
  function lutInit(c) {
    const k = LUT_K[c.type], bits = paramBits(c.params.INIT) || [];
    let s = '';
    for (let i = (1 << k) - 1; i >= 0; i--) s += bits[i] ? '1' : '0';
    return s;
  }
  // a LUT that passes its input through (route-through), or a constant
  const passLut = (net, name) => {
    stats.passthru++;
    if (nets[net].const !== undefined) return { name, k: 0, init: String(nets[net].const), inputs: [], pins: [], cell: -1, out: null };
    return { name, k: 1, init: '10', inputs: [net], pins: [1], cell: -1, out: null };
  };
  // the netlist loads of a net that are not the given (cell, pin) pairs
  const otherLoads = (net, except) => loadsOf(net).filter(l => !except.some(([c, p]) => l.cell === c && l.pin === p));

  // Put a LUT for `net` into slot side of slice s, for internal use by (cell, pin) pairs `users`.
  // The driving LUT cell moves in when nothing else needs it (or `outFree`: its output can leave
  // through X / Y); otherwise a copy goes in; a net not driven by a LUT gets a route-through.
  function lutFor(s, side, net, users, outFree) {
    const d = driverCell(net);
    let lut;
    if (d && isLut(d) && !where.has(ci(d)) && (outFree || !otherLoads(net, users).length)) {
      lut = lutOf(d);
      placeLut(s, side, lut, ci(d));
    } else if (d && isLut(d)) {
      lut = { ...lutOf(d), name: `${d.name}_copy${++ucount}`, cell: -1 };
      stats.copies++;
      placeLut(s, side, lut, -1);
    } else {
      lut = passLut(net, `${nets[net].name}_thru${++ucount}`);
      placeLut(s, side, lut, -1);
    }
    for (const [c, p] of users) setSink(c, p, 'int');
    return lut;
  }
  function placeLut(s, side, lut, cell) {
    if (s.lut[side]) throw new PackError(`pack: LUT ${side} of a slice used twice`);
    s.lut[side] = lut;
    if (cell >= 0) where.set(cell, { inst: s.idx, bel: side });
  }

  // ---------------------------------------------------------------- control sets of flip-flops
  function ffInfo(c) {
    const k = ffKind(c.type);
    const p = c.params || {};
    const inv = n => paramInt(p[n]) === 1;
    const clkPin = k.latch ? 'G' : 'C', cePin = k.latch ? 'GE' : 'CE';
    const ce = c.pins[cePin], sr = k.sr ? c.pins[k.sr] : undefined;
    const ceNet = ce === undefined || (nets[ce].const === 1 && !inv(`IS_${cePin}_INVERTED`)) ? null : ce;
    const srNet = sr === undefined || (nets[sr].const === 0 && !inv(`IS_${k.sr}_INVERTED`)) ? null : sr;
    const initBits = paramBits(p.INIT);
    const init = initBits ? initBits[0] : (k.high ? 1 : 0);
    // a latch's gate is its clock pin. A flip-flop captures on the rising edge after CLKINV; the
    // slice latch is transparent while CLKINV's output is LOW (netgen models CLKINV::CLK on a
    // #LATCH with an inverter: measured with designs/latches.v), so a latch with an active-high
    // gate takes CLKINV::CLK_B, as ISE writes it
    const clkInv = (k.neg ? 1 : 0) ^ (inv(`IS_${clkPin}_INVERTED`) ? 1 : 0) ^ (k.latch ? 1 : 0);
    return {
      cell: ci(c), name: c.name, kind: k, d: c.pins.D, q: c.pins.Q, init, clkPin, cePin, srPin: k.sr,
      ctrl: { clk: c.pins[clkPin], clkInv, ce: ceNet, ceInv: ceNet !== null && inv(`IS_${cePin}_INVERTED`) ? 1 : 0, sr: srNet,
        srInv: srNet !== null && inv(`IS_${k.sr}_INVERTED`) ? 1 : 0, sync: srNet !== null ? !!k.sync : null, latch: !!k.latch },
    };
  }
  const ctrlKey = t => `${t.clk}|${t.clkInv}|${t.ce}|${t.ceInv}|${t.sr}|${t.srInv}|${t.sync}|${t.latch}`;
  const ctrlOk = (s, f) => !s.ctrl || ctrlKey(s.ctrl) === ctrlKey(f.ctrl);
  // Put flip-flop f on side X / Y of slice s; its D comes from the side's output multiplexer
  // (dsrc: 'mux', D is internal) or from BX / BY ('bypass').
  function placeFf(s, side, f, dsrc) {
    if (s.ff[side]) throw new PackError('pack: flip-flop slot used twice');
    s.ff[side] = { ...f, dsrc };
    s.ctrl = f.ctrl;
    where.set(f.cell, { inst: s.idx, bel: `FF${side}` });
    const t = f.ctrl;
    setSink(f.cell, f.clkPin, { inst: s.idx, pin: 'CLK', kind: 'gen' });
    if (t.ce !== null) setSink(f.cell, f.cePin, { inst: s.idx, pin: 'CE', kind: 'gen' }); else if (f.cePin in cells[f.cell].pins) setSink(f.cell, f.cePin, 'int');
    if (f.srPin) setSink(f.cell, f.srPin, t.sr !== null ? { inst: s.idx, pin: 'SR', kind: 'gen' } : 'int');
    if (dsrc === 'mux') setSink(f.cell, 'D', 'int');
    else { setBypass(s, side, f.d); setSink(f.cell, 'D', { inst: s.idx, pin: side === 'X' ? 'BX' : 'BY', kind: 'gen' }); }
  }
  function setBypass(s, side, net) {
    if (s.b[side] !== null && s.b[side] !== net) throw new PackError(`pack: B${side} of a slice used twice`);
    s.b[side] = net;
  }
  const ffs = new Map();   // cell index -> ffInfo, for the flip-flops not placed yet
  for (const c of cells) if (ffKind(c.type)) ffs.set(ci(c), ffInfo(c));

  return { ctrlOk, extra, ffs, insts, lutFor, lutOf, newSlice, otherLoads, placeFf, placeLut, setBypass, setSink, sink, stats, tapOf, uniqueName, uniqueNet, where };
}

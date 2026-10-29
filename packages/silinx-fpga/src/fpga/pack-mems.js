// Silinx toolchain - the packer's distributed RAMs and shift registers on SLICEMs (#405: out of packWith in
// core/fpga/pack.js): their clocks and enables, a shift register of more than 16 stages, SRLC16E chains through Q15
// (#2).
import { paramBits, paramInt } from './netlist.js';
import { PackError, SLICEM_MEM } from './pack.js';

/** packWith's distributed RAMs and shift registers packed (nothing returned). */
export function mountMemories(ctx) {
  const {
    cells, ci, extra, ffsOn, insts, liveCells, macros, nets, newSlice, placeFf, placeLut, setBypass, setSink, sink,
    stats, where
  } = ctx;

  // ---------------------------------------------------------------- distributed RAMs and shift registers
  // In a SLICEM (as ISE's map packs them, research/s3e-bitstream stage D): the LUT is a #RAM, its
  // address on the LUT's pins 1-4 (A0-A3); the write clock on CLK (CLKINV), the write enable (RAM)
  // or shift enable (shift register) on SR through the write strobe generator WSGEN; the data in
  // through BX (DIF_MUX = BX: LUT F) or BY (DIG_MUX = BY: LUT G; DIF_MUX = ALTDIF: F takes BY's).
  //   RAM16X1S   F or G (two in a slice share the address, WE and clock)
  //   RAM16X1D   G = the write port and SPO (A), F = DPO (DPRA), F_ATTR / G_ATTR = DUAL_PORT
  //   RAM32X1S   G = addresses 0-15, F = 16-31, A4 on BX (F5 multiplexer and SLICEWE0), O = F5
  //   SRL16(E)   F or G, F_ATTR / G_ATTR = SHIFT_REG; two in a slice share the clock and CE; the
  //              flip-flop of a side may take the shift register's output (DXMUX = 1) when the
  //              shift is always enabled (SR = 1) and the flip-flop has no CE, no set / reset;
  //              a cascade (#24): G's last stage into F's data through SHIFTIN (DIF_MUX = SHIFTIN); a chain
  //              of SRLC16E through Q15 (#2) on the two SLICEMs of a CLB
  const memCells = liveCells().filter(c => SLICEM_MEM[c.type]);
  const memInit = (c, n) => { const b = paramBits(c.params.INIT) || []; let v = 0; for (let a = 0; a < n; a++) if (b[a]) v += 2 ** a; return v; };
  const memClk = c => {
    const kind = SLICEM_MEM[c.type];
    const pin = kind === 'srl' ? 'CLK' : 'WCLK';
    const inv = (/_1$/.test(c.type) ? 1 : 0) ^ paramInt(c.params[`IS_${pin}_INVERTED`]);
    return { pin, net: c.pins[pin], inv };
  };
  // the enable on SR: a RAM's WE, a shift register's CE (none: SR = 1)
  const memEn = c => (SLICEM_MEM[c.type] === 'srl' ? (c.pins.CE === undefined ? 1 : c.pins.CE) : c.pins.WE);
  const memKey = c => { const k = memClk(c); return `${SLICEM_MEM[c.type] === 'srl' ? 'srl' : 'ram'}|${k.net}|${k.inv}|${memEn(c)}`; };
  const addrNets = c => [0, 1, 2, 3].map(j => c.pins[`A${j}`]);
  function memSlice(c) {
    const s = newSlice();
    s.type = 'SLICEM';
    s.slicem = true;
    const k = memClk(c);
    s.mctrl = { clk: k.net, clkInv: k.inv, en: memEn(c), srl: SLICEM_MEM[c.type] === 'srl' };
    return s;
  }
  // the clock and the enable of a memory cell of slice s
  function memCtrl(s, c) {
    setSink(ci(c), memClk(c).pin, { inst: s.idx, pin: 'CLK', kind: 'gen' });
    const en = SLICEM_MEM[c.type] === 'srl' ? 'CE' : 'WE';
    if (c.pins[en] !== undefined) setSink(ci(c), en, { inst: s.idx, pin: 'SR', kind: 'gen' });
    else extra.push({ net: 1, inst: s.idx, pin: 'SR', kind: 'gen' });
  }
  // a memory LUT on side `side`: address pins, data in, contents
  function memLut(s, side, c, { addr = addrNets(c), addrPins = ['A0', 'A1', 'A2', 'A3'], init, mode, out }) {
    const two = SLICEM_MEM[c.type] === 'ramd' || SLICEM_MEM[c.type] === 'ram32';
    const lut = { name: two ? `${c.name}.SLICEM_${side}` : c.name, k: 4, init: null, inputs: addr, pins: [1, 2, 3, 4], cell: -1, out, mem: { init, mode } };
    placeLut(s, side, lut, -1);
    memCtrl(s, c);
    // (an address pin already on the other LUT's pins: the LUT inputs below connect this one too)
    addrPins.forEach((p, j) => { if (c.pins[p] !== undefined && !sink.has(`${ci(c)}:${p}`)) setSink(ci(c), p, { inst: s.idx, pin: `${side}${j + 1}`, kind: 'gen' }); });
    // the address pins of the LUT the cell does not give (an SRL16 always has 4): constant 0
    lut.inputs = lut.inputs.map(n => (n === undefined ? 0 : n));
    return lut;
  }
  const memData = (s, side, c, pin = 'D') => {
    const X = side === 'F' ? 'X' : 'Y';
    setBypass(s, X, c.pins[pin]);
    setSink(ci(c), pin, { inst: s.idx, pin: `B${X}`, kind: 'gen' });
    s.dmux = s.dmux || {};
    s.dmux[side] = side === 'F' ? 'BX' : 'BY';
  };
  // a shift register longer than 16 stages (core/synth-open.js SRL_MAP: an SRL16E of 16 stages, read at address 15,
  // into the rest) is cascaded in one SLICEM, as ISE's map does: G the first 16 stages, F the next, F's data G's last
  // stage through SHIFTIN (DIF_MUX), inside the slice instead of through general routing (#24). (A longer chain goes
  // on through general routing.)
  const cascadeOf = c => (SLICEM_MEM[c.type] === 'srl' && addrNets(c).every(n => nets[n]?.const === 1)
    ? memCells.find(x => x !== c && SLICEM_MEM[x.type] === 'srl' && x.pins.D === c.pins.Q && memKey(x) === memKey(c)) || null : null);
  // a RAM16X1S / shift register on side `side` of slice s, its data in through BX / BY, or (shiftIn) the stage before
  // it through SHIFTIN: F's G's last stage (DIF_MUX), G's the last stage of the slice above (DIG_MUX)
  const putMem = (s, side, cc, shiftIn = false) => {
    const kind = SLICEM_MEM[cc.type];
    memLut(s, side, cc, { init: memInit(cc, 16), mode: kind === 'srl' ? 'SHIFT_REG' : null, out: cc.pins[kind === 'srl' ? 'Q' : 'O'] });
    if (shiftIn) { setSink(ci(cc), 'D', 'int'); s.dmux = s.dmux || {}; s.dmux[side] = 'SHIFTIN'; }
    else memData(s, side, cc);
    if (kind !== 'srl') s[side === 'F' ? 'wf' : 'wg'] = true;
    where.set(ci(cc), { inst: s.idx, bel: side });
    // the shift register's output into the flip-flop of its side (always shifting: SR = 1)
    if (kind === 'srl' && s.mctrl.en === 1) {
      const X = side === 'F' ? 'X' : 'Y';
      const f = ffsOn(cc.pins.Q).find(x => x.ctrl.ce === null && x.ctrl.sr === null && !x.ctrl.latch && x.ctrl.clk === s.mctrl.clk && x.ctrl.clkInv === s.mctrl.clkInv);
      if (f && !s.ff[X]) { placeFf(s, X, f, 'mux'); s.out[X] = side; }
    }
  };
  // SRLC16E chains through Q15 (#2): each one's Q15 the D of the next (its only load; the same clock and enable), as
  // ISE's map packs them: up to four on the two SLICEMs of a CLB, G then F of the upper one (F's data G's Q15 through
  // SHIFTIN), its SHIFTOUT (F's Q15) into the lower one's SHIFTIN (DIG_MUX = SHIFTIN; the CLB's switch SHIFTOUT2 ->
  // SHIFTIN0), G then F of the lower one; measured with ISE (research/s3e-bitstream gen-cascade.mjs): no bits. (The
  // lower one's SHIFTOUT leaves the CLB only through XB, not measured: a longer chain, or Q15 into anything else, is
  // refused.)
  const q15Next = c => {
    const n = /^SRLC16E?(_1)?$/.test(c.type) ? c.pins.Q15 : undefined;
    const loads = n === undefined ? [] : nets[n]?.loads || [];
    if (!loads.length) return null;
    const x = loads.length === 1 && loads[0].pin === 'D' ? cells[loads[0].cell] : null;
    if (!x || !memCells.includes(x) || SLICEM_MEM[x.type] !== 'srl' || memKey(x) !== memKey(c)) {
      throw new PackError(`pack: ${c.type} ${c.name}: the cascade output Q15 into anything but the D of one shift register of the same clock and enable is not supported yet`);
    }
    return x;
  };
  const q15Prev = new Set(memCells.map(q15Next).filter(Boolean));
  const memUsed = new Set();
  for (const c of memCells) {
    if (q15Prev.has(c) || !q15Next(c)) continue;
    const chain = [c];
    for (let x = q15Next(c); x; x = q15Next(x)) chain.push(x);
    if (chain.length > 4) throw new PackError(`pack: ${c.type} ${c.name}: a chain of ${chain.length} shift registers through Q15 is not supported yet (at most 4, on the two SLICEMs of a CLB)`);
    for (const x of chain) memUsed.add(x);
    const up = memSlice(c);
    putMem(up, 'G', chain[0]);
    putMem(up, 'F', chain[1], true);
    if (chain.length < 3) continue;
    const lo = memSlice(chain[2]);
    putMem(lo, 'G', chain[2], true);
    if (chain[3]) putMem(lo, 'F', chain[3], true);
    up.shiftOut = true;
    macros.push({ kind: 'SRL', members: [{ inst: lo.idx, dx: 0, dy: 0 }, { inst: up.idx, dx: 0, dy: 1 }], align: [1, 2], net: chain[1].pins.Q15 });
  }
  // (a ring of them has no first one)
  const ring = memCells.find(c => q15Prev.has(c) && !memUsed.has(c));
  if (ring) throw new PackError(`pack: ${ring.type} ${ring.name}: a ring of shift registers through Q15 is not supported`);
  for (const c of memCells) {
    if (memUsed.has(c)) continue;
    // (the second of a cascade is placed with the first)
    if (memCells.some(h => h !== c && !memUsed.has(h) && cascadeOf(h) === c)) continue;
    memUsed.add(c);
    const kind = SLICEM_MEM[c.type];
    const s = memSlice(c);
    if (kind === 'ramd') {
      // G: the write port, read at A (SPO); F: read at DPRA (DPO), written at G's address (WF from WG)
      memLut(s, 'G', c, { init: memInit(c, 16), mode: 'DUAL_PORT', out: c.pins.SPO });
      memLut(s, 'F', c, { addr: [0, 1, 2, 3].map(j => c.pins[`DPRA${j}`]), addrPins: ['DPRA0', 'DPRA1', 'DPRA2', 'DPRA3'], init: memInit(c, 16), mode: 'DUAL_PORT', out: c.pins.DPO });
      memData(s, 'G', c);
      s.dmux.F = 'ALTDIF';
      s.wf = s.wg = true;
      where.set(ci(c), { inst: s.idx, bel: 'SITE', outs: { SPO: 'G', DPO: 'F' } });
      continue;
    }
    if (kind === 'ram32') {
      const init = memInit(c, 32);
      memLut(s, 'G', c, { init: init % 65536, out: null });
      memLut(s, 'F', c, { init: Math.floor(init / 65536), out: null });
      memData(s, 'G', c);
      s.dmux.F = 'ALTDIF';
      // A4: the F5 multiplexer's select (F = A4 high) and the write strobe's address bit (SLICEWE0)
      setBypass(s, 'X', c.pins.A4);
      setSink(ci(c), 'A4', { inst: s.idx, pin: 'BX', kind: 'gen' });
      s.f5 = { name: `${c.name}_F5` };
      s.wf = s.wg = true;
      s.we0 = true;
      where.set(ci(c), { inst: s.idx, bel: 'SITE', outs: { O: 'F5' } });
      continue;
    }
    // RAM16X1S / SRL16: G first; a second cell of the same kind and controls (and, for RAMs, the
    // same address) takes F
    putMem(s, 'G', c);
    const next = cascadeOf(c);
    if (next && !memUsed.has(next)) { memUsed.add(next); putMem(s, 'F', next, true); continue; }
    const sameAddr = x => kind === 'srl' || addrNets(x).every((n, j) => n === addrNets(c)[j]);
    const mate = memCells.find(x => !memUsed.has(x) && SLICEM_MEM[x.type] === kind && memKey(x) === memKey(c) && sameAddr(x));
    if (mate) { memUsed.add(mate); putMem(s, 'F', mate); }
  }
  stats.slicem = insts.filter(s => s.slicem).length;
}

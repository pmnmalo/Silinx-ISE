// Test helper (not a test file): two small cycle simulators that check the packer without ISE.
//
//   netlistSim(nl)     the Yosys netlist (packages/silinx-fpga/src/fpga/netlist.js): LUT1..4, INV, MUXF5..8, MUXCY, XORCY,
//                      FD*/LD* flip-flops and latches, IBUF / OBUF / OBUFT (z: high impedance) / BUFG, distributed RAMs
//                      (RAM16X1S / RAM32X1S / RAM64X1S / RAM16X1D), MULT18X18; and the combinational
//                      gates of Yosys's internal cell library ($_AND_, $_MUX_… after a generic
//                      `synth`) (CELLS_SIMULATED)
//   packedSim(packed)  the packed design (packages/silinx-fpga/src/fpga/pack.js) read from its XDL configuration strings
//                      and site-pin nets, with the slice as the Spartan-3E slice works (as the
//                      XDLRC primitive_def SLICEL describes its elements and connections)
//
// Both: sim.step({ port bit name: 0 | 1 }) applies the inputs and settles; sim.out() -> { port bit: v }.
// Flip-flops start at their INIT (as after configuration). Clock edges are found by comparing a
// clock pin with its value at the previous step.
import { evalLut } from '../src/xdl.js';
import { paramBits, paramInt } from '../src/fpga/netlist.js';

const LUT_K = { LUT1: 1, LUT2: 2, LUT3: 3, LUT4: 4 };
const RAM_A = { RAM16X1S: 4, RAM32X1S: 5, RAM64X1S: 6, RAM16X1D: 4 };
// an IOB's registers: [register, its group's prefix (ICEINV, OFFATTRBOX…), its clock pin, its data]; the second
// flip-flops too (#749; both, with the DDR registers, #96)
const IOB_FFS = [['IFF1', 'I', 'ICLK1', 'PAD'], ['OFF1', 'O', 'OTCLK1', 'O1'], ['TFF1', 'T', 'OTCLK1', 'T1'],
  ['IFF2', 'I', 'ICLK2', 'PAD'], ['OFF2', 'O', 'OTCLK2', 'O2'], ['TFF2', 'T', 'OTCLK2', 'T2']];
/** The cell types netlistSim models. */
export const CELLS_SIMULATED = /^(LUT[1-4]|INV|MUXF[5-8]|MUXCY|XORCY|(FDRE|FDSE|FDCE|FDPE|LDCE|LDPE)(_1)?|IBUF|IBUFG|OBUF|OBUFT|IOBUF|BUFG|BUF|IDDR2|ODDR2|RAM16X1S|RAM32X1S|RAM64X1S|RAM16X1D|MULT18X18|MULT18X18S|MULT18X18SIO|SRLC?16E?(_1)?|RAMB16_S(1|2|4|9|18|36)(_S(1|2|4|9|18|36))?|\$_(BUF|NOT|AND|NAND|OR|NOR|XOR|XNOR|ANDNOT|ORNOT|MUX|NMUX|AOI3|OAI3|AOI4|OAI4)_)$/;

// ------------------------------------------------------------------ block RAM and multiplier (both simulators)
// a block-RAM port of each width: data bits, parity bits, address bits (as core/unisim.js)
const BRAM_W = { 1: [1, 0, 14], 2: [2, 0, 13], 4: [4, 0, 12], 9: [8, 1, 11], 18: [16, 2, 10], 36: [32, 4, 9] };
const WIDTH_OF_ATTR = { '16384X1': 1, '8192X2': 2, '4096X4': 4, '2048X9': 9, '1024X18': 18, '512X36': 36 };
/** The memory of a block RAM: initBits(name) -> the 256 bits (least significant first) of INIT_xx / INITP_xx. */
function bramMemory(initBits) {
  const mem = new Uint8Array(16384), par = new Uint8Array(2048);
  for (let k = 0; k < 64; k++) { const b = initBits(`INIT_${k.toString(16).toUpperCase().padStart(2, '0')}`); for (let j = 0; j < 256; j++) mem[k * 256 + j] = b[j] || 0; }
  for (let k = 0; k < 8; k++) { const b = initBits(`INITP_${k.toString(16).toUpperCase().padStart(2, '0')}`); for (let j = 0; j < 256; j++) par[k * 256 + j] = b[j] || 0; }
  return { mem, par };
}
/** A clock edge on an enabled port (as core/unisim.js RAMB16_S*): SSR loads SRVAL, else the read
 *  word (WRITE_MODE), and the write. inp: { a, ssr, we, di: [bits], dip: [bits] }; out: the output
 *  latches (data then parity bits). Returns the new output latches; writes into m — after the reads
 *  of every port at this edge (m.writes: a port reading the word the other one writes at the same
 *  edge reads the old word, as core/unisim.js and the hardware's READ_FIRST). */
function bramEdge(m, w, mode, srval, inp, out) {
  const [d, p] = BRAM_W[w];
  let o = out;
  if (inp.ssr) o = srval.slice(0, d + p);
  else if (!inp.we || mode === 'READ_FIRST') o = [...Array.from({ length: d }, (_, k) => m.mem[inp.a * d + k]), ...Array.from({ length: p }, (_, k) => m.par[inp.a * p + k])];
  else if (mode === 'WRITE_FIRST') o = [...inp.di, ...inp.dip];
  if (inp.we) (m.writes ||= []).push(() => { inp.di.forEach((b, k) => { m.mem[inp.a * d + k] = b; }); inp.dip.forEach((b, k) => { m.par[inp.a * p + k] = b; }); });
  return o;
}
/** The writes of a block RAM's ports at an edge, after their reads (bramEdge). */
function bramWrites(m) { for (const w of m.writes || []) w(); m.writes = []; }
const bitsOf = (v, n) => { const b = paramBits(v) || []; return Array.from({ length: n }, (_, i) => b[i] || 0); };
const hexBits = (h, n) => { let x = BigInt(`0x${h || '0'}`); return Array.from({ length: n }, () => { const b = Number(x & 1n); x >>= 1n; return b; }); };
/** The product of a multiplier: signed 18 x 18 -> 36 bits (as bits). */
function mult18(a, b) {
  const num = bits => { let n = 0n; bits.forEach((x, j) => { if (x) n |= 1n << BigInt(j); }); return BigInt.asIntN(18, n); };
  const prod = BigInt.asUintN(36, num(a) * num(b));
  return Array.from({ length: 36 }, (_, j) => Number((prod >> BigInt(j)) & 1n));
}
// Yosys's internal gates (techlibs/common/simcells.v): output Y
const GATE = {
  $_BUF_: p => p('A'), $_NOT_: p => 1 - p('A'),
  $_AND_: p => p('A') & p('B'), $_NAND_: p => 1 - (p('A') & p('B')), $_OR_: p => p('A') | p('B'), $_NOR_: p => 1 - (p('A') | p('B')),
  $_XOR_: p => p('A') ^ p('B'), $_XNOR_: p => 1 - (p('A') ^ p('B')), $_ANDNOT_: p => p('A') & (1 - p('B')), $_ORNOT_: p => p('A') | (1 - p('B')),
  $_MUX_: p => (p('S') ? p('B') : p('A')), $_NMUX_: p => 1 - (p('S') ? p('B') : p('A')),
  $_AOI3_: p => 1 - ((p('A') & p('B')) | p('C')), $_OAI3_: p => 1 - ((p('A') | p('B')) & p('C')),
  $_AOI4_: p => 1 - ((p('A') & p('B')) | (p('C') & p('D'))), $_OAI4_: p => 1 - ((p('A') | p('B')) & (p('C') | p('D'))),
};

export function netlistSim(nl) {
  const v = new Array(nl.nets.length).fill(0);
  v[1] = 1;
  const inPorts = new Map(), outPorts = new Map();
  for (const p of nl.ports) for (const b of p.bits) (p.dir === 'in' ? inPorts : outPorts).set(b.name, b.net);
  // a bidirectional pad (#96, an IOBUF on an inout port): its value from outside (the inputs, by the port's bit) while the
  // design does not drive it; the design's drive (or z) out
  const ext = new Map(), iobufOn = new Map();   // the port's net -> its value from outside, its IOBUF
  for (const c of nl.cells) if (c.type === 'IOBUF') iobufOn.set(c.pins.IO, c);
  for (const p of nl.ports) for (const b of p.bits) if (p.dir === 'inout') inPorts.set(b.name, b.net);
  const ffs = [];
  for (const c of nl.cells) {
    const m = /^(FD|LD)(\w*?)(_1)?$/.exec(c.type);
    if (!m) continue;
    const init = paramBits(c.params.INIT)?.[0] ?? (/^(FDSE|FDPE|FDS|FDP|LDPE)$/.test(c.type.replace(/_1$/, '')) ? 1 : 0);
    ffs.push({ c, latch: m[1] === 'LD', neg: !!m[3], q: init, prevClk: 0 });
  }
  // the DDR registers (#96) as two flip-flops each: D into Q0 on C0, into Q1 on C1 (an ODDR2's D0 / D1 into two nets of
  // its own, its Q the first while C0 is high, else the second); R before S, SYNC or ASYNC (SRTYPE)
  const oddr = new Map();   // ODDR2 cell -> its two registers' nets
  for (const c of nl.cells) if (/^(IDDR2|ODDR2)$/.test(c.type)) {
    const i = c.type === 'IDDR2', qs = i ? [c.pins.Q0, c.pins.Q1] : [v.push(0) - 1, v.push(0) - 1];
    if (!i) oddr.set(c, qs);
    [0, 1].forEach(k => ffs.push({ c: { type: 'DDR', params: { IS_C_INVERTED: c.params[`IS_C${k}_INVERTED`], SRTYPE: c.params.SRTYPE },
      pins: { C: c.pins[`C${k}`], CE: c.pins.CE, R: c.pins.R, S: c.pins.S, D: i ? c.pins.D : c.pins[`D${k}`], Q: qs[k] } },
    latch: false, neg: false, q: paramInt(c.params[i ? `INIT_Q${k}` : 'INIT']) & 1, prevClk: 0 }));
  }
  // distributed RAMs: contents from INIT, written on the rising WCLK edge when WE
  const rams = [];
  for (const c of nl.cells) if (RAM_A[c.type]) {
    const n = 1 << RAM_A[c.type];
    const bits = paramBits(c.params.INIT) || [];
    rams.push({ c, k: RAM_A[c.type], mem: Array.from({ length: n }, (_, i) => bits[i] || 0), prevClk: 0 });
  }
  const ramOf = new Map(rams.map(r => [r.c, r]));
  // shift registers (SRL16*: Q = the stage at A, D shifts in at address 0), block RAMs, multipliers
  const pinOf = (c, name, i, w) => (w === 1 && c.pins[name] !== undefined ? c.pins[name] : c.pins[`${name}<${i}>`]);
  const srls = [], brams = [], mults = [];
  for (const c of nl.cells) {
    if (/^SRLC?16E?(_1)?$/.test(c.type)) srls.push({ c, mem: bitsOf(c.params.INIT, 16), prevClk: 0, inv: (/_1$/.test(c.type) ? 1 : 0) ^ paramInt(c.params.IS_CLK_INVERTED) });
    const m = /^RAMB16_S(\d+)(?:_S(\d+))?$/.exec(c.type);
    if (m) {
      const ports = (m[2] ? [['A', +m[1]], ['B', +m[2]]] : [['', +m[1]]]).map(([x, w]) => {
        const [d, p] = BRAM_W[w], g = x ? `_${x}` : '';
        return { x, w, mode: String(c.params[`WRITE_MODE${g}`] || 'WRITE_FIRST').trim(), init: bitsOf(c.params[`INIT${g}`], d + p), srval: bitsOf(c.params[`SRVAL${g}`], d + p), prevClk: 0 };
      });
      for (const pt of ports) pt.out = pt.init.slice();
      brams.push({ c, ports, m: bramMemory(k => bitsOf(c.params[k] ?? c.params[k.replace(/[A-F]$/, x => x.toLowerCase())], 256)) });
    }
    if (/^MULT18X18S(IO)?$/.test(c.type)) mults.push({ c, a: new Array(18).fill(0), b: new Array(18).fill(0), p: new Array(36).fill(0), prevClk: 0 });
  }
  const bus = (c, name, n) => Array.from({ length: n }, (_, j) => v[c.pins[`${name}<${j}>`]] || 0);
  const multReg = (c, k) => (c.type === 'MULT18X18S' ? k === 'PREG' : paramInt(c.params[k], 1) === 1);
  // B: from BCIN, the BCOUT of the multiplier below, with B_INPUT = CASCADE (#2); BCOUT is B after its register
  const multB = c => (String(c.params.B_INPUT || 'DIRECT').trim().toUpperCase() === 'CASCADE' ? bus(c, 'BCIN', 18) : bus(c, 'B', 18));
  const addr = (c, pfx, k) => { let a = 0; for (let j = 0; j < k; j++) a |= v[c.pins[`${pfx}${j}`]] << j; return a; };
  const setOut = (c, val) => { const n = c.pins.O; if (n !== undefined && n > 1) v[n] = val; };
  const comb = () => {
    for (let it = 0; it < 200; it++) {
      let changed = false;
      const put = (n, val) => { if (n > 1 && v[n] !== val) { v[n] = val; changed = true; } };
      for (const f of ffs) put(f.c.pins.Q, f.q);
      for (const c of nl.cells) {
        const p = k => v[c.pins[k]];
        let o;
        if (GATE[c.type]) { put(c.pins.Y, GATE[c.type](p)); continue; }
        if (LUT_K[c.type]) { const bits = paramBits(c.params.INIT); let i = 0; for (let j = 0; j < LUT_K[c.type]; j++) i |= p(`I${j}`) << j; o = bits[i] || 0; }
        else if (c.type === 'INV') o = 1 - p('I');
        else if (/^MUXF[5-8]$/.test(c.type)) o = p('S') ? p('I1') : p('I0');
        else if (c.type === 'MUXCY') o = p('S') ? p('CI') : p('DI');
        else if (c.type === 'XORCY') o = p('CI') ^ p('LI');
        else if (/^(IBUF|IBUFG|OBUF|BUFG|BUF)$/.test(c.type)) o = p('I');
        else if (c.type === 'OBUFT') o = p('T') ? 'z' : p('I');
        else if (c.type === 'IOBUF') o = p('T') ? ext.get(c.pins.IO) || 0 : p('I');
        else if (c.type === 'ODDR2') { const q = oddr.get(c); put(c.pins.Q, v[q[(p('C0') ^ paramInt(c.params.IS_C0_INVERTED)) ? 0 : 1]]); continue; }
        else if (RAM_A[c.type]) {
          const r = ramOf.get(c);
          if (c.type === 'RAM16X1D') { put(c.pins.SPO, r.mem[addr(c, 'A', 4)]); put(c.pins.DPO, r.mem[addr(c, 'DPRA', 4)]); continue; }
          o = r.mem[addr(c, 'A', r.k)];
        } else if (/^SRLC?16E?(_1)?$/.test(c.type)) {
          const r = srls.find(x => x.c === c);
          o = r.mem[addr(c, 'A', 4)];
          put(c.pins.Q, o);
          if (c.pins.Q15 !== undefined) put(c.pins.Q15, r.mem[15]);
          continue;
        } else if (/^RAMB16_S/.test(c.type)) {
          const r = brams.find(x => x.c === c);
          for (const pt of r.ports) {
            const [d, p] = BRAM_W[pt.w];
            for (let k = 0; k < d; k++) { const n = pinOf(c, `DO${pt.x}`, k, d); if (n !== undefined) put(n, pt.out[k]); }
            for (let k = 0; k < p; k++) { const n = pinOf(c, `DOP${pt.x}`, k, p); if (n !== undefined) put(n, pt.out[d + k]); }
          }
          continue;
        } else if (/^MULT18X18S(IO)?$/.test(c.type)) {
          const r = mults.find(x => x.c === c);
          const b = multReg(c, 'BREG') ? r.b : multB(c);
          const pr = multReg(c, 'PREG') ? r.p : mult18(multReg(c, 'AREG') ? r.a : bus(c, 'A', 18), b);
          for (let j = 0; j < 36; j++) put(c.pins[`P<${j}>`], pr[j]);
          for (let j = 0; j < 18; j++) if (c.pins[`BCOUT<${j}>`] !== undefined) put(c.pins[`BCOUT<${j}>`], b[j]);
          continue;
        } else if (c.type === 'MULT18X18') {
          // signed 18 x 18 -> 36 bits
          const num = pfx => { let n = 0n; for (let j = 0; j < 18; j++) if (v[c.pins[`${pfx}<${j}>`]]) n |= 1n << BigInt(j); return BigInt.asIntN(18, n); };
          const prod = BigInt.asUintN(36, num('A') * num('B'));
          for (let j = 0; j < 36; j++) put(c.pins[`P<${j}>`], Number((prod >> BigInt(j)) & 1n));
          continue;
        } else continue;
        put(c.pins.O, o);
      }
      // latches are transparent while their gate is active; they follow the logic once it has
      // settled (both simulators do the same, so a gate and a data input changing together do
      // not race differently in the two)
      if (changed) continue;
      for (const f of ffs) if (f.latch) {
        const c = f.c, g = v[c.pins.G] ^ (f.neg ? 1 : 0) ^ paramInt(c.params.IS_G_INVERTED);
        const ge = c.pins.GE === undefined ? 1 : pinv(c, 'GE');
        const clr = c.pins.CLR !== undefined && pinv(c, 'CLR'), pre = c.pins.PRE !== undefined && pinv(c, 'PRE');
        const q = clr ? 0 : pre ? 1 : g && ge ? v[c.pins.D] : f.q;
        if (q !== f.q) { f.q = q; changed = true; }
      }
      if (!changed) return;
    }
    throw new Error('netlistSim: combinational loop');
  };
  // a flip-flop's or latch's control pin, with its IS_<pin>_INVERTED
  const pinv = (c, p) => v[c.pins[p]] ^ paramInt(c.params[`IS_${p}_INVERTED`]);
  void setOut;
  return {
    step(inputs) {
      for (const [k, val] of Object.entries(inputs)) if (inPorts.has(k)) { if (iobufOn.has(inPorts.get(k))) ext.set(inPorts.get(k), val); else v[inPorts.get(k)] = val; }
      comb();
      // flip-flops: asynchronous set / reset, then clock edges
      let again = true;
      for (let round = 0; round < 4 && again; round++) {
        again = false;
        for (const f of ffs) if (!f.latch) {
          const c = f.c, t = c.type.replace(/_1$/, '');
          const clk = v[c.pins.C] ^ (f.neg ? 1 : 0) ^ paramInt(c.params.IS_C_INVERTED);
          const ce = c.pins.CE === undefined ? 1 : pinv(c, 'CE');
          let q = f.q;
          const ddr = t === 'DDR', async = ddr && /ASYNC/i.test(String(c.params.SRTYPE));
          if (t === 'FDCE' && pinv(c, 'CLR')) q = 0;
          else if (t === 'FDPE' && pinv(c, 'PRE')) q = 1;
          else if (async && pinv(c, 'R')) q = 0;
          else if (async && pinv(c, 'S')) q = 1;
          else if (clk && !f.prevClk) {
            if ((t === 'FDRE' || ddr) && pinv(c, 'R')) q = 0;
            else if ((t === 'FDSE' || ddr) && pinv(c, 'S')) q = 1;
            else if (ce) q = v[c.pins.D];
          }
          f.next = q;
          f.nextClk = clk;
        }
        const writes = [];
        for (const r of rams) {
          const c = r.c, clk = v[c.pins.WCLK] ^ paramInt(c.params.IS_WCLK_INVERTED);
          if (clk && !r.prevClk && v[c.pins.WE]) writes.push([r, addr(c, 'A', r.k), v[c.pins.D]]);
          r.nextClk = clk;
        }
        for (const [r, a, d] of writes) if (r.mem[a] !== d) { r.mem[a] = d; again = true; }
        for (const r of rams) r.prevClk = r.nextClk;
        // shift registers, block RAMs and multipliers (their inputs as before the edge)
        const later = [];
        for (const r of srls) {
          const c = r.c, clk = v[c.pins.CLK] ^ r.inv;
          if (clk && !r.prevClk && (c.pins.CE === undefined || v[c.pins.CE])) later.push(() => { r.mem = [v[c.pins.D], ...r.mem.slice(0, 15)]; });
          r.nextClk = clk;
        }
        for (const r of brams) for (const [n, pt] of r.ports.entries()) {
          const c = r.c, clk = v[c.pins[`CLK${pt.x}`]];
          if (clk && !pt.prevClk && v[c.pins[`EN${pt.x}`]]) {
            const [d, p, aw] = BRAM_W[pt.w];
            let a = 0;
            for (let j = 0; j < aw; j++) a |= (v[pinOf(c, `ADDR${pt.x}`, j, aw)] || 0) << j;
            const inp = { a, ssr: v[c.pins[`SSR${pt.x}`]], we: v[c.pins[`WE${pt.x}`]],
              di: Array.from({ length: d }, (_, k) => v[pinOf(c, `DI${pt.x}`, k, d)] || 0), dip: Array.from({ length: p }, (_, k) => v[pinOf(c, `DIP${pt.x}`, k, p)] || 0) };
            later.push(() => { pt.out = bramEdge(r.m, pt.w, pt.mode, pt.srval, inp, pt.out); });
          }
          pt.nextClk = clk;
          if (n === r.ports.length - 1) later.push(() => bramWrites(r.m));
        }
        for (const r of mults) {
          const c = r.c, clk = v[c.pins.CLK ?? c.pins.C];
          if (clk && !r.prevClk) {
            const pin = k => (c.pins[k] === undefined ? 0 : v[c.pins[k]]);
            const A = bus(c, 'A', 18), B = multB(c);
            const a = multReg(c, 'AREG') ? r.a : A, b = multReg(c, 'BREG') ? r.b : B, prod = mult18(a, b);
            const S = c.type === 'MULT18X18S';
            later.push(() => {
              if (!S) { if (pin('RSTA')) r.a = new Array(18).fill(0); else if (pin('CEA')) r.a = A; if (pin('RSTB')) r.b = new Array(18).fill(0); else if (pin('CEB')) r.b = B; }
              if (pin(S ? 'R' : 'RSTP')) r.p = new Array(36).fill(0); else if (pin(S ? 'CE' : 'CEP')) r.p = prod;
            });
          }
          r.nextClk = clk;
        }
        if (later.length) again = true;
        for (const f of later) f();
        for (const r of [...srls, ...mults]) r.prevClk = r.nextClk;
        for (const r of brams) for (const pt of r.ports) pt.prevClk = pt.nextClk;
        for (const f of ffs) if (!f.latch) { if (f.q !== f.next) again = true; f.q = f.next; f.prevClk = f.nextClk; }
        comb();
      }
    },
    out() {
      const o = {};
      for (const [k, n] of outPorts) { const c = iobufOn.get(n); o[k] = c ? (v[c.pins.T] ? 'z' : v[c.pins.I]) : v[n]; }
      return o;
    },
  };
}

/** The packed design simulated from its cfg strings. */
export function packedSim(packed) {
  const insts = packed.insts;
  const cfgOf = i => {
    const m = new Map();
    for (const c of i.cfg) m.set(c.attr, c);
    return m;
  };
  const C = insts.map(cfgOf);
  // pin values: inputs by inst:pin, outputs by inst:pin
  const pinNet = new Map();   // `${inst}:${pin}` (input) -> net index
  const netVal = packed.nets.map(n => (n.type === 'vcc' ? 1 : 0));
  const drv = new Map();      // `${inst}:${pin}` (output) -> nets driven
  packed.nets.forEach((n, k) => {
    for (const p of n.inpins) pinNet.set(`${p.inst}:${p.pin}`, k);
    for (const p of n.outpins) { const key = `${p.inst}:${p.pin}`; if (!drv.has(key)) drv.set(key, []); drv.get(key).push(k); }
  });
  const pin = (i, p) => { const k = pinNet.get(`${i}:${p}`); return k === undefined ? 0 : netVal[k]; };
  const st = insts.map((inst, i) => {
    const c = C[i];
    const init = X => (c.get(`FF${X}_INIT_ATTR`)?.value === 'INIT1' ? 1 : 0);
    const r = { q: { X: init('X'), Y: init('Y') }, prevClk: 0 };
    // a SLICEM's RAM / shift-register LUTs: their 16 bits (D=0x…: bit a = address a)
    for (const side of ['F', 'G']) { const m = /^#RAM:D=0x([0-9a-fA-F]+)$/.exec(c.get(side)?.value || ''); if (m) (r.mem ||= {})[side] = hexBits(m[1], 16); }
    if (inst.kind === 'bram') {
      r.m = bramMemory(k => hexBits(c.get(`${k.slice(0, -2)}${k.slice(-2).toLowerCase()}`)?.value ?? c.get(k)?.value, 256));
      r.ports = ['A', 'B'].filter(x => c.has(`PORT${x}_ATTR`)).map(x => {
        const w = WIDTH_OF_ATTR[c.get(`PORT${x}_ATTR`).value], [d, p] = BRAM_W[w];
        const init = hexBits(c.get(`INIT_${x}`)?.value, d + p);
        return { x, w, mode: c.get(`WRITEMODE${x}`)?.value || 'WRITE_FIRST', srval: hexBits(c.get(`SRVAL_${x}`)?.value, d + p), out: init, prevClk: 0 };
      });
    }
    if (inst.kind === 'mult') Object.assign(r, { a: new Array(18).fill(0), b: new Array(18).fill(0), p: new Array(36).fill(0) });
    // an IOB's registers (#96): IFF1, OFF1, TFF1 at their INIT; ICLK1 and OTCLK1 as they were at the last step
    if (inst.kind === 'iob') Object.assign(r, { iq: Object.fromEntries(IOB_FFS.map(([ff]) => [ff, c.get(`${ff}_INIT_ATTR`)?.value === 'INIT1' ? 1 : 0])), prev: { ICLK1: 0, OTCLK1: 0, ICLK2: 0, OTCLK2: 0 } });
    return r;
  });
  const pads = new Map();
  insts.forEach((inst, i) => { if (inst.kind === 'iob') pads.set(C[i].get('PAD').name, i); });
  const padIn = new Map();
  // the outputs of one instance from its inputs and state
  function evalInst(i) {
    const inst = insts[i], c = C[i], o = {};
    if (inst.kind === 'iob') {
      if (inst.dir === 'in') { o.I = padIn.get(c.get('PAD').name) || 0; o.IQ1 = st[i].iq.IFF1; o.IQ2 = st[i].iq.IFF2; }
      // (a bidirectional pad's input, #96: its own drive, or the outside's while T1 is 1)
      else if (c.has('INBUF')) o.I = c.has('TMUX') && pin(i, 'T1') ? padIn.get(c.get('PAD').name) || 0 : pin(i, 'O1');
      return o;
    }
    if (inst.kind === 'bufg') { o.O = pin(i, 'I0'); return o; }
    const val = a => c.get(a)?.value;
    if (inst.kind === 'bram') {
      for (const pt of st[i].ports) {
        const [d, p] = BRAM_W[pt.w];
        for (let k = 0; k < d; k++) o[`DO${pt.x}${k}`] = pt.out[k];
        for (let k = 0; k < p; k++) o[`DOP${pt.x}${k}`] = pt.out[d + k];
      }
      return o;
    }
    if (inst.kind === 'mult') {
      const r = st[i], bus = (n, w) => Array.from({ length: w }, (_, j) => pin(i, `${n}${j}`));
      const b = val('BREG') === '1' ? r.b : bus(val('B_INPUT') === 'CASCADE' ? 'BCIN' : 'B', 18);
      const pr = val('PREG') === '1' ? r.p : mult18(val('AREG') === '1' ? r.a : bus('A', 18), b);
      pr.forEach((x, j) => { o[`P${j}`] = x; });
      b.forEach((x, j) => { o[`BCOUT${j}`] = x; });
      return o;
    }
    const lut = side => {
      const e = c.get(side);
      if (!e) return 0;
      if (st[i].mem?.[side]) {
        // read address: the LUT's own pins (A1-A4 = pins 1-4)
        let a = 0;
        for (let j = 0; j < 4; j++) a |= pin(i, `${side}${j + 1}`) << j;
        return st[i].mem[side][a];
      }
      const eq = e.value.replace(/^#LUT:/, '');
      return evalLut(eq, { A1: pin(i, `${side}1`), A2: pin(i, `${side}2`), A3: pin(i, `${side}3`), A4: pin(i, `${side}4`) });
    };
    const F = lut('F'), G = lut('G');
    const inv = (name, p) => (val(name) === `${p}_B` ? 1 - pin(i, p) : pin(i, p));
    const BX = inv('BXINV', 'BX'), BY = inv('BYINV', 'BY');
    const F5 = BX ? F : G;
    const FX = BY ? pin(i, 'FXINA') : pin(i, 'FXINB');
    const cin = val('CYINIT') === 'BX' ? BX : pin(i, 'CIN');
    const cy0 = (v, side) => ({ 0: 0, 1: 1, BX, BY, F1: pin(i, 'F1'), F2: pin(i, 'F2'), G1: pin(i, 'G1'), G2: pin(i, 'G2'), PROD: side === 'F' ? pin(i, 'F1') & pin(i, 'F2') : pin(i, 'G1') & pin(i, 'G2') }[v]);
    const selF = val('CYSELF') === '1' ? 1 : F, selG = val('CYSELG') === '1' ? 1 : G;
    const cyF = selF ? cin : cy0(val('CY0F'), 'F');
    const cyG = selG ? cyF : cy0(val('CY0G'), 'G');
    const xorF = F ^ cin, xorG = G ^ cyF;
    const fxmux = { F, F5, FXOR: xorF }[val('FXMUX')] ?? 0;
    const gymux = { G, FX, GXOR: xorG }[val('GYMUX')] ?? 0;
    // (SHIFTOUT: F's last stage, into the SHIFTIN of the SLICEM below, #2)
    Object.assign(o, { X: fxmux, Y: gymux, XB: cyF, YB: cyG, COUT: cyG, F5, FX, XQ: st[i].q.X, YQ: st[i].q.Y, SHIFTOUT: st[i].mem?.F?.[15] ?? 0 });
    o._d = { X: val('DXMUX') === '1' ? fxmux : BX, Y: val('DYMUX') === '1' ? gymux : BY };
    return o;
  }
  const outs = new Array(insts.length);
  const comb = () => {
    for (let it = 0; it < 400; it++) {
      let changed = false;
      for (let i = 0; i < insts.length; i++) {
        const o = evalInst(i);
        outs[i] = o;
        for (const [p, x] of Object.entries(o)) {
          if (p === '_d') continue;
          for (const k of drv.get(`${i}:${p}`) || []) if (netVal[k] !== x) { netVal[k] = x; changed = true; }
        }
      }
      if (changed) continue;
      // latches: transparent while the clock (gate) is LOW after the inverter, once the logic has settled
      for (let i = 0; i < insts.length; i++) {
        const c = C[i];
        for (const X of ['X', 'Y']) if (c.get(`FF${X}`)?.value === '#LATCH') {
          const q = ffNext(i, X, true);
          if (q !== st[i].q[X]) { st[i].q[X] = q; changed = true; }
        }
      }
      if (!changed) return;
    }
    throw new Error('packedSim: combinational loop');
  };
  // the next value of a flip-flop / latch: edge = a rising clock edge happened (or, for a latch, the gate is open)
  // the next values of an IOB's registers (#96): { ff: value }, and its clocks now; D of IFF1 the pad, of OFF1 / TFF1
  // O1 / T1 (through O1INV / T1INV); one SR (SRINV) for all, each register's SR_ATTR and ATTRBOX; an input
  // register's REV (an IDDR2's S, #96) the value SR does not give
  function iobNext(i) {
    const c = C[i], val = a => c.get(a)?.value, r = st[i];
    const inv = p => (val(`${p}INV`) === `${p}_B` ? 1 - pin(i, p) : pin(i, p));
    const clk = { ICLK1: inv('ICLK1'), OTCLK1: inv('OTCLK1'), ICLK2: inv('ICLK2'), OTCLK2: inv('OTCLK2') };
    const next = {};
    for (const [ff, g, ck, d] of IOB_FFS) {
      if (val(ff) !== '#FF') continue;
      const q = r.iq[ff], ce = c.has(`${g}CEINV`) ? inv(`${g}CE`) : 1;
      const sr = c.has(`${ff}_SR_ATTR`) && c.has('SRINV') ? inv('SR') : 0, srv = val(`${ff}_SR_ATTR`) === 'SRHIGH' ? 1 : 0;
      const rev = g === 'I' && c.has('REVINV') ? inv('REV') : 0;
      const data = d === 'PAD' ? padIn.get(c.get('PAD').name) || 0 : inv(d);
      if ((sr || rev) && val(`${g}FFATTRBOX`) !== 'SYNC') next[ff] = sr ? srv : 1 - srv;
      else if (!(clk[ck] && !r.prev[ck])) next[ff] = q;
      else next[ff] = sr ? srv : rev ? 1 - srv : ce ? data : q;
    }
    return { next, clk };
  }
  function ffNext(i, X, latch) {
    const c = C[i], val = a => c.get(a)?.value;
    const clk = val('CLKINV') === 'CLK_B' ? 1 - pin(i, 'CLK') : pin(i, 'CLK');
    const ce = c.has('CEINV') ? (val('CEINV') === 'CE_B' ? 1 - pin(i, 'CE') : pin(i, 'CE')) : 1;
    const sr = c.has('SRINV') ? (val('SRINV') === 'SR_B' ? 1 - pin(i, 'SR') : pin(i, 'SR')) : 0;
    const srv = val(`FF${X}_SR_ATTR`) === 'SRHIGH' ? 1 : 0;
    const sync = val('SYNC_ATTR') === 'SYNC';
    const q = st[i].q[X];
    // in a slice whose SR is the write / shift enable of its RAMs or shift registers (WSGEN), the
    // flip-flops have no set / reset (ISE's map packs flip-flops beside an always-enabled shift
    // register this way, SR = 1)
    if (c.has('WSGEN')) return latch ? q : (clk && !st[i].prevClk && ce ? outs[i]._d[X] : q);
    if (sr && !sync) return srv;
    if (latch) return !clk && ce ? (sr ? srv : outs[i]._d[X]) : q;   // open while CLKINV's output is low
    const edge = clk && !st[i].prevClk;
    if (!edge) return q;
    if (sr) return srv;
    return ce ? outs[i]._d[X] : q;
  }
  // the clock edges of the memories of instance i (RAM / shift-register LUTs, block RAM, multiplier):
  // their inputs sampled now, their updates pushed to `later`
  function memEdges(i, later) {
    const inst = insts[i], c = C[i], r = st[i], val = a => c.get(a)?.value;
    if (inst.kind === 'bram') {
      for (const pt of r.ports) {
        const x = pt.x, inv = n => (val(`${n}${x}INV`) === `${n}${x}_B` ? 1 - pin(i, `${n}${x}`) : pin(i, `${n}${x}`));
        const clk = inv('CLK');
        if (clk && !pt.prevClk && inv('EN')) {
          const [d, p, aw] = BRAM_W[pt.w];
          let a = 0;
          for (let j = 0; j < aw; j++) a |= pin(i, `ADDR${x}${14 - aw + j}`) << j;
          const inp = { a, ssr: inv('SSR'), we: inv('WE'), di: Array.from({ length: d }, (_, k) => pin(i, `DI${x}${k}`)), dip: Array.from({ length: p }, (_, k) => pin(i, `DIP${x}${k}`)) };
          later.push(() => { pt.out = bramEdge(r.m, pt.w, pt.mode, pt.srval, inp, pt.out); });
        }
        pt.prevClk = clk;
      }
      later.push(() => bramWrites(r.m));
      return;
    }
    if (inst.kind === 'mult') {
      const clk = val('CLKINV') === 'CLK_B' ? 1 - pin(i, 'CLK') : pin(i, 'CLK');
      if (clk && !r.prevClk) {
        const bus = (n, w) => Array.from({ length: w }, (_, j) => pin(i, `${n}${j}`));
        const A = bus('A', 18), B = bus(val('B_INPUT') === 'CASCADE' ? 'BCIN' : 'B', 18);
        const prod = mult18(val('AREG') === '1' ? r.a : A, val('BREG') === '1' ? r.b : B);
        const p = n => (val(`${n}INV`) === `${n}_B` ? 1 - pin(i, n) : pin(i, n));
        later.push(() => {
          if (p('RSTA')) r.a = new Array(18).fill(0); else if (p('CEA')) r.a = A;
          if (p('RSTB')) r.b = new Array(18).fill(0); else if (p('CEB')) r.b = B;
          if (p('RSTP')) r.p = new Array(36).fill(0); else if (p('CEP')) r.p = prod;
        });
      }
      r.prevClk = clk;
      return;
    }
    if (!r.mem) return;
    // (the slice's clock state prevClk is the flip-flops'; the memories keep their own)
    const clk = val('CLKINV') === 'CLK_B' ? 1 - pin(i, 'CLK') : pin(i, 'CLK');
    if (clk && !r.memClk && pin(i, 'SR')) {
      const BX = pin(i, 'BX'), BY = pin(i, 'BY');
      // (SHIFTIN: a cascade, F's data G's last stage before this shift, G's the slice above's, #2)
      const din = { F: { BX, ALTDIF: BY, SHIFTIN: r.mem.G?.[15] }[val('DIF_MUX')] ?? 0, G: val('DIG_MUX') === 'SHIFTIN' ? pin(i, 'SHIFTIN') : BY };
      const addrOf = side => { let a = 0; for (let j = 0; j < 4; j++) a |= pin(i, `${side}${j + 1}`) << j; return a; };
      for (const side of ['F', 'G']) {
        if (!r.mem[side]) continue;
        const mode = val(`${side}_ATTR`);
        if (mode === 'SHIFT_REG') { const d = din[side]; later.push(() => { r.mem[side] = [d, ...r.mem[side].slice(0, 15)]; }); continue; }
        // RAM32X1S: BX (A4) chooses the LUT written (F: A4 = 1)
        if (val('SLICEWE0USED') !== undefined && (side === 'F') !== !!BX) continue;
        // a dual-port F is written at G's address
        const a = side === 'F' && mode !== 'DUAL_PORT' ? addrOf('F') : addrOf('G'), d = din[side];
        later.push(() => { r.mem[side] = r.mem[side].slice(); r.mem[side][a] = d; });
      }
    }
    r.memClk = clk;
  }
  return {
    step(inputs) {
      for (const [k, v] of Object.entries(inputs)) padIn.set(k, v);
      comb();
      for (let round = 0; round < 4; round++) {
        let again = false;
        const later = [];
        insts.forEach((inst, i) => memEdges(i, later));
        const next = insts.map((inst, i) => {
          if (inst.kind !== 'slice' || !C[i].has('CLKINV')) return null;
          const c = C[i], val = a => c.get(a)?.value;
          const clk = val('CLKINV') === 'CLK_B' ? 1 - pin(i, 'CLK') : pin(i, 'CLK');
          const r = { clk };
          for (const X of ['X', 'Y']) if (c.get(`FF${X}`)?.value === '#FF') r[X] = ffNext(i, X, false);
          return r;
        });
        const iobs = insts.map((inst, i) => (inst.kind === 'iob' ? iobNext(i) : null));
        iobs.forEach((r, i) => {
          if (!r) return;
          for (const [ff, x] of Object.entries(r.next)) if (x !== st[i].iq[ff]) { st[i].iq[ff] = x; again = true; }
          st[i].prev = r.clk;
        });
        next.forEach((r, i) => {
          if (!r) return;
          for (const X of ['X', 'Y']) if (r[X] !== undefined && r[X] !== st[i].q[X]) { st[i].q[X] = r[X]; again = true; }
          st[i].prevClk = r.clk;
        });
        for (const f of later) { f(); again = true; }
        comb();
        if (!again) break;
      }
    },
    out() {
      const o = {};
      // (the output from its register or O1, high impedance while the output enable, its register or T1, is 1)
      insts.forEach((inst, i) => {
        if (inst.kind !== 'iob' || inst.dir !== 'out') return;
        const c = C[i], val = a => c.get(a)?.value, inv = p => (val(`${p}INV`) === `${p}_B` ? 1 - pin(i, p) : pin(i, p));
        const t = !c.has('TMUX') ? 0 : val('TMUX') === 'TFF1' ? st[i].iq.TFF1 : inv('T1');
        // (the DDR registers' output, #96: OFF1's while OTCLK1 is high, OFF2's after OTCLK2's edge)
        const ddr = () => (inv('OTCLK1') ? st[i].iq.OFF1 : st[i].iq.OFF2);
        o[c.get('PAD').name] = t ? 'z' : val('OMUX') === 'OFF1' ? st[i].iq.OFF1 : val('OMUX') === 'OFF2' ? st[i].iq.OFF2 : val('OMUX') === 'OFFDDR' ? ddr() : inv('O1');
      });
      return o;
    },
  };
}

/** Random stimulus on both simulators; returns the first cycle where the outputs differ (-1: none). */
export function compareSims(nl, packed, { cycles = 300, seed = 1, clock = 'clk' } = {}) {
  let a = seed >>> 0 || 1;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const A = netlistSim(nl), B = packedSim(packed);
  const ins = nl.ports.filter(p => p.dir !== 'out').flatMap(p => p.bits.map(b => b.name)).filter(n => n !== clock);
  const hasClock = nl.ports.some(p => p.name === clock);
  for (let k = 0; k < cycles; k++) {
    const v = {};
    for (const n of ins) v[n] = rnd() < 0.5 ? 1 : 0;
    // inputs change with the clock low, then the clock rises
    for (const clk of hasClock ? [0, 1] : [0]) {
      const x = { ...v };
      if (hasClock) x[clock] = clk;
      A.step(x); B.step(x);
      const key = o => JSON.stringify(Object.entries(o).sort((x, y) => (x[0] < y[0] ? -1 : 1)));
      const oa = key(A.out()), ob = key(B.out());
      if (oa !== ob) return { cycle: k, clk, netlist: A.out(), packed: B.out(), inputs: x };
    }
  }
  return null;
}

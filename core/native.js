// Silinx - native (JavaScript) evaluation of the UNISIM / SIMPRIM primitives of netgen netlists.
//
// A netlist has hundreds of LUTs and flip-flops; interpreting their VHDL models (core/unisim.js)
// costs ~25x the RTL. An instance of one of these primitives becomes a single native process
// with the same behaviour (VHDL signal semantics: outputs are updated one delta later).
// Primitives not listed here (latches, block RAMs, multipliers, DCMs) keep their VHDL models.
import * as V from './values.js';

const bit = (v) => (v == null || Array.isArray(v) ? 2 : (v.x & 1n) ? 2 : Number(v.v & 1n));
const VAL = [V.ZERO, V.ONE, V.X1];
const rising = (sim, s) => s.evStamp === sim.stamp && bit(s.val) === 1 && bit(s.prev) === 0;
const falling = (sim, s) => s.evStamp === sim.stamp && bit(s.val) === 0 && bit(s.prev) === 1;

// the INIT generic as an array of n bits (bit 0 first)
const initBits = (init, n) => Uint8Array.from({ length: n }, (_, i) => (init ? Number((init.v >> BigInt(i)) & 1n) : 0));
// address from single-bit pins (bit 0 first); -1 when one of them is not 0 / 1
const addrOf = (pins) => { let a = 0; for (let i = 0; i < pins.length; i++) { const x = bit(pins[i].val); if (x === 2) return -1; a |= x << i; } return a; };

const LUT = /^(X_)?LUT([1-6])(_L|_D)?$/;
const FF = /^(FD(C|P|R|S|E|CE|PE|RE|SE|RS|RSE|CP|CPE)?)(_1)?$/;

/**
 * Native process for primitive `name` with elaborated `params` ({ name, value }) and `ports`
 * ({ name, dir, sig }); null if the primitive has no native implementation.
 * @returns {{ fn(sim), inputs: object[], outputs: object[], init: Array<[sig, value]> } | null}
 */
export function nativePrimitive(name, params, ports) {
  const N = String(name).toUpperCase();
  const P = new Map(ports.map((p) => [p.name.toUpperCase(), p.sig]));
  const param = (k) => params.find((p) => p.name.toUpperCase() === k)?.value;
  const ins = (...ks) => ks.map((k) => P.get(k)).filter(Boolean);
  const outs = (...ks) => ks.map((k) => P.get(k)).filter(Boolean);
  // drive outputs one delta later. The comparison is with the value last scheduled in this time step
  // (not the current one): the process can run twice in a delta (an input written by a glue process
  // in the same delta), and a second result equal to the current value must still replace the
  // pending one, as a VHDL signal assignment replaces the projected transaction.
  const proj = new Map();   // output -> [stamp, scheduled bit]
  const set = (sim, sigs, b) => {
    for (const s of sigs) {
      const p = proj.get(s);
      const cur = p && p[0] === sim.stamp ? p[1] : s.val.w !== 1 ? -1 : bit(s.val);
      if (cur !== b) { sim.nba({ sig: s, whole: true }, VAL[b]); proj.set(s, [sim.stamp, b]); }
    }
  };
  const comb = (inputs, outputs, f) => ({ inputs, outputs, init: [], fn: (sim) => set(sim, outputs, f()) });
  const b = (k) => bit(P.get(k)?.val);
  // 2:1 mux: with an unknown select the output is known only when both inputs agree (X-pessimism,
  // as the VHDL models in core/unisim.js)
  const mux = (a, c, s) => comb(ins(a, c, s), outs('O', 'LO'), () => { const x = b(s); if (x === 1) return b(c); if (x === 0) return b(a); const u = b(a); return u !== 2 && u === b(c) ? u : 2; });

  let m;
  if ((m = LUT.exec(N))) {
    const n = Number(m[2]);
    const pins = Array.from({ length: n }, (_, i) => P.get(m[1] ? `ADR${i}` : `I${i}`));
    if (pins.some((p) => !p)) return null;
    const init = param('INIT');
    const iv = init ? init.v : 0n;
    const o = outs('O', 'LO');
    return comb(pins, o, () => {
      let k = 0;
      for (let i = 0; i < n; i++) { const x = bit(pins[i].val); if (x === 2) return 2; k |= x << i; }
      return Number((iv >> BigInt(k)) & 1n);
    });
  }
  if ((m = FF.exec(N)) || N === 'X_FF' || N === 'X_SFF') {
    const simprim = N.startsWith('X_');
    const clk = P.get(simprim ? 'CLK' : 'C'), d = P.get(simprim ? 'I' : 'D'), q = P.get(simprim ? 'O' : 'Q');
    if (!clk || !d || !q) return null;
    const edge = m && m[3] ? falling : rising;
    const aclr = P.get(simprim ? 'RST' : 'CLR'), apre = P.get(simprim ? 'SET' : 'PRE');
    const srst = P.get(simprim ? 'SRST' : 'R'), sset = P.get(simprim ? 'SSET' : 'S'), ce = P.get('CE');
    const initV = param('INIT');
    const init = initV ? bit(initV) : (['FDP', 'FDPE', 'FDS', 'FDSE'].includes(m?.[1]) ? 1 : 0);
    return {
      inputs: [clk, aclr, apre].filter(Boolean),     // d, ce, r, s are sampled at the edge
      outputs: [q],
      init: [[q, VAL[init === 2 ? 0 : init]]],
      fn(sim) {
        if (aclr && bit(aclr.val) === 1) return set(sim, [q], 0);
        if (apre && bit(apre.val) === 1) return set(sim, [q], 1);
        if (!edge(sim, clk)) return;
        if (srst && bit(srst.val) === 1) return set(sim, [q], 0);
        if (sset && bit(sset.val) === 1) return set(sim, [q], 1);
        if (ce && bit(ce.val) !== 1) return;
        set(sim, [q], bit(d.val));
      },
    };
  }
  // shift-register LUTs (SRL16[E][_1], SRLC16[E][_1], X_SRL16E, X_SRLC16E) and distributed RAMs
  // (RAMnX1S[_1], RAMnX1D[_1], X_RAMSn, X_RAMDn): the contents are bits 0 / 1 / 2 (unknown)
  if ((m = /^(X_)?SRLC?16E?(_1)?$/.exec(N))) {
    const clk = P.get('CLK'), d = P.get('D'), ce = P.get('CE');
    const adr = ['A0', 'A1', 'A2', 'A3'].map((k) => P.get(k));
    if (!clk || !d || adr.some((x) => !x)) return null;
    const edge = m[2] ? falling : rising;
    const r = initBits(param('INIT'), 16);
    const q = outs('Q'), q15 = outs('Q15');
    const read = (sim) => { const a = addrOf(adr); set(sim, q, a < 0 ? 2 : r[a]); set(sim, q15, r[15]); };
    return {
      inputs: [clk, ...adr], outputs: [...q, ...q15], init: [...q.map((s) => [s, VAL[r[0]]]), ...q15.map((s) => [s, VAL[r[15]]])],
      fn(sim) {
        if (edge(sim, clk) && (!ce || bit(ce.val) === 1)) { r.copyWithin(1, 0, 15); r[0] = bit(d.val); }
        read(sim);
      },
    };
  }
  if ((m = /^(?:RAM(16|32|64)X1([SD])(_1)?|X_RAM([SD])(16|32|64))$/.exec(N))) {
    const simprim = !!m[4], depth = Number(m[1] || m[5]), dual = (m[2] || m[4]) === 'D', n = Math.log2(depth);
    const pins = (p) => Array.from({ length: n }, (_, i) => P.get(`${p}${i}`));
    const wa = simprim ? pins(dual ? 'WADR' : 'ADR') : pins('A');
    const reads = simprim ? [[P.get('O'), dual ? pins('RADR') : wa]] : dual ? [[P.get('SPO'), wa], [P.get('DPO'), pins('DPRA')]] : [[P.get('O'), wa]];
    const clk = P.get(simprim ? 'CLK' : 'WCLK'), din = P.get(simprim ? 'I' : 'D'), we = P.get('WE');
    if (!clk || !din || !we || wa.some((x) => !x) || reads.some(([o, a]) => !o || a.some((x) => !x))) return null;
    const edge = m[3] ? falling : rising;
    const mem = initBits(param('INIT'), depth);
    return {
      inputs: [...new Set([clk, ...wa, ...reads.flatMap((r) => r[1])])], outputs: reads.map((r) => r[0]),
      init: reads.map(([o]) => [o, VAL[mem[0]]]),
      fn(sim) {
        if (edge(sim, clk) && bit(we.val) === 1) { const a = addrOf(wa); if (a >= 0) mem[a] = bit(din.val); }
        for (const [o, a] of reads) { const k = addrOf(a); set(sim, [o], k < 0 ? 2 : mem[k]); }
      },
    };
  }
  switch (N) {
    case 'GND': case 'X_ZERO': return { inputs: [], outputs: outs('G', 'O'), init: outs('G', 'O').map((s) => [s, V.ZERO]), fn: (sim) => set(sim, outs('G', 'O'), 0) };
    case 'VCC': case 'X_ONE': return { inputs: [], outputs: outs('P', 'O'), init: outs('P', 'O').map((s) => [s, V.ONE]), fn: (sim) => set(sim, outs('P', 'O'), 1) };
    case 'X_ROC': case 'X_TOC': return { inputs: [], outputs: outs('O'), init: outs('O').map((s) => [s, V.ZERO]), fn: (sim) => set(sim, outs('O'), 0) };
    case 'INV': case 'X_INV': return comb(ins('I'), outs('O'), () => { const x = b('I'); return x === 2 ? 2 : 1 - x; });
    case 'IBUF': case 'IBUFG': case 'OBUF': case 'BUF': case 'BUFG': case 'BUFGP': case 'X_BUF': case 'X_CKBUF': case 'X_OBUF': case 'X_IPAD': case 'X_OPAD': case 'X_BUFGP':
      return comb(ins('I'), outs('O'), () => b('I'));
    case 'MUXCY': case 'MUXCY_L': case 'MUXCY_D':
      return mux('DI', 'CI', 'S');
    case 'XORCY': case 'XORCY_L': case 'XORCY_D': case 'X_XOR2':
      return comb(ins('CI', 'LI', 'I0', 'I1'), outs('O', 'LO'), () => { const [x, y] = N === 'X_XOR2' ? [b('I0'), b('I1')] : [b('CI'), b('LI')]; return x === 2 || y === 2 ? 2 : x ^ y; });
    case 'MULT_AND': case 'X_AND2':
      return comb(ins('I0', 'I1'), outs('O', 'LO'), () => { const x = b('I0'), y = b('I1'); return x === 0 || y === 0 ? 0 : x === 1 && y === 1 ? 1 : 2; });
    case 'X_OR2':
      return comb(ins('I0', 'I1'), outs('O'), () => { const x = b('I0'), y = b('I1'); return x === 1 || y === 1 ? 1 : x === 0 && y === 0 ? 0 : 2; });
    case 'X_MUX2':
      return mux('IA', 'IB', 'SEL');
    case 'BUFGMUX': case 'BUFGMUX_1': case 'X_BUFGMUX':
      return mux('I0', 'I1', 'S');
    default:
      if (/^MUXF[5-8](_L|_D)?$/.test(N)) return mux('I0', 'I1', 'S');
      return null;
  }
}

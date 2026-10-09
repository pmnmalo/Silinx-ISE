// Silinx - native (JavaScript) evaluation of the UNISIM / SIMPRIM primitives of netgen netlists.
//
// A netlist has hundreds of LUTs and flip-flops; interpreting their VHDL models (core/unisim.js)
// costs ~25x the RTL. An instance of one of these primitives becomes a single native process
// with the same behaviour (VHDL signal semantics: outputs are updated one delta later).
// Primitives not listed here (latches, SRLs, RAMs) keep their VHDL models.
import * as V from './values.js';

const bit = (v) => (v == null || Array.isArray(v) ? 2 : (v.x & 1n) ? 2 : Number(v.v & 1n));
const VAL = [V.ZERO, V.ONE, V.X1];
const rising = (sim, s) => s.evStamp === sim.stamp && bit(s.val) === 1 && bit(s.prev) === 0;
const falling = (sim, s) => s.evStamp === sim.stamp && bit(s.val) === 0 && bit(s.prev) === 1;

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
  const set = (sim, sigs, b) => { for (const s of sigs) if (bit(s.val) !== b || s.val.w !== 1) sim.nba({ sig: s, whole: true }, VAL[b]); };
  const comb = (inputs, outputs, f) => ({ inputs, outputs, init: [], fn: (sim) => set(sim, outputs, f()) });
  const b = (k) => bit(P.get(k)?.val);

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
  switch (N) {
    case 'GND': case 'X_ZERO': return { inputs: [], outputs: outs('G', 'O'), init: outs('G', 'O').map((s) => [s, V.ZERO]), fn: (sim) => set(sim, outs('G', 'O'), 0) };
    case 'VCC': case 'X_ONE': return { inputs: [], outputs: outs('P', 'O'), init: outs('P', 'O').map((s) => [s, V.ONE]), fn: (sim) => set(sim, outs('P', 'O'), 1) };
    case 'X_ROC': case 'X_TOC': return { inputs: [], outputs: outs('O'), init: outs('O').map((s) => [s, V.ZERO]), fn: (sim) => set(sim, outs('O'), 0) };
    case 'INV': case 'X_INV': return comb(ins('I'), outs('O'), () => { const x = b('I'); return x === 2 ? 2 : 1 - x; });
    case 'IBUF': case 'IBUFG': case 'OBUF': case 'BUF': case 'BUFG': case 'BUFGP': case 'X_BUF': case 'X_CKBUF': case 'X_OBUF': case 'X_IPAD': case 'X_OPAD': case 'X_BUFGP':
      return comb(ins('I'), outs('O'), () => b('I'));
    case 'MUXCY': case 'MUXCY_L': case 'MUXCY_D':
      return comb(ins('CI', 'DI', 'S'), outs('O', 'LO'), () => { const s = b('S'); return s === 1 ? b('CI') : s === 0 ? b('DI') : (b('CI') === b('DI') ? b('CI') : 2); });
    case 'XORCY': case 'XORCY_L': case 'XORCY_D': case 'X_XOR2':
      return comb(ins('CI', 'LI', 'I0', 'I1'), outs('O', 'LO'), () => { const [x, y] = N === 'X_XOR2' ? [b('I0'), b('I1')] : [b('CI'), b('LI')]; return x === 2 || y === 2 ? 2 : x ^ y; });
    case 'MULT_AND': case 'X_AND2':
      return comb(ins('I0', 'I1'), outs('O', 'LO'), () => { const x = b('I0'), y = b('I1'); return x === 0 || y === 0 ? 0 : x === 1 && y === 1 ? 1 : 2; });
    case 'X_OR2':
      return comb(ins('I0', 'I1'), outs('O'), () => { const x = b('I0'), y = b('I1'); return x === 1 || y === 1 ? 1 : x === 0 && y === 0 ? 0 : 2; });
    case 'X_MUX2':
      return comb(ins('IA', 'IB', 'SEL'), outs('O'), () => { const s = b('SEL'); return s === 1 ? b('IB') : s === 0 ? b('IA') : (b('IA') === b('IB') ? b('IA') : 2); });
    case 'X_BUFGMUX':
      return comb(ins('I0', 'I1', 'S'), outs('O'), () => (b('S') === 1 ? b('I1') : b('I0')));
    default:
      if (/^MUXF[5-8](_L|_D)?$/.test(N)) return comb(ins('I0', 'I1', 'S'), outs('O', 'LO'), () => { const s = b('S'); return s === 1 ? b('I1') : s === 0 ? b('I0') : (b('I0') === b('I1') ? b('I0') : 2); });
      return null;
  }
}

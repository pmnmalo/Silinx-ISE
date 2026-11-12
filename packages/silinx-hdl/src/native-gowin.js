// Silinx - native (JavaScript) evaluation of the Gowin primitives (#2299), as native.js's of UNISIM's: a synth_gowin
// netlist's LUTs, flip-flops, wide multiplexers, carry cells and buffers each a single native process with the behaviour of
// its VHDL model (gowin-prims.js). The others (latches, RAMs, three-state buffers, rPLL, oscillators, BSRAM) keep their
// VHDL models.

const LUT = /^LUT([1-4])$/;
// DFF[N][E|S|SE|R|RE|P|PE|C|CE]: N on the falling edge; S / R a synchronous set / reset, P / C an asynchronous preset / clear
const FF = /^DFF(N)?(S|R|P|C)?(E)?$/;

/**
 * The native process of Gowin primitive N (upper case), or null; h: native.js's helpers of the instance (P: its pins by
 * name, param(k), ins / outs(...pins), set(sim, sigs, bit), comb(inputs, outputs, f), b(pin), mux(a, b, s), bit(value),
 * rising / falling(sim, sig), VAL[bit]).
 */
export function gowinPrimitive(N, h) {
  const { P, param, ins, outs, set, comb, b, mux, bit, rising, falling, VAL } = h;
  let m;
  if ((m = LUT.exec(N))) {
    const n = Number(m[1]);
    const pins = Array.from({ length: n }, (_, i) => P.get(`I${i}`));
    const f = outs('F');
    if (pins.some((p) => !p) || !f.length) return null;
    const iv = param('INIT')?.v ?? 0n;
    return comb(pins, f, () => {
      let k = 0;
      for (let i = 0; i < n; i++) { const x = bit(pins[i].val); if (x === 2) return 2; k |= x << i; }
      return Number((iv >> BigInt(k)) & 1n);
    });
  }
  if ((m = FF.exec(N))) {
    const clk = P.get('CLK'), d = P.get('D'), q = P.get('Q');
    if (!clk || !d || !q) return null;
    const edge = m[1] ? falling : rising;
    const kind = m[2], ce = m[3] ? P.get('CE') : null;
    const sync = kind === 'S' ? [P.get('SET'), 1] : kind === 'R' ? [P.get('RESET'), 0] : null;
    const asyn = kind === 'P' ? [P.get('PRESET'), 1] : kind === 'C' ? [P.get('CLEAR'), 0] : null;
    if ((sync && !sync[0]) || (asyn && !asyn[0]) || (m[3] && !ce)) return null;
    const initV = param('INIT');
    const init = initV ? bit(initV) : (kind === 'S' || kind === 'P' ? 1 : 0);
    return {
      inputs: [clk, ...(asyn ? [asyn[0]] : [])],     // d, ce and a synchronous set / reset are sampled at the edge
      outputs: [q],
      init: [[q, VAL[init === 2 ? 0 : init]]],
      fn(sim) {
        if (asyn && bit(asyn[0].val) === 1) return set(sim, [q], asyn[1]);
        if (!edge(sim, clk)) return;
        if (sync && bit(sync[0].val) === 1) return set(sim, [q], sync[1]);
        if (ce && bit(ce.val) !== 1) return;
        set(sim, [q], bit(d.val));
      },
    };
  }
  if (/^MUX2(_LUT[5-8])?$/.test(N)) return mux('I0', 'I1', 'S0');
  if (N === 'ALU') {
    const sum = outs('SUM'), cout = outs('COUT');
    const mode = Number(param('ALU_MODE')?.v ?? 0n);
    const inputs = ins('I0', 'I1', 'I3', 'CIN');
    const not = (x) => (x === 2 ? 2 : 1 - x), xor = (x, y) => (x === 2 || y === 2 ? 2 : x ^ y), and = (x, y) => (x === 0 || y === 0 ? 0 : x === 1 && y === 1 ? 1 : 2);
    const sel = (s, a, c) => (s === 1 ? a : s === 0 ? c : a === c ? a : 2);
    // S and C of each mode (gowin-prims.js ALU)
    const SC = [(a, c) => [xor(a, c), a], (a, c) => [xor(a, not(c)), a], (a, c, i3) => [sel(i3, xor(a, c), xor(a, not(c))), a], (a, c) => [xor(a, not(c)), 1],
      (a, c) => [xor(a, not(c)), a], (a, c) => [xor(not(a), c), c], (a) => [a, 0], (a) => [not(a), 1], (a, c, i3) => [sel(i3, a, not(a)), a],
      (a, c, i3) => [xor(and(a, c), i3), and(a, c)]];
    const f = SC[mode] || (() => [2, 2]);
    return {
      inputs, outputs: [...sum, ...cout], init: [],
      fn(sim) {
        const [s, c] = f(b('I0'), b('I1'), b('I3')), cin = b('CIN');
        set(sim, sum, xor(s, cin));
        set(sim, cout, sel(s, cin, c));
      },
    };
  }
  switch (N) {
    case 'GND': return { inputs: [], outputs: outs('G'), init: outs('G').map((s) => [s, VAL[0]]), fn: (sim) => set(sim, outs('G'), 0) };
    case 'VCC': return { inputs: [], outputs: outs('V'), init: outs('V').map((s) => [s, VAL[1]]), fn: (sim) => set(sim, outs('V'), 1) };
    case 'INV': return comb(ins('I'), outs('O'), () => { const x = b('I'); return x === 2 ? 2 : 1 - x; });
    case 'IBUF': case 'OBUF': case 'BUFG': return comb(ins('I'), outs('O'), () => b('I'));
    default: return null;
  }
}

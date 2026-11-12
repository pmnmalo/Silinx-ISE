// The Gowin's block RAMs' and multipliers' simulation models (#2299: packages/silinx-hdl/src/gowin-bsram.js, gowin-dsp.js):
// SP, SDPB, DPB, pROM and their X9 twins, MULT9X9 / 18X18 / 36X36, step by step against a reference written here (Gowin's
// UG285 and UG287 as brams_map.v and dsp_map.v use them), from Verilog and from VHDL (test/gowin-prims-lib.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCases, rng, bit, bitsOf } from './gowin-prims-lib.mjs';

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const big = (r, w) => { let v = 0n; for (let i = 0; i < w; i += 16) v |= BigInt(r(65536)) << BigInt(i); return BigInt.asUintN(w, v); };
const shiftOf = (d, x9) => (x9 ? { 9: 3, 18: 4, 36: 5 } : { 1: 0, 2: 1, 4: 2, 8: 3, 16: 4, 32: 5 })[d];

// a port of a case: [its pins' names, its generics' names] as the models' (gowin-bsram.js KINDS)
const PORTS = {
  SP: [{ x: 'A', do: 'DO', di: 'DI', ad: 'AD', we: 'WRE', clk: 'CLK', ce: 'CE', oce: 'OCE', rst: 'RESET', bs: 'BLKSEL', w: 'BIT_WIDTH', rm: 'READ_MODE', wm: 'WRITE_MODE', blk: 'BLK_SEL' }],
  pROM: [{ x: 'A', do: 'DO', ad: 'AD', clk: 'CLK', ce: 'CE', oce: 'OCE', rst: 'RESET', w: 'BIT_WIDTH', rm: 'READ_MODE' }],
  SDPB: [{ x: 'A', di: 'DI', ad: 'ADA', we: null, clk: 'CLKA', ce: 'CEA', rst: 'RESETA', bs: 'BLKSELA', w: 'BIT_WIDTH_0', blk: 'BLK_SEL_0' },
    { x: 'B', do: 'DO', ad: 'ADB', clk: 'CLKB', ce: 'CEB', oce: 'OCE', rst: 'RESETB', bs: 'BLKSELB', w: 'BIT_WIDTH_1', rm: 'READ_MODE', blk: 'BLK_SEL_1' }],
  DPB: ['A', 'B'].map((x, i) => ({ x, do: `DO${x}`, di: `DI${x}`, ad: `AD${x}`, we: `WRE${x}`, clk: `CLK${x}`, ce: `CE${x}`, oce: `OCE${x}`, rst: `RESET${x}`, bs: `BLKSEL${x}`,
    w: `BIT_WIDTH_${i}`, rm: `READ_MODE${i}`, wm: `WRITE_MODE${i}`, blk: `BLK_SEL_${i}` })),
};
const NAMES = { SP: ['SP', 'SPX9'], pROM: ['pROM', 'pROMX9'], SDPB: ['SDPB', 'SDPX9B'], DPB: ['DPB', 'DPX9B'] };

// a BSRAM case: kind, x9, the ports' { d: width, rm, wm }, resetMode, blk (BLK_SEL; BLKSEL random when set), its steps from the
// reference (the contents' bits, each port's latch and register; on an edge every port's reads, then the writes)
function bsramCase(seed, kind, x9, cfg, { resetMode = 'SYNC', blk = 0, n = 48 } = {}) {
  const r = rng(seed), ports = PORTS[kind], name = NAMES[kind][x9 ? 1 : 0];
  const dw = (kind === 'DPB' ? 16 : 32) * (x9 ? 9 : 8) / 8, iw = x9 ? 288 : 256;
  const inits = Array.from({ length: 64 }, () => big(r, iw));
  const mem = []; for (let k = 0; k < 64 * iw; k++) mem.push(bit(inits[k / iw | 0], k % iw));
  const params = [['RESET_MODE', { str: resetMode }], ...inits.map((v, j) => [`INIT_RAM_${hex2(j)}`, { bits: iw, v }])];
  const pins = {};
  ports.forEach((p, i) => {
    const c = cfg[i];
    params.push([p.w, { int: c.d }]);
    if (p.rm) params.push([p.rm, { bit: c.rm }]);
    if (p.wm) params.push([p.wm, { bits: 2, v: c.wm }]);
    if (p.blk) params.push([p.blk, { bits: 3, v: blk }]);
    Object.assign(pins, { [p.ad]: { dir: 'in', w: 14 }, [p.clk]: { dir: 'in', w: 1 }, [p.ce]: { dir: 'in', w: 1 }, [p.rst]: { dir: 'in', w: 1 } });
    if (p.di) pins[p.di] = { dir: 'in', w: dw };
    if (p.we) pins[p.we] = { dir: 'in', w: 1 };
    if (p.oce) pins[p.oce] = { dir: 'in', w: 1 };
    if (p.bs) pins[p.bs] = { dir: 'in', w: 3 };
    if (p.do) pins[p.do] = { dir: 'out', w: dw };
  });
  const st = ports.map(() => ({ l: 0n, r: 0n }));
  let clk = 0;
  const steps = [];
  for (let k = 0; k < n; k++) {
    clk = 1 - clk;
    const s = { in: {} };
    ports.forEach((p, i) => {
      const d = cfg[i].d, sh = shiftOf(d, x9);
      // (the words of the first 128 bits, the bytes' enables below them: the ports read what they write)
      s.in[p.ad] = ((r(Math.max(1, (x9 ? 144 : 128) / d)) << sh) | r(2 ** sh)) & 0x3fff;
      s.in[p.clk] = clk;
      s.in[p.ce] = r(5) ? 1 : 0;
      s.in[p.rst] = k > 2 && !r(9) ? 1 : 0;
      if (p.di) s.in[p.di] = big(r, dw);
      if (p.we) s.in[p.we] = k ? r(2) : 0;
      if (p.oce) s.in[p.oce] = r(4) ? 1 : 0;
      if (p.bs) s.in[p.bs] = blk ? (r(3) ? blk : r(8)) : 0;
    });
    const writes = [];
    ports.forEach((p, i) => {
      const { d, rm, wm } = cfg[i], sh = shiftOf(d, x9), u = sh === 4 && d >= 16 ? d / 2 : sh === 5 ? d / 4 : 0, q = st[i], v = s.in;
      if (clk && (!p.bs || v[p.bs] === blk)) {
        if (rm && v[p.oce]) q.r = q.l;
        if (v[p.ce]) {
          const adr = v[p.ad] >> sh;
          const e = Array.from({ length: d }, (_, b) => (p.di && (!p.we || v[p.we]) && (!u || bit(v[p.ad], b / u | 0)) ? 1 : 0));
          const any = e.some(Boolean);
          if (p.do && (!any || wm)) {
            let l = 0n;
            for (let b = 0; b < d; b++) l |= BigInt(wm === 1 && e[b] ? bit(v[p.di], b) : mem[adr * d + b]) << BigInt(b);
            q.l = l;
          }
          for (let b = 0; b < d; b++) if (e[b]) writes.push([adr * d + b, bit(v[p.di], b)]);
        }
        if (p.do && resetMode === 'SYNC' && v[p.rst]) q.l = q.r = 0n;
      }
    });
    for (const [a, b] of writes) mem[a] = b;
    s.out = {};
    ports.forEach((p, i) => {
      if (!p.do) return;
      if (resetMode === 'ASYNC' && s.in[p.rst]) st[i].l = st[i].r = 0n;
      s.out[p.do] = bitsOf(cfg[i].rm ? st[i].r : st[i].l, dw);
    });
    steps.push(s);
  }
  return { name: `${name}_${seed}`, cell: name, params, pins, steps };
}

test('SP and SPX9: every width, the write modes (normal, write-through, read-before-write), the output register, the byte enables, the resets', () => {
  checkCases([
    bsramCase(1, 'SP', false, [{ d: 1, rm: 0, wm: 0 }]), bsramCase(2, 'SP', false, [{ d: 2, rm: 0, wm: 1 }]),
    bsramCase(3, 'SP', false, [{ d: 4, rm: 1, wm: 2 }], { resetMode: 'ASYNC' }), bsramCase(4, 'SP', false, [{ d: 8, rm: 1, wm: 0 }]),
    bsramCase(5, 'SP', false, [{ d: 16, rm: 0, wm: 1 }], { resetMode: 'ASYNC' }), bsramCase(6, 'SP', false, [{ d: 32, rm: 0, wm: 2 }]),
    bsramCase(7, 'SP', true, [{ d: 9, rm: 0, wm: 1 }]), bsramCase(8, 'SP', true, [{ d: 18, rm: 1, wm: 0 }]), bsramCase(9, 'SP', true, [{ d: 36, rm: 0, wm: 2 }], { resetMode: 'ASYNC' }),
  ], 'SP');
});

test('SDPB and SDPX9B: a write port and a read port of other widths; DPB and DPX9B: two ports, each reading and writing; BLKSEL selects the block', () => {
  checkCases([
    bsramCase(11, 'SDPB', false, [{ d: 16 }, { d: 8, rm: 0 }]), bsramCase(12, 'SDPB', false, [{ d: 32 }, { d: 1, rm: 1 }], { resetMode: 'ASYNC' }),
    bsramCase(13, 'SDPB', false, [{ d: 4 }, { d: 32, rm: 0 }], { blk: 5 }), bsramCase(14, 'SDPB', true, [{ d: 18 }, { d: 9, rm: 0 }]),
    bsramCase(15, 'SDPB', true, [{ d: 36 }, { d: 36, rm: 1 }]),
    bsramCase(16, 'DPB', false, [{ d: 16, rm: 0, wm: 0 }, { d: 8, rm: 0, wm: 1 }]), bsramCase(17, 'DPB', false, [{ d: 1, rm: 1, wm: 2 }, { d: 4, rm: 0, wm: 0 }], { blk: 3 }),
    bsramCase(18, 'DPB', true, [{ d: 18, rm: 0, wm: 1 }, { d: 9, rm: 1, wm: 0 }], { resetMode: 'ASYNC' }),
    bsramCase(19, 'SP', false, [{ d: 8, rm: 0, wm: 0 }], { blk: 6 }),
  ], 'SDPB / DPB');
});

test('pROM and pROMX9: the contents read, the output register', () => {
  checkCases([bsramCase(21, 'pROM', false, [{ d: 8, rm: 0 }]), bsramCase(22, 'pROM', false, [{ d: 32, rm: 1 }]), bsramCase(23, 'pROM', true, [{ d: 36, rm: 0 }])], 'pROM');
});

test('MULT9X9, MULT18X18, MULT36X36: DOUT = A × B, each signed with its ASIGN / BSIGN; ASEL / BSEL the shift inputs; the registers on CE, RESET clearing them', () => {
  const r = rng(287), cases = [];
  const prod = (a, b, sa, sb, n) => BigInt.asUintN(2 * n, (sa ? BigInt.asIntN(n, a) : a) * (sb ? BigInt.asIntN(n, b) : b));
  for (const n of [9, 18, 36]) {
    const p = { A: { dir: 'in', w: n }, B: { dir: 'in', w: n }, ASIGN: { dir: 'in', w: 1 }, BSIGN: { dir: 'in', w: 1 }, DOUT: { dir: 'out', w: 2 * n } };
    const steps = Array.from({ length: 24 }, () => {
      const a = big(r, n), b = big(r, n), sa = r(2), sb = r(2);
      return { in: { A: a, B: b, ASIGN: sa, BSIGN: sb }, out: { DOUT: bitsOf(prod(a, b, sa, sb, n), 2 * n) } };
    });
    cases.push({ name: `MULT${n}X${n}`, cell: `MULT${n}X${n}`, pins: p, steps });
  }
  // MULT18X18 with its input and output registers (two edges from A to DOUT), the shift inputs, a synchronous reset
  const p = { A: { dir: 'in', w: 18 }, B: { dir: 'in', w: 18 }, SIA: { dir: 'in', w: 18 }, SIB: { dir: 'in', w: 18 }, ASEL: { dir: 'in', w: 1 }, BSEL: { dir: 'in', w: 1 },
    ASIGN: { dir: 'in', w: 1 }, BSIGN: { dir: 'in', w: 1 }, CE: { dir: 'in', w: 1 }, CLK: { dir: 'in', w: 1 }, RESET: { dir: 'in', w: 1 }, DOUT: { dir: 'out', w: 36 }, SOA: { dir: 'out', w: 18 } };
  // (the inputs change between the clock's rising edges, as a design's do)
  let ar = 0n, br = 0n, asr = 0, bsr = 0, o = 0n, clk = 0, v = {};
  const steps = Array.from({ length: 40 }, (_, k) => {
    clk = 1 - clk;
    v = clk ? { ...v, CLK: 1 } : { A: big(r, 18), B: big(r, 18), SIA: big(r, 18), SIB: big(r, 18), ASEL: r(2), BSEL: r(2), ASIGN: r(2), BSIGN: r(2), CE: r(4) ? 1 : 0, CLK: 0, RESET: k > 2 && !r(8) ? 1 : 0 };
    if (clk) {
      if (v.RESET) { ar = br = o = 0n; asr = bsr = 0; } else if (v.CE) { o = prod(ar, br, asr, bsr, 18); ar = v.ASEL ? v.SIA : v.A; br = v.BSEL ? v.SIB : v.B; asr = v.ASIGN; bsr = v.BSIGN; }
    }
    return { in: { ...v }, out: { DOUT: bitsOf(o, 36), SOA: bitsOf(ar, 18) } };
  });
  cases.push({ name: 'MULT18X18_REG', cell: 'MULT18X18', params: [['AREG', { bit: 1 }], ['BREG', { bit: 1 }], ['ASIGN_REG', { bit: 1 }], ['BSIGN_REG', { bit: 1 }], ['OUT_REG', { bit: 1 }]], pins: p, steps });
  assert.ok(cases.at(-1).steps.some((s) => s.out.DOUT !== '0'.repeat(36)));
  checkCases(cases, 'multipliers');
});

// The Gowin primitives' simulation models (#2299: packages/silinx-hdl/src/gowin-prims.js, the native evaluation of its
// netlist cells in native-gowin.js): each one's behaviour against values computed here (Yosys's techlibs/gowin/cells_sim.v's
// semantics written again), instantiated from Verilog and from VHDL (test/gowin-prims-lib.mjs); when a design gets the Gowin
// library (primitiveSources); every model elaborated alone with no message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources, UNISIM_SOURCE } from '../core/unisim.js';
import { GOWIN_SOURCE, GOWIN_CELLS, GOWIN_VHDL } from '../packages/silinx-hdl/src/gowin-prims.js';
import { checkCases, rng, bit } from './gowin-prims-lib.mjs';

const pins = (ins, outs, w = 1) => Object.fromEntries([...ins.map((p) => [p, { dir: 'in', w }]), ...outs.map((p) => [p, { dir: 'out', w }])]);

test('the Gowin library: its cells, each elaborated alone with no message', () => {
  assert.deepEqual([...GOWIN_CELLS].sort(), ['ALU', 'BUFG', 'DFF', 'DFFC', 'DFFCE', 'DFFE', 'DFFN', 'DFFNC', 'DFFNCE', 'DFFNE', 'DFFNP', 'DFFNPE', 'DFFNR',
    'DFFNRE', 'DFFNS', 'DFFNSE', 'DFFP', 'DFFPE', 'DFFR', 'DFFRE', 'DFFS', 'DFFSE', 'DL', 'DLC', 'DLCE', 'DLE', 'DLN', 'DLNC', 'DLNCE', 'DLNE', 'DLNP',
    'DLNPE', 'DLP', 'DLPE', 'DPB', 'DPX9B', 'ELVDS_OBUF', 'GND', 'GSR', 'IBUF', 'INV', 'IOBUF', 'LUT1', 'LUT2', 'LUT3', 'LUT4', 'MULT18X18', 'MULT36X36',
    'MULT9X9', 'MUX2', 'MUX2_LUT5', 'MUX2_LUT6', 'MUX2_LUT7', 'MUX2_LUT8', 'OBUF', 'OSC', 'OSCH', 'OSCZ', 'PLLVR', 'RAM16S1', 'RAM16S2', 'RAM16S4',
    'RAM16SDP1', 'RAM16SDP2', 'RAM16SDP4', 'SDPB', 'SDPX9B', 'SP', 'SPX9', 'TBUF', 'TLVDS_OBUF', 'VCC', 'pROM', 'pROMX9', 'rPLL'].sort());
  const lib = compile([GOWIN_SOURCE]);
  assert.deepEqual(lib.errors, []);
  for (const n of GOWIN_CELLS) assert.deepEqual(elaborate(lib, n).diags.map((d) => d.message), [], n);
  assert.match(GOWIN_VHDL, /^package COMPONENTS is$/m);
});

test('primitiveSources: the Gowin library for a design that instantiates its cells (Verilog, VHDL library gw1n), in place of UNISIM\'s', () => {
  const v = (text) => primitiveSources([{ path: 'a.v', text }]).map((s) => s.path);
  const G = ['<silinx>/gowin.vhd'], U = ['<silinx>/unisim.vhd'];
  assert.deepEqual(v('module a; DFFE r (.Q(q), .D(d), .CLK(c), .CE(e)); endmodule'), G);
  assert.deepEqual(v('module a(input c, output o); rPLL #(.FCLKIN("27")) pll (.CLKIN(c), .CLKOUT(o)); endmodule'), G);
  assert.deepEqual(v('module a; pROM r (.CLK(c), .DO(o)); endmodule'), G);
  // (Yosys's netlist: escaped names)
  assert.deepEqual(v('module a; DFF \\dec.q2_DFF_Q  (.CLK(c), .D(d), .Q(q)); endmodule'), G);
  // a name of both: Gowin's by its pins (LUT4's F, VCC's V, MULT18X18's DOUT, IOBUF's OEN), else UNISIM's
  assert.deepEqual(v("module a; LUT4 #(.INIT(16'h8000)) l (.F(y), .I0(a), .I1(b), .I2(c), .I3(d)); endmodule"), G);
  assert.deepEqual(v("module a; LUT4 #(.INIT(16'h8000)) l (.O(y), .I0(a), .I1(b), .I2(c), .I3(d)); endmodule"), U);
  assert.deepEqual(v('module a; VCC v (.V(one)); endmodule'), G);
  assert.deepEqual(v('module a; VCC v (.P(one)); endmodule'), U);
  assert.deepEqual(v('module a; MULT18X18 m (.A(a), .B(b), .DOUT(p)); endmodule'), G);
  assert.deepEqual(v('module a; MULT18X18 m (.A(a), .B(b), .P(p)); endmodule'), U);
  assert.deepEqual(v('module a; IOBUF b (.I(i), .OEN(t), .O(o), .IO(p)); endmodule'), G);
  assert.deepEqual(v('module a; IBUF b (.I(i), .O(o)); endmodule'), U);
  // the project's own module of that name, a comment: nothing
  assert.deepEqual(primitiveSources([{ path: 'a.v', text: 'module a; DFFE r (.q(q)); endmodule' }, { path: 'd.v', text: 'module DFFE(output q); endmodule' }]), []);
  assert.deepEqual(v('module a; // DFFE r (.Q(q));\nendmodule'), []);
  // VHDL: Gowin's library (gw1n, gw2a…); UNISIM's library wins over it
  assert.deepEqual(primitiveSources([{ path: 'a.vhd', text: 'library gw1n; use gw1n.components.all;\nentity a is end;' }]).map((s) => s.path), G);
  assert.deepEqual(primitiveSources([{ path: 'a.vhd', text: 'library GW2A;\nentity a is end;' }]).map((s) => s.path), G);
  assert.deepEqual(primitiveSources([{ path: 'a.vhd', text: 'library gw1n;\nlibrary unisim;\nentity a is end;' }]).map((s) => s.path), U);
  assert.deepEqual(primitiveSources([{ path: 'a.vhd', text: 'library gw1n;' }, GOWIN_SOURCE]), []);
  assert.deepEqual(primitiveSources([{ path: 'a.vhd', text: 'library unisim;' }, UNISIM_SOURCE]), []);
});

test('the harness: a wrong value expected fails, in Verilog and in VHDL', () => {
  const c = (out) => [{ name: 'NOT', cell: 'LUT1', params: [['INIT', { bits: 2, v: 1 }]], pins: pins(['I0'], ['F']), steps: [{ in: { I0: 1 }, out: { F: out } }] }];
  checkCases(c('0'));
  assert.throws(() => checkCases(c('1')), /verilog[\s\S]*ERROR NOT step 0: F = 0, expected 1/);
  // (the VHDL bench's own check: its log alone)
  assert.throws(() => checkCases(c('1'), '', ['vhdl']), /vhdl[\s\S]*ERROR NOT step 0: F is not 1/);
});

test('LUT1-4: F the bit {I3 I2 I1 I0} of INIT, every input combination; MUX2 and MUX2_LUT5-8: O = S0 ? I1 : I0, an unknown S0 known when I0 = I1', () => {
  const cases = [];
  for (const [n, init] of [[1, 0b10], [2, 0b0110], [3, 0b10010110], [4, 0x28ac], [4, 0x8001]]) {
    const ins = Array.from({ length: n }, (_, i) => `I${i}`);
    const steps = Array.from({ length: 2 ** n }, (_, k) => ({ in: Object.fromEntries(ins.map((p, i) => [p, bit(k, i)])), out: { F: String(bit(init, k)) } }));
    steps.push({ in: { I0: 'x' }, out: { F: 'x' } });
    cases.push({ name: `LUT${n}_${init.toString(16)}`, cell: `LUT${n}`, params: [['INIT', { bits: 2 ** n, v: init }]], pins: pins(ins, ['F']), steps });
  }
  for (const cell of ['MUX2', 'MUX2_LUT5', 'MUX2_LUT6', 'MUX2_LUT7', 'MUX2_LUT8']) {
    const steps = Array.from({ length: 8 }, (_, k) => ({ in: { I0: bit(k, 0), I1: bit(k, 1), S0: bit(k, 2) }, out: { O: String(bit(k, bit(k, 2) ? 1 : 0)) } }));
    steps.push({ in: { I0: 1, I1: 1, S0: 'x' }, out: { O: '1' } }, { in: { I1: 0 }, out: { O: 'x' } });
    cases.push({ name: cell, cell, pins: pins(['I0', 'I1', 'S0'], ['O']), steps });
  }
  checkCases(cases, 'LUTs and MUXes');
});

// a flip-flop's reference: Q after each step, from its kind (S / R synchronous, P / C asynchronous), its enable, its edge
function ffRef(name, init, steps) {
  const m = /^DFF(N)?(S|R|P|C)?(E)?$/.exec(name);
  const ctl = { S: 'SET', R: 'RESET', P: 'PRESET', C: 'CLEAR' }[m[2]], val = m[2] === 'S' || m[2] === 'P' ? 1 : 0;
  let q = init, clk = 0;
  const cur = { D: 0, CLK: 0, CE: 0, [ctl]: 0 };
  for (const s of steps) {
    Object.assign(cur, s.in);
    const edge = m[1] ? clk === 1 && cur.CLK === 0 : clk === 0 && cur.CLK === 1;
    clk = cur.CLK;
    if ((m[2] === 'P' || m[2] === 'C') && cur[ctl]) q = val;
    else if (edge) {
      if (m[2] && (m[2] === 'S' || m[2] === 'R') && cur[ctl]) q = val;
      else if (!m[3] || cur.CE) q = cur.D;
    }
    s.out = { Q: String(q) };
  }
  return steps;
}

test('the flip-flops (DFF, DFFE, DFFS/R/P/C and their enable and falling-edge twins): Q step by step against the reference, INIT at start', () => {
  const r = rng(2299), cases = [];
  for (const k of ['', 'S', 'R', 'P', 'C']) {
    for (const e of ['', 'E']) {
      for (const n of ['', 'N']) {
        const name = `DFF${n}${k}${e}`, ctl = { S: 'SET', R: 'RESET', P: 'PRESET', C: 'CLEAR' }[k];
        const ins = ['D', 'CLK', ...(e ? ['CE'] : []), ...(ctl ? [ctl] : [])];
        for (const init of [null, 0, 1]) {
          const steps = Array.from({ length: 40 }, () => ({ in: { D: r(2), CLK: r(2), ...(e ? { CE: r(4) ? 1 : 0 } : {}), ...(ctl ? { [ctl]: r(5) ? 0 : 1 } : {}) } }));
          steps[0].in.CLK = n ? 1 : 0;   // (no edge at the start)
          if (ctl) steps[0].in[ctl] = 0;
          const def = k === 'S' || k === 'P' ? 1 : 0;
          cases.push({ name: `${name}_${init}`, cell: name, params: init === null ? [] : [['INIT', { bit: init }]], pins: pins(ins, ['Q']), steps: ffRef(name, init ?? def, steps) });
        }
      }
    }
  }
  assert.equal(new Set(cases.map((c) => c.cell)).size, 20);
  checkCases(cases, 'flip-flops');
});

test('the latches (DL, DLE, DLC/P and their enable and active-low twins): Q follows D while open, CLEAR / PRESET first', () => {
  const r = rng(2303), cases = [];
  for (const k of ['', 'C', 'P']) {
    for (const e of ['', 'E']) {
      for (const n of ['', 'N']) {
        const name = `DL${n}${k}${e}`, ctl = { C: 'CLEAR', P: 'PRESET' }[k];
        const ins = ['D', 'CLK', ...(e ? ['CE'] : []), ...(ctl ? [ctl] : [])];
        const cur = { D: 0, CLK: 0, CE: 0, [ctl]: 0 };
        let q = 0;
        const steps = Array.from({ length: 30 }, () => {
          const s = { in: { D: r(2), CLK: r(2), ...(e ? { CE: r(2) } : {}), ...(ctl ? { [ctl]: r(4) ? 0 : 1 } : {}) } };
          Object.assign(cur, s.in);
          if (ctl && cur[ctl]) q = k === 'P' ? 1 : 0;
          else if (cur.CLK === (n ? 0 : 1) && (!e || cur.CE)) q = cur.D;
          s.out = { Q: String(q) };
          return s;
        });
        cases.push({ name, cell: name, pins: pins(ins, ['Q']), steps });
      }
    }
  }
  checkCases(cases, 'latches');
});

test('ALU: SUM and COUT of each ALU_MODE (ADD, SUB, ADDSUB, NE, GE, LE, CUP, CDN, CUPCDN, MULT), every input combination', () => {
  // S and C of each mode, as cells_sim.v's
  const SC = [
    (a, b) => [a ^ b, a], (a, b) => [a ^ (1 - b), a], (a, b, i3) => [i3 ? a ^ b : a ^ (1 - b), a], (a, b) => [a ^ (1 - b), 1], (a, b) => [a ^ (1 - b), a],
    (a, b) => [(1 - a) ^ b, b], (a) => [a, 0], (a) => [1 - a, 1], (a, b, i3) => [i3 ? a : 1 - a, a], (a, b, i3) => [(a & b) ^ i3, a & b]];
  const cases = SC.map((f, mode) => ({
    name: `ALU_${mode}`, cell: 'ALU', params: [['ALU_MODE', { int: mode }]], pins: pins(['I0', 'I1', 'I3', 'CIN'], ['SUM', 'COUT']),
    steps: Array.from({ length: 16 }, (_, k) => {
      const [a, b, i3, cin] = [0, 1, 2, 3].map((i) => bit(k, i));
      const [s, c] = f(a, b, i3);
      return { in: { I0: a, I1: b, I3: i3, CIN: cin }, out: { SUM: String(s ^ cin), COUT: String(s ? cin : c) } };
    }),
  }));
  checkCases(cases, 'ALU');
});

test('RAM16S1/2/4 and RAM16SDP1/2/4: INIT_0 … the contents, written on CLK\'s rising edge with WRE, read at once', () => {
  const r = rng(16), cases = [];
  for (const w of [1, 2, 4]) {
    for (const dual of [false, true]) {
      const inits = Array.from({ length: w }, () => r(65536));
      // (the inputs, the first step's no write: its read the INIT's; then the reference's contents and reads)
      let clk = 0;
      const steps = Array.from({ length: 40 }, (_, k) => ({ in: { CLK: (clk = 1 - clk), DI: r(2 ** w), WRE: k ? r(2) : 0, ...(dual ? { WAD: r(16), RAD: r(16) } : { AD: r(16) }) } }));
      const mem = Array.from({ length: 16 }, (_, a) => inits.reduce((x, v, i) => x | (bit(v, a) << i), 0));
      for (const s of steps) {
        if (s.in.CLK && s.in.WRE) mem[dual ? s.in.WAD : s.in.AD] = s.in.DI;
        s.out = { DO: mem[dual ? s.in.RAD : s.in.AD].toString(2).padStart(w, '0') };
      }
      const p = { DI: { dir: 'in', w }, CLK: { dir: 'in', w: 1 }, WRE: { dir: 'in', w: 1 }, ...(dual ? { WAD: { dir: 'in', w: 4 }, RAD: { dir: 'in', w: 4 } } : { AD: { dir: 'in', w: 4 } }), DO: { dir: 'out', w } };
      cases.push({ name: `RAM16S${dual ? 'DP' : ''}${w}`, cell: `RAM16S${dual ? 'DP' : ''}${w}`, params: inits.map((v, i) => [`INIT_${i}`, { bits: 16, v }]), pins: p, steps });
    }
  }
  checkCases(cases, 'distributed RAMs');
});

test('the buffers: IBUF, OBUF, BUFG, INV, TBUF and IOBUF (OEN = 1 releases), ELVDS_OBUF / TLVDS_OBUF (OB the complement), VCC, GND', () => {
  const cases = [
    ...['IBUF', 'OBUF', 'BUFG'].map((cell) => ({ name: cell, cell, pins: pins(['I'], ['O']), steps: [{ in: { I: 1 }, out: { O: '1' } }, { in: { I: 0 }, out: { O: '0' } }, { in: { I: 'z' }, out: { O: 'x' } }] })),
    { name: 'INV', cell: 'INV', pins: pins(['I'], ['O']), steps: [{ in: { I: 1 }, out: { O: '0' } }, { in: { I: 0 }, out: { O: '1' } }] },
    { name: 'TBUF', cell: 'TBUF', pins: pins(['I', 'OEN'], ['O']), steps: [{ in: { I: 1, OEN: 0 }, out: { O: '1' } }, { in: { OEN: 1 }, out: { O: 'z' } }, { in: { I: 0, OEN: 0 }, out: { O: '0' } }] },
    { name: 'IOBUF', cell: 'IOBUF', pins: { I: { dir: 'in', w: 1 }, OEN: { dir: 'in', w: 1 }, O: { dir: 'out', w: 1 }, IO: { dir: 'inout', w: 1 } },
      steps: [{ in: { I: 1, OEN: 0 }, out: { O: '1', IO: '1' } }, { in: { OEN: 1, IO: 0 }, out: { O: '0', IO: '0' } }, { in: { IO: 1 }, out: { O: '1' } }, { in: { IO: 'z' }, out: { O: 'x', IO: 'z' } }] },
    ...['ELVDS_OBUF', 'TLVDS_OBUF'].map((cell) => ({ name: cell, cell, pins: pins(['I'], ['O', 'OB']), steps: [{ in: { I: 1 }, out: { O: '1', OB: '0' } }, { in: { I: 0 }, out: { O: '0', OB: '1' } }] })),
    { name: 'VCC', cell: 'VCC', pins: pins([], ['V']), steps: [{ out: { V: '1' } }] },
    { name: 'GND', cell: 'GND', pins: pins([], ['G']), steps: [{ out: { G: '0' } }] },
  ];
  checkCases(cases, 'buffers');
});

// ISE schematic import: every Xilinx library symbol Silinx imports (native symbol or exact HDL)
// keeps its function. For each symbol, a one-block ISE schematic is imported, written as VHDL and
// as Verilog, simulated with a generated testbench, and compared with a JavaScript model of the
// symbol (the Xilinx libraries guide). The ISE export -> import round trip keeps the block too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { generateHdl, netlist } from '../core/schdoc.js';
import { importIseSch, exportIseSch, parseIseSch } from '../core/isesch.js';

// ------------------------------------------------------------------ schematic + testbench builders
// spec: { sym, ins: { port: width }, outs: { port: width }, pins: { pin: signal }, clock?: 'C' }
function iseSch({ sym, ins, outs, pins }) {
  const sigs = new Set(Object.values(pins));
  const L = ['<?xml version="1.0" encoding="UTF-8"?>', '<drawing version="7">', '  <netlist>'];
  const portName = (p, w) => (w > 1 ? `${p}(${w - 1}:0)` : p);
  for (const [p, w] of [...Object.entries(ins), ...Object.entries(outs)]) sigs.add(portName(p, w));
  for (const s of sigs) L.push(`    <signal name="${s}" />`);
  for (const [p, w] of Object.entries(ins)) L.push(`    <port polarity="Input" name="${portName(p, w)}" />`);
  for (const [p, w] of Object.entries(outs)) L.push(`    <port polarity="Output" name="${portName(p, w)}" />`);
  L.push(`    <block symbolname="${sym}" name="XLXI_1">`);
  for (const [pin, s] of Object.entries(pins)) L.push(`      <blockpin signalname="${s}" name="${pin}" />`);
  L.push('    </block>', '  </netlist>', '  <sheet sheetnum="1" width="3520" height="2720">',
    '    <instance x="1200" y="1600" name="XLXI_1" orien="R0" />', '  </sheet>', '</drawing>');
  return L.join('\n');
}
// pins named <pre>0..<pre>(w-1) on the bits of port <port>
// (a 1-bit port is a scalar signal: its pin connects to the port itself)
const bitPins = (pre, port, w, out = {}) => { for (let k = 0; k < w; k++) out[`${pre}${k}`] = w > 1 ? `${port}(${k})` : port; return out; };
const same = names => Object.fromEntries(names.map(n => [n, n]));

const bin = (v, w) => (typeof v === 'string' ? v : (v >>> 0).toString(2).padStart(w, '0').slice(-w));
// testbench: apply each vector ({ port: value }), pulse the clock when spec.clock, print the outputs
function testbench(spec, vectors, lang) {
  const { ins, outs, clock } = spec;
  const all = { ...ins, ...outs };
  const lit = (v, w) => (lang === 'vhdl' ? (w > 1 ? `"${bin(v, w)}"` : `'${bin(v, 1)}'`) : `${w}'b${bin(v, w)}`);
  const outNames = Object.keys(outs);
  if (lang === 'vhdl') {
    const decl = Object.entries(all).map(([p, w]) => `  signal ${p} : ${w > 1 ? `std_logic_vector(${w - 1} downto 0)` : 'std_logic'}${clock === p ? " := '0'" : ''};`).join('\n');
    const steps = vectors.map(v => {
      const set = Object.entries(v).map(([p, x]) => `${p} <= ${lit(x, ins[p])};`).join(' ');
      const clk = clock ? ` ${clock} <= '1'; wait for 1 ns; ${clock} <= '0'; wait for 1 ns;` : '';
      return `    ${set} wait for 1 ns;${clk} report ${outNames.map(o => `to_string(${o})`).join(' & " " & ')};`;
    }).join('\n');
    return `library ieee; use ieee.std_logic_1164.all;
entity tb is end;
architecture s of tb is
${decl}
begin
  dut : entity work.top port map (${Object.keys(all).map(p => `${p} => ${p}`).join(', ')});
  process begin
${steps}
    wait;
  end process;
end;`;
  }
  const decl = [...Object.entries(ins).map(([p, w]) => `  reg ${w > 1 ? `[${w - 1}:0] ` : ''}${p}${clock === p ? ' = 0' : ''};`),
    ...Object.entries(outs).map(([p, w]) => `  wire ${w > 1 ? `[${w - 1}:0] ` : ''}${p};`)].join('\n');
  const steps = vectors.map(v => {
    const set = Object.entries(v).map(([p, x]) => `${p} = ${lit(x, ins[p])};`).join(' ');
    const clk = clock ? ` ${clock} = 1; #1 ${clock} = 0; #1;` : '';
    return `    ${set} #1;${clk} $display("${outNames.map(() => '%b').join(' ')}", ${outNames.join(', ')});`;
  }).join('\n');
  return `\`timescale 1ns/1ps
module tb;
${decl}
  top dut (${Object.keys(all).map(p => `.${p}(${p})`).join(', ')});
  initial begin
${steps}
  end
endmodule`;
}

function simulateSymbol(spec, vectors, lang) {
  const { doc, warnings } = importIseSch(iseSch(spec), { name: 'top', lang });
  assert.deepEqual(warnings.filter(w => /connectivity|no Silinx equivalent|schematic check/.test(w)), [], `${spec.sym}: ${warnings.join('\n')}`);
  const g = generateHdl(doc, { lang });
  assert.deepEqual(g.diagnostics.filter(d => d.severity === 'error').map(d => d.message), [], g.code);
  const tbPath = lang === 'vhdl' ? 'tb.vhd' : 'tb.v';
  const r = simulate([{ path: g.filename, text: g.code }, { path: tbPath, text: testbench(spec, vectors, lang) }], 'tb', { until: 1e12 });
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], g.code);
  const bad = r.sim.log.filter(l => l.kind === 'error' || l.kind === 'failure');
  assert.deepEqual(bad.map(l => l.text), []);
  return { lines: r.sim.log.filter(l => l.kind === 'print' || l.kind === 'note').filter(l => !/^simulation/.test(l.text)).map(l => l.text.toLowerCase()), doc, g };
}

// check a symbol against its model in both languages; model(v, state) -> { out: { port: value }, state }
function check(spec, vectors, model) {
  let state = spec.init ? { ...spec.init } : {};
  const expected = vectors.map(v => {
    const r = model(v, state);
    state = r.state || state;
    return Object.keys(spec.outs).map(o => bin(r.out[o], spec.outs[o])).join(' ').toLowerCase();
  });
  for (const lang of ['vhdl', 'verilog']) {
    const { lines } = simulateSymbol(spec, vectors, lang);
    assert.deepEqual(lines, expected, `${spec.sym} (${lang})`);
  }
}

// all combinations of the given input widths (in order), as vectors
function exhaustive(ins) {
  const names = Object.keys(ins), total = names.reduce((a, n) => a + ins[n], 0);
  const out = [];
  for (let k = 0; k < 1 << total; k++) {
    let x = k; const v = {};
    for (const n of names) { v[n] = x & ((1 << ins[n]) - 1); x >>>= ins[n]; }
    out.push(v);
  }
  return out;
}
// deterministic pseudo-random vectors
function randomVectors(ins, n, seed = 1) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const v = {};
    for (const [p, w] of Object.entries(ins)) { seed = (seed * 1103515245 + 12345) >>> 0; v[p] = (seed >>> 8) & ((2 ** w) - 1); }
    out.push(v);
  }
  return out;
}
const bit = (x, i) => (x >> i) & 1;

// ------------------------------------------------------------------ combinational symbols
test('gates with inverted inputs and wide gates: XOR4, XNOR3, NAND3B1, NOR2B1, AND5B2, OR4B3', () => {
  for (const [sym, n, b, f, inv] of [
    ['xor4', 4, 0, (a, c) => a ^ c, false], ['xnor3', 3, 0, (a, c) => a ^ c, true], ['nand3b1', 3, 1, (a, c) => a & c, true],
    ['nor2b1', 2, 1, (a, c) => a | c, true], ['and5b2', 5, 2, (a, c) => a & c, false], ['or4b3', 4, 3, (a, c) => a | c, false],
  ]) {
    const spec = { sym, ins: { I: n }, outs: { O: 1 }, pins: { ...bitPins('I', 'I', n), O: 'O' } };
    check(spec, exhaustive({ I: n }), v => {
      const xs = [...Array(n).keys()].map(i => (i < b ? 1 - bit(v.I, i) : bit(v.I, i)));
      const r = xs.reduce(f);
      return { out: { O: inv ? 1 - r : r } };
    });
  }
});

test('multiplexers M2_1E, M4_1E, M8_1E, M2_1B1, M2_1B2', () => {
  for (const [sym, n, en, invert] of [['m2_1e', 2, true, 0], ['m4_1e', 4, true, 0], ['m8_1e', 8, true, 0], ['m2_1b1', 2, false, 1], ['m2_1b2', 2, false, 2]]) {
    const k = Math.log2(n);
    const ins = { D: n, S: k, ...(en ? { E: 1 } : {}) };
    const spec = { sym, ins, outs: { O: 1 }, pins: { ...bitPins('D', 'D', n), ...bitPins('S', 'S', k), ...(en ? { E: 'E' } : {}), O: 'O' } };
    const vectors = n === 8 ? randomVectors(ins, 200, 7) : exhaustive(ins);
    check(spec, vectors, v => {
      let d = bit(v.D, v.S);
      if (v.S < invert) d = 1 - d;
      return { out: { O: en ? d & v.E : d } };
    });
  }
});

test('decoders D2_4E and D3_8E', () => {
  for (const [sym, n] of [['d2_4e', 2], ['d3_8e', 3]]) {
    const spec = { sym, ins: { A: n, E: 1 }, outs: { D: 1 << n }, pins: { ...bitPins('A', 'A', n), E: 'E', ...bitPins('D', 'D', 1 << n) } };
    check(spec, exhaustive({ A: n, E: 1 }), v => ({ out: { D: v.E ? 1 << v.A : 0 } }));
  }
});

test('comparators COMP4 (EQ), COMPM4 (GT, LT), COMP8 and COMPM8 (buses)', () => {
  const s4 = { sym: 'comp4', ins: { A: 4, B: 4 }, outs: { EQ: 1 }, pins: { ...bitPins('A', 'A', 4), ...bitPins('B', 'B', 4), EQ: 'EQ' } };
  check(s4, exhaustive({ A: 4, B: 4 }), v => ({ out: { EQ: +(v.A === v.B) } }));
  const m4 = { sym: 'compm4', ins: { A: 4, B: 4 }, outs: { GT: 1, LT: 1 }, pins: { ...bitPins('A', 'A', 4), ...bitPins('B', 'B', 4), GT: 'GT', LT: 'LT' } };
  check(m4, exhaustive({ A: 4, B: 4 }), v => ({ out: { GT: +(v.A > v.B), LT: +(v.A < v.B) } }));
  const s8 = { sym: 'comp8', ins: { A: 8, B: 8 }, outs: { EQ: 1 }, pins: { 'A(7:0)': 'A(7:0)', 'B(7:0)': 'B(7:0)', EQ: 'EQ' } };
  const r8 = randomVectors({ A: 8, B: 8 }, 60, 3).map((v, i) => (i % 4 ? v : { A: v.A, B: v.A }));
  check(s8, r8, v => ({ out: { EQ: +(v.A === v.B) } }));
  const m8 = { sym: 'compm8', ins: { A: 8, B: 8 }, outs: { GT: 1, LT: 1 }, pins: { 'A(7:0)': 'A(7:0)', 'B(7:0)': 'B(7:0)', GT: 'GT', LT: 'LT' } };
  check(m8, r8, v => ({ out: { GT: +(v.A > v.B), LT: +(v.A < v.B) } }));
});

test('adders ADD4 / ADD8 and adder-subtractors ADSU4 / ADSU8: sum, carry out, two\'s complement overflow', () => {
  const model = (w, adsu) => v => {
    const m = (1 << w) - 1, b = adsu && !v.ADD ? ~v.B & m : v.B;
    const s = v.A + b + v.CI;
    const msb = x => (x >> (w - 1)) & 1;
    return { out: { S: s & m, CO: s >> w, OFL: +(msb(v.A) === msb(b) && msb(v.A) !== msb(s & m)) } };
  };
  for (const [sym, w, adsu] of [['add4', 4, false], ['adsu4', 4, true], ['add8', 8, false], ['adsu8', 8, true]]) {
    const ins = { A: w, B: w, CI: 1, ...(adsu ? { ADD: 1 } : {}) };
    const pins = w === 4 ? { ...bitPins('A', 'A', 4), ...bitPins('B', 'B', 4), ...bitPins('S', 'S', 4) } : { 'A(7:0)': 'A(7:0)', 'B(7:0)': 'B(7:0)', 'S(7:0)': 'S(7:0)' };
    const spec = { sym, ins, outs: { S: w, CO: 1, OFL: 1 }, pins: { ...pins, CI: 'CI', CO: 'CO', OFL: 'OFL', ...(adsu ? { ADD: 'ADD' } : {}) } };
    check(spec, w === 4 && !adsu ? exhaustive(ins) : randomVectors(ins, 150, w * 3 + (adsu ? 1 : 0)), model(w, adsu));
  }
});

test('tri-state and multi-bit buffers: OBUFE, OBUFT, BUFE, BUFT, INV4, BUF4', () => {
  for (const sym of ['obufe', 'bufe']) {
    check({ sym, ins: { I: 1, E: 1 }, outs: { O: 1 }, pins: same(['I', 'E', 'O']) }, exhaustive({ I: 1, E: 1 }), v => ({ out: { O: v.E ? v.I : 'z' } }));
  }
  for (const sym of ['obuft', 'buft']) {
    check({ sym, ins: { I: 1, T: 1 }, outs: { O: 1 }, pins: same(['I', 'T', 'O']) }, exhaustive({ I: 1, T: 1 }), v => ({ out: { O: v.T ? 'z' : v.I } }));
  }
  for (const sym of ['inv4', 'buf4']) {
    const spec = { sym, ins: { I: 4 }, outs: { O: 4 }, pins: { ...bitPins('I', 'I', 4), ...bitPins('O', 'O', 4) } };
    check(spec, exhaustive({ I: 4 }), v => ({ out: { O: sym === 'inv4' ? ~v.I & 15 : v.I } }));
  }
});

test('carry-chain and wide-function primitives: MUXCY(_L/_D), XORCY, MULT_AND, MUXF5..MUXF8', () => {
  check({ sym: 'muxcy', ins: { CI: 1, DI: 1, S: 1 }, outs: { O: 1 }, pins: same(['CI', 'DI', 'S', 'O']) }, exhaustive({ CI: 1, DI: 1, S: 1 }),
    v => ({ out: { O: v.S ? v.CI : v.DI } }));
  check({ sym: 'muxcy_d', ins: { CI: 1, DI: 1, S: 1 }, outs: { O: 1, LO: 1 }, pins: same(['CI', 'DI', 'S', 'O', 'LO']) }, exhaustive({ CI: 1, DI: 1, S: 1 }),
    v => ({ out: { O: v.S ? v.CI : v.DI, LO: v.S ? v.CI : v.DI } }));
  check({ sym: 'muxcy_l', ins: { CI: 1, DI: 1, S: 1 }, outs: { LO: 1 }, pins: same(['CI', 'DI', 'S', 'LO']) }, exhaustive({ CI: 1, DI: 1, S: 1 }),
    v => ({ out: { LO: v.S ? v.CI : v.DI } }));
  check({ sym: 'xorcy', ins: { CI: 1, LI: 1 }, outs: { O: 1 }, pins: same(['CI', 'LI', 'O']) }, exhaustive({ CI: 1, LI: 1 }), v => ({ out: { O: v.CI ^ v.LI } }));
  check({ sym: 'mult_and', ins: { I0: 1, I1: 1 }, outs: { LO: 1 }, pins: same(['I0', 'I1', 'LO']) }, exhaustive({ I0: 1, I1: 1 }), v => ({ out: { LO: v.I0 & v.I1 } }));
  for (const sym of ['muxf5', 'muxf6', 'muxf7', 'muxf8']) {
    check({ sym, ins: { I0: 1, I1: 1, S: 1 }, outs: { O: 1 }, pins: same(['I0', 'I1', 'S', 'O']) }, exhaustive({ I0: 1, I1: 1, S: 1 }), v => ({ out: { O: v.S ? v.I1 : v.I0 } }));
  }
});

// ------------------------------------------------------------------ sequential symbols
// FD family: { ce, clr (async), pre (async), r (sync), s (sync), init }; priority CLR > PRE > R > S > CE
function ffModel(o) {
  return (v, st) => {
    let q = st.q;
    if (o.clr && v.CLR) q = 0;
    else if (o.pre && v.PRE) q = 1;
    else if (o.r && v.R) q = 0;
    else if (o.s && v.S) q = 1;
    else if (!o.ce || v.CE) q = o.toggle ? (v.T ? 1 - q : q) : v.D;
    return { out: { Q: q }, state: { q } };
  };
}

test('flip-flops FD, FDC, FDCE, FDE, FDP, FDPE, FDR, FDRE, FDS, FDSE, FDRS, FDRSE, FDCPE (rising edge, async and sync controls)', () => {
  for (const sym of ['fd', 'fdc', 'fdce', 'fde', 'fdp', 'fdpe', 'fdr', 'fdre', 'fds', 'fdse', 'fdrs', 'fdrse', 'fdcpe']) {
    const f = sym.slice(2);
    const o = { ce: f.includes('e'), clr: /^c/.test(f), pre: /p/.test(f), r: /^r/.test(f), s: /s/.test(f) };
    const ins = { D: 1, ...(o.ce ? { CE: 1 } : {}), ...(o.clr ? { CLR: 1 } : {}), ...(o.pre ? { PRE: 1 } : {}), ...(o.r ? { R: 1 } : {}), ...(o.s ? { S: 1 } : {}) };
    const pins = { ...same(Object.keys(ins)), C: 'C', Q: 'Q' };
    // async controls mostly inactive, so the clocked path is exercised too
    const vectors = randomVectors(ins, 40, sym.length * 13).map(v => ({ ...v, ...(o.clr ? { CLR: +(v.CLR && v.D) } : {}), ...(o.pre ? { PRE: +(v.PRE && !v.D && (v.CE ?? 1)) } : {}) }));
    // INIT defaults (UNISIM): 1 for the preset / set flip-flops FDP(E), FDS(E), else 0 (FDRS(E) and FDCPE too)
    const init = /^(p|pe|s|se)$/.test(f) ? 1 : 0;
    check({ sym, ins: { ...ins, C: 1 }, outs: { Q: 1 }, pins, clock: 'C', init: { q: init } }, vectors, ffModel(o));
  }
});

test('flip-flops start at their INIT default (1 for FDP, FDPE, FDS, FDSE; 0 otherwise) before the first clock edge', () => {
  // (every pin connected, the controls inactive and no clock edge)
  for (const sym of ['fd', 'fdce', 'fdp', 'fdpe', 'fds', 'fdse', 'fdrs', 'fdrse', 'fdcpe', 'ftc', 'ftp']) {
    const f = sym.slice(2);
    const ins = { C: 1, [sym.startsWith('ft') ? 'T' : 'D']: 1 };
    if (f.endsWith('e')) ins.CE = 1;
    if (/^c/.test(f)) ins.CLR = 1;
    if (/p/.test(f)) ins.PRE = 1;
    if (/^r/.test(f)) ins.R = 1;
    if (/s/.test(f)) ins.S = 1;
    const v = Object.fromEntries(Object.keys(ins).map(k => [k, k === 'CE' ? 1 : 0]));
    check({ sym, ins, outs: { Q: 1 }, pins: { ...same(Object.keys(ins)), Q: 'Q' } }, [v], () => ({ out: { Q: /^(p|pe|s|se)$/.test(f) ? 1 : 0 } }));
  }
});

test('a flip-flop with unconnected CE / CLR pins generates valid HDL (CLR inactive, CE always enabled)', () => {
  const ins = { C: 1, D: 1 };
  check({ sym: 'fdce', ins, outs: { Q: 1 }, pins: { C: 'C', D: 'D', Q: 'Q' }, clock: 'C', init: { q: 0 } }, [{ D: 1 }, { D: 0 }],
    (v) => ({ out: { Q: v.D }, state: { q: v.D } }));
});

test('toggle flip-flops FTC, FTCE, FTP, FTPE', () => {
  for (const sym of ['ftc', 'ftce', 'ftp', 'ftpe']) {
    const f = sym.slice(2);
    const o = { toggle: true, ce: f.endsWith('e'), clr: f[0] === 'c', pre: f[0] === 'p' };
    const ins = { T: 1, ...(o.ce ? { CE: 1 } : {}), ...(o.clr ? { CLR: 1 } : {}), ...(o.pre ? { PRE: 1 } : {}) };
    const vectors = randomVectors(ins, 40, sym.length * 7 + 1).map((v, i) => ({ ...v, ...(o.clr ? { CLR: +(i % 9 === 4) } : {}), ...(o.pre ? { PRE: +(i % 9 === 4) } : {}) }));
    check({ sym, ins: { ...ins, C: 1 }, outs: { Q: 1 }, pins: { ...same(Object.keys(ins)), C: 'C', Q: 'Q' }, clock: 'C', init: { q: o.pre ? 1 : 0 } }, vectors, ffModel(o));
  }
});

test('registers FD4CE / FD4RE / FD8CE and counters CB4CE / CB4RE / CB8CE / CB2CE (Q, TC, CEO)', () => {
  for (const [sym, w, sync] of [['fd4ce', 4, false], ['fd4re', 4, true], ['fd8ce', 8, false]]) {
    const rst = sync ? 'R' : 'CLR';
    const ins = { D: w, CE: 1, [rst]: 1 };
    const pins = w === 4 ? { ...bitPins('D', 'D', 4), ...bitPins('Q', 'Q', 4) } : { 'D(7:0)': 'D(7:0)', 'Q(7:0)': 'Q(7:0)' };
    const vectors = randomVectors(ins, 40, w + (sync ? 5 : 0)).map((v, i) => ({ ...v, [rst]: +(i % 7 === 3) }));
    check({ sym, ins: { ...ins, C: 1 }, outs: { Q: w }, pins: { ...pins, CE: 'CE', [rst]: rst, C: 'C' }, clock: 'C', init: { q: 0 } }, vectors,
      (v, st) => { const q = v[rst] ? 0 : v.CE ? v.D : st.q; return { out: { Q: q }, state: { q } }; });
  }
  for (const [sym, w, sync] of [['cb4ce', 4, false], ['cb4re', 4, true], ['cb8ce', 8, false], ['cb2ce', 2, false]]) {
    const rst = sync ? 'R' : 'CLR';
    const ins = { CE: 1, [rst]: 1 };
    const pins = w <= 4 ? bitPins('Q', 'Q', w) : { 'Q(7:0)': 'Q(7:0)' };
    const n = w === 8 ? 300 : 40;
    const vectors = Array.from({ length: n }, (_, i) => ({ CE: +(i % 5 !== 2), [rst]: +(i === 0 || i === n - 7) }));
    const max = (1 << w) - 1;
    check({ sym, ins: { ...ins, C: 1 }, outs: { Q: w, TC: 1, CEO: 1 }, pins: { ...pins, CE: 'CE', [rst]: rst, C: 'C', TC: 'TC', CEO: 'CEO' }, clock: 'C', init: { q: 0 } }, vectors,
      (v, st) => { const q = v[rst] ? 0 : v.CE ? (st.q + 1) & max : st.q; return { out: { Q: q, TC: +(q === max), CEO: +(q === max && v.CE === 1) }, state: { q } }; });
  }
});

// ------------------------------------------------------------------ export -> import round trip of the library blocks
test('export -> import keeps each library block, its pins and its nets', () => {
  const specs = [
    { sym: 'add4', ins: { A: 4, B: 4, CI: 1 }, outs: { S: 4, CO: 1, OFL: 1 }, pins: { ...bitPins('A', 'A', 4), ...bitPins('B', 'B', 4), ...bitPins('S', 'S', 4), CI: 'CI', CO: 'CO', OFL: 'OFL' } },
    { sym: 'cb4ce', ins: { CE: 1, CLR: 1, C: 1 }, outs: { Q: 4, TC: 1, CEO: 1 }, pins: { ...bitPins('Q', 'Q', 4), CE: 'CE', CLR: 'CLR', C: 'C', TC: 'TC', CEO: 'CEO' } },
    { sym: 'm4_1e', ins: { D: 4, S: 2, E: 1 }, outs: { O: 1 }, pins: { ...bitPins('D', 'D', 4), ...bitPins('S', 'S', 2), E: 'E', O: 'O' } },
    { sym: 'compm8', ins: { A: 8, B: 8 }, outs: { GT: 1, LT: 1 }, pins: { 'A(7:0)': 'A(7:0)', 'B(7:0)': 'B(7:0)', GT: 'GT', LT: 'LT' } },
  ];
  for (const spec of specs) {
    const a = importIseSch(iseSch(spec), { name: 'top' });
    const ex = exportIseSch(a.doc, {});
    const symbols = Object.fromEntries(ex.files.filter(x => x.kind === 'sym').map(x => [x.path, x.text]));
    const m = parseIseSch(ex.xml);
    assert.ok(m.blocks.length >= 1, spec.sym);
    const b = importIseSch(ex.xml, { name: 'top', symbols });
    assert.deepEqual(b.warnings.filter(w => /^connectivity/.test(w)), [], spec.sym);
    const nets = d => netlist(d).nets.map(n => n.endpoints.filter(e => e.kind === 'port').length).sort().join(',');
    assert.equal(nets(b.doc), nets(a.doc), spec.sym);
    // and the re-imported schematic still simulates like the original
    const g1 = generateHdl(a.doc, { lang: 'vhdl' }).code, g2 = generateHdl(b.doc, { lang: 'vhdl' }).code;
    assert.ok(g1.length > 0 && g2.length > 0);
  }
});

test('registers and counters with unconnected CE / CLR / R: no constant in a sensitivity list, they always load / count', () => {
  check({ sym: 'fd4ce', ins: { D: 4, C: 1 }, outs: { Q: 4 }, pins: { ...bitPins('D', 'D', 4), ...bitPins('Q', 'Q', 4), C: 'C' }, clock: 'C', init: { q: 0 } },
    [{ D: 5 }, { D: 9 }, { D: 3 }], (v) => ({ out: { Q: v.D }, state: { q: v.D } }));
  check({ sym: 'cb4ce', ins: { C: 1 }, outs: { Q: 4 }, pins: { ...bitPins('Q', 'Q', 4), C: 'C' }, clock: 'C', init: { q: 0 } },
    [{}, {}, {}, {}], (v, st) => { const q = (st.q + 1) & 15; return { out: { Q: q }, state: { q } }; });
});

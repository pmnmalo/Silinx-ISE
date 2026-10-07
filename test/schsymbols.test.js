// Inverted-input gates (ANDnBk...), decoders, encoders and demultiplexers: geometry, netlist widths and
// simulation of the generated VHDL and Verilog against a JS model of each symbol (exhaustive / random stimulus).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { newDoc, normalizeDoc, netlist, generateHdl, symbolDef, symbolPins, SYMBOLS, SYMBOL_CATEGORIES } from '../core/schdoc.js';

// ------------------------------------------------------------------ JS models: (params, inputs { pin: BigInt }) -> { pin: BigInt }
const bit = (v, i) => (v >> BigInt(i)) & 1n;
const mask = w => (1n << BigInt(w)) - 1n;
function model(type, p, inp, def) {
  const S = SYMBOLS[type];
  const W = Math.max(1, +p.width || 1);
  if (S.gate) {
    const k = S.invIn || 0, n = S.inputs, base = S.gate.replace(/^n/, '');
    let acc = base === 'and' ? mask(W) : 0n;
    for (let i = 0; i < n; i++) {
      const x = i < k ? ~inp[`I${i}`] & mask(W) : inp[`I${i}`];
      acc = base === 'and' ? acc & x : acc | x;
    }
    return { O: S.gate.startsWith('n') ? ~acc & mask(W) : acc };
  }
  if (type === 'demux') {
    const k = +p.sel || 1, sel = Number(k === 1 ? inp.S0 : inp.S);
    const out = {};
    for (let i = 0; i < 1 << k; i++) out[`O${i}`] = i === sel ? inp.D : 0n;
    return out;
  }
  if (type === 'decoder') {
    const n = +p.n;
    let a = 0n;
    if (p.bus) a = inp.A; else for (let j = 0; j < n; j++) a |= inp[`A${j}`] << BigInt(j);
    const e = p.en ? inp.E : 1n;
    const out = {};
    if (p.bus) out.D = e ? 1n << a : 0n;
    else for (let i = 0; i < 1 << n; i++) out[`D${i}`] = e && BigInt(i) === a ? 1n : 0n;
    return out;
  }
  if (type === 'encoder') {
    const n = +p.n, m = 1 << n;
    let I = 0n;
    if (p.bus) I = inp.I; else for (let i = 0; i < m; i++) I |= inp[`I${i}`] << BigInt(i);
    let a = 0n;
    if (p.mode === 'one-hot') { for (let i = 0; i < m; i++) if (bit(I, i)) a |= BigInt(i); }
    else for (let i = m - 1; i >= 0; i--) if (bit(I, i)) { a = BigInt(i); break; }
    const out = { V: I ? 1n : 0n };
    if (p.bus) out.A = a; else for (let j = 0; j < n; j++) out[`A${j}`] = bit(a, j);
    return out;
  }
  throw new Error(type);
}

// ------------------------------------------------------------------ test bench generation
// cases: [{ type, params, open?: [pins left unconnected] }]; every connected pin gets an I/O marker named <inst>_<pin>
function buildDoc(name, lang, cases) {
  const doc = newDoc(name, lang);
  let y = 40;
  const items = [];
  cases.forEach((c, k) => {
    const s = { id: `S${k + 1}`, type: c.type, x: 200, y, rot: 0, mirror: false, name: `U${k + 1}`, params: { ...c.params } };
    doc.symbols.push(s);
    const ns = normalizeDoc({ ...doc, symbols: [s] }).symbols[0];
    const def = symbolDef(ns);
    const pins = symbolPins(ns);
    for (const q of pins) {
      if ((c.open || []).includes(q.name)) continue;
      doc.ports.push({ id: `P${doc.ports.length + 1}`, name: `${s.name}_${q.name}`, dir: q.dir === 'out' ? 'out' : 'in', width: q.width || 1, x: q.x, y: q.y });
    }
    items.push({ c, s: ns, def, pins });
    y += def.h + 60;
  });
  return { doc, items };
}
const rnd = (() => { let x = 12345; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x; }; })();
function randBits(w, density = 0.5) { let v = 0n; for (let i = 0; i < w; i++) if (rnd() / 0x7fffffff < density) v |= 1n << BigInt(i); return v; }

// vectors: for symbol k, vector v: exhaustive over its input bits when there are at most 6, random otherwise
function vectors(items, count) {
  const vecs = [];
  for (let v = 0; v < count; v++) {
    const inp = {}, exp = {};
    for (const { c, s, pins } of items) {
      const ins = pins.filter(q => q.dir !== 'out');
      const total = ins.reduce((a, q) => a + (q.width || 1), 0);
      const vals = {};
      if (total <= 6) {
        let x = BigInt(v % (1 << total));
        for (const q of ins) { vals[q.name] = x & mask(q.width || 1); x >>= BigInt(q.width || 1); }
      } else for (const q of ins) vals[q.name] = randBits(q.width || 1, c.type === 'encoder' ? (v % 3 === 0 ? 0.03 : 0.12) : 0.5);
      for (const q of ins) if ((c.open || []).includes(q.name)) vals[q.name] = 0n; else inp[`${s.name}_${q.name}`] = [vals[q.name], q.width || 1];
      const out = model(c.type, s.params, vals);
      for (const q of pins.filter(q2 => q2.dir === 'out')) exp[`${s.name}_${q.name}`] = [out[q.name] & mask(q.width || 1), q.width || 1];
    }
    vecs.push({ inp, exp });
  }
  return vecs;
}
const vlit = (v, w, lang) => {
  const b = v.toString(2).padStart(w, '0');
  return lang === 'vhdl' ? (w > 1 ? `"${b}"` : `'${b}'`) : `${w}'b${b}`;
};
function testbench(lang, top, doc, vecs) {
  const decl = p => (lang === 'vhdl' ? (p.width > 1 ? `std_logic_vector(${p.width - 1} downto 0)` : 'std_logic') : (p.width > 1 ? `[${p.width - 1}:0] ` : ''));
  if (lang === 'vhdl') {
    const L = ['library ieee; use ieee.std_logic_1164.all;', 'entity tb is end;', 'architecture s of tb is'];
    for (const p of doc.ports) L.push(`  signal ${p.name} : ${decl(p)};`);
    L.push('begin', `  dut : entity work.${top} port map (${doc.ports.map(p => `${p.name} => ${p.name}`).join(', ')});`, '  process', '    variable errs : integer := 0;', '  begin');
    vecs.forEach(({ inp, exp }, i) => {
      for (const [n, [v, w]] of Object.entries(inp)) L.push(`    ${n} <= ${vlit(v, w, lang)};`);
      L.push('    wait for 1 ns;');
      for (const [n, [v, w]] of Object.entries(exp)) L.push(`    if ${n} /= ${vlit(v, w, lang)} then errs := errs + 1; report "v${i} ${n}" severity warning; end if;`);
    });
    L.push('    report "errs=" & integer\'image(errs);', '    wait;', '  end process;', 'end;');
    return L.join('\n');
  }
  const L = ['`timescale 1ns/1ps', 'module tb;', '  integer errs = 0;'];
  for (const p of doc.ports) L.push(`  ${p.dir === 'in' ? 'reg' : 'wire'} ${decl(p)}${p.name};`);
  L.push(`  ${top} dut (${doc.ports.map(p => `.${p.name}(${p.name})`).join(', ')});`, '  initial begin');
  vecs.forEach(({ inp, exp }, i) => {
    for (const [n, [v, w]] of Object.entries(inp)) L.push(`    ${n} = ${vlit(v, w, lang)};`);
    L.push('    #1;');
    for (const [n, [v, w]] of Object.entries(exp)) L.push(`    if (${n} !== ${vlit(v, w, lang)}) begin errs = errs + 1; $display("v${i} ${n}"); end`);
  });
  L.push('    $display("errs=%0d", errs);', '  end', 'endmodule');
  return L.join('\n');
}
function check(name, cases, count = 64) {
  for (const lang of ['vhdl', 'verilog']) {
    const { doc, items } = buildDoc(name, lang, cases);
    const nl = netlist(doc);
    assert.deepEqual(nl.diagnostics.filter(d => d.severity === 'error').map(d => d.message), [], `${name} netlist`);
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics.filter(d => d.severity === 'error').map(d => d.message), [], g.code);
    const vecs = vectors(items, count);
    const tb = testbench(lang, name, doc, vecs);
    const r = simulate([{ path: g.filename, text: g.code }, { path: lang === 'vhdl' ? 'tb.vhd' : 'tb.v', text: tb }], 'tb', { until: 1e7 });
    assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], `${lang} compile\n${g.code}`);
    const log = r.sim.log.map(l => l.text);
    assert.ok(log.includes('errs=0'), `${name} ${lang}\n${log.slice(0, 20).join('\n')}\n${g.code}`);
  }
}

// ------------------------------------------------------------------ library
test('symbol library: inverted-input gates, decoder, encoder and demultiplexer', () => {
  const b = Object.keys(SYMBOLS).filter(t => /b\d$/.test(t));
  assert.equal(b.length, 2 + 3 + 4 + 5 + 2 + 3 + 4 + 5 + 2 + 3 + 4 + 2 + 3 + 4);
  for (const t of ['and2b1', 'and5b5', 'or3b2', 'nand4b4', 'nor2b1']) { assert.ok(SYMBOLS[t], t); assert.equal(SYMBOLS[t].category, 'Logic'); }
  assert.equal(SYMBOLS.and2b1.title, 'AND2B1');
  // ordering: each gate is followed by its B variants in the palette
  const keys = Object.keys(SYMBOLS);
  assert.deepEqual(keys.slice(keys.indexOf('and2'), keys.indexOf('and2') + 4), ['and2', 'and2b1', 'and2b2', 'and3']);
  assert.ok(SYMBOL_CATEGORIES.includes('Decoders/Encoders'));
  assert.equal(SYMBOLS.decoder.category, 'Decoders/Encoders');
  assert.equal(SYMBOLS.encoder.category, 'Decoders/Encoders');
  assert.equal(SYMBOLS.demux.category, 'Mux');
  assert.deepEqual(SYMBOLS.decoder.presets.map(p => p.title), ['D2_4E', 'D3_8E', 'D4_16E']);
  assert.deepEqual(SYMBOLS.demux.presets.map(p => p.title), ['DEMUX1_2', 'DEMUX1_4', 'DEMUX1_8']);
  // AND2B1: I0 inverted and at the bottom (as in the Xilinx library), I1 plain at the top
  const g = symbolDef({ type: 'and2b1', params: {} });
  const I0 = g.pins.find(p => p.name === 'I0'), I1 = g.pins.find(p => p.name === 'I1');
  assert.ok(I0.inv && !I1.inv && I0.y > I1.y);
  assert.deepEqual(symbolDef({ type: 'and3b2', params: {} }).pins.filter(p => p.inv).map(p => p.name), ['I0', 'I1']);
  // pins, widths and geometry on the grid for every parameter combination
  const combos = [
    ...[1, 2, 3, 4, 5].flatMap(n => [false, true].flatMap(en => [false, true].map(bus => ({ type: 'decoder', params: { n, en, bus } })))),
    ...[2, 3, 4, 5].flatMap(n => ['priority', 'one-hot'].flatMap(mode => [false, true].map(bus => ({ type: 'encoder', params: { n, mode, bus } })))),
    ...[1, 2, 3, 4].flatMap(sel => [1, 8].map(width => ({ type: 'demux', params: { sel, width } }))),
  ];
  for (const c of combos) {
    const d = symbolDef(c);
    for (const p of d.pins) assert.ok(p.x % 10 === 0 && p.y % 10 === 0, `${JSON.stringify(c)} ${p.name} on grid`);
    assert.ok(d.w % 10 === 0 && d.h % 10 === 0);
    assert.equal(new Set(d.pins.map(p => `${p.x},${p.y}`)).size, d.pins.length, 'distinct pin positions');
  }
  const pw = c => Object.fromEntries(symbolDef(c).pins.map(p => [p.name, `${p.dir}${p.width}`]));
  assert.deepEqual(pw({ type: 'decoder', params: { n: 2, en: true } }), { A0: 'in1', A1: 'in1', E: 'in1', D0: 'out1', D1: 'out1', D2: 'out1', D3: 'out1' });
  assert.deepEqual(pw({ type: 'decoder', params: { n: 3, en: false, bus: true } }), { A: 'in3', D: 'out8' });
  assert.deepEqual(pw({ type: 'encoder', params: { n: 3, bus: true } }), { I: 'in8', A: 'out3', V: 'out1' });
  assert.deepEqual(pw({ type: 'encoder', params: { n: 2 } }), { I0: 'in1', I1: 'in1', I2: 'in1', I3: 'in1', A0: 'out1', A1: 'out1', V: 'out1' });
  assert.deepEqual(pw({ type: 'demux', params: { sel: 1, width: 4 } }), { D: 'in4', S0: 'in1', O0: 'out4', O1: 'out4' });
  assert.deepEqual(pw({ type: 'demux', params: { sel: 2, width: 1 } }), { D: 'in1', S: 'in2', O0: 'out1', O1: 'out1', O2: 'out1', O3: 'out1' });
  assert.equal(symbolDef({ type: 'decoder', params: { n: 4 } }).title, 'D4_16E');
  assert.equal(symbolDef({ type: 'encoder', params: { n: 3, mode: 'one-hot' } }).title, 'ENC8_3');
});

// ------------------------------------------------------------------ simulation of the generated HDL
test('simulation: every inverted-input gate (exhaustive, Width 1)', () => {
  const cases = Object.keys(SYMBOLS).filter(t => /b\d$/.test(t)).map(type => ({ type, params: { width: 1 } }));
  check('bgates', cases, 32);
});

test('simulation: inverted-input gates with Width > 1 (bitwise, random)', () => {
  check('bgates3', [
    { type: 'and3b2', params: { width: 3 } }, { type: 'or2b1', params: { width: 3 } }, { type: 'nand4b1', params: { width: 3 } },
    { type: 'nor3b3', params: { width: 3 } }, { type: 'and2b1', params: { width: 8 } }, { type: 'or4b2', params: { width: 2 } },
  ], 40);
});

test('simulation: decoders n = 1..5 with/without enable, bit and bus pins (exhaustive)', () => {
  const cases = [];
  for (const n of [1, 2, 3, 4, 5]) for (const en of [true, false]) for (const bus of [false, true]) cases.push({ type: 'decoder', params: { n, en, bus } });
  check('decoders', cases, 64);
});

test('simulation: priority and one-hot encoders n = 2..5, bit and bus pins (random)', () => {
  const cases = [];
  for (const n of [2, 3, 4, 5]) for (const mode of ['priority', 'one-hot']) for (const bus of [false, true]) cases.push({ type: 'encoder', params: { n, mode, bus } });
  check('encoders', cases, 60);
});

test('simulation: demultiplexers 1:2 .. 1:16 with data widths 1 and 4 (exhaustive / random)', () => {
  const cases = [];
  for (const sel of [1, 2, 3, 4]) for (const width of [1, 4]) cases.push({ type: 'demux', params: { sel, width } });
  check('demuxes', cases, 64);
});

test('generateHdl: unwired decoder / encoder / demux still give valid HDL', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = newDoc('lone', lang);
    doc.symbols.push({ id: 'S1', type: 'decoder', x: 100, y: 100, params: { n: 3 } }, { id: 'S2', type: 'encoder', x: 400, y: 100, params: { n: 3, bus: true } }, { id: 'S3', type: 'demux', x: 700, y: 100, params: { sel: 3 } });
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics.filter(d => d.severity === 'error'), []);
    const r = simulate([{ path: g.filename, text: g.code }], 'lone', { until: 10 });
    assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], g.code);
  }
});

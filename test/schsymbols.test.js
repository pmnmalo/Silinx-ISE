// Inverted-input gates (ANDnBk...), decoders, encoders and demultiplexers: geometry, netlist widths and
// simulation of the generated VHDL and Verilog against a JS model of each symbol (exhaustive / random stimulus).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { newDoc, normalizeDoc, defaultParams, netlist, generateHdl, symbolDef, symbolPins, SYMBOLS, SYMBOL_CATEGORIES, gateVariant, symbolTypeName } from '../core/schdoc.js';

// ------------------------------------------------------------------ JS models: (params, inputs { pin: BigInt }) -> { pin: BigInt }
const bit = (v, i) => (v >> BigInt(i)) & 1n;
const mask = w => (1n << BigInt(w)) - 1n;
function model(type, p, inp, def) {
  const S = SYMBOLS[type];
  const W = Math.max(1, +p.width || 1);
  if (S.gate) {
    const k = S.invIn || 0, n = S.inputs, base = S.gate.replace(/^n(?=and|or)/, '').replace(/^xn/, 'x');
    let acc = base === 'and' ? mask(W) : 0n;
    for (let i = 0; i < n; i++) {
      const x = i < k ? ~inp[`I${i}`] & mask(W) : inp[`I${i}`];
      acc = base === 'and' ? acc & x : base === 'xor' ? acc ^ x : acc | x;
    }
    return { O: S.gate !== base ? ~acc & mask(W) : acc };
  }
  // the select bits S0, the bus S, or S<k-1> … S0 (#301); the enable E, the outputs 0 when it is 0
  const selOf = k => { if (k === 1) return Number(inp.S0); if (p.selBus) return Number(inp.S); let v = 0; for (let j = 0; j < k; j++) v |= Number(inp[`S${j}`]) << j; return v; };
  const en = p.en ? inp.E : 1n;
  if (type === 'demux') {
    const k = +p.sel || 1, sel = selOf(k);
    const out = {};
    for (let i = 0; i < 1 << k; i++) out[`O${i}`] = en && i === sel ? inp.D : 0n;
    return out;
  }
  if (type === 'sub') {
    // (#322) the borrows, bus pins or a pin per bit
    const w = +p.width || 1, per = p.bits && w > 1;
    const op = g => { if (!per) return inp[g]; let v = 0n; for (let i = 0; i < w; i++) v |= inp[`${g}${i}`] << BigInt(i); return v; };
    const d = op('A') - op('B') - (p.bin ? inp.BI : 0n);
    const out = { BO: d < 0n ? 1n : 0n }, m = d & mask(w);
    if (per) for (let i = 0; i < w; i++) out[`D${i}`] = (m >> BigInt(i)) & 1n; else out.D = m;
    return out;
  }
  if (type === 'compare') {
    // (#319) the operands on bus pins or a pin per bit
    const w = +p.width || 1, per = p.bits && w > 1;
    const op = g => { if (!per) return inp[g]; let v = 0n; for (let i = 0; i < w; i++) v |= inp[`${g}${i}`] << BigInt(i); return v; };
    const sv = x => (p.signed && (x >> BigInt(w - 1)) & 1n ? x - (1n << BigInt(w)) : x);
    const A = sv(op('A')), B = sv(op('B'));
    return { O: { eq: A === B, ne: A !== B, lt: A < B, le: A <= B, gt: A > B, ge: A >= B }[p.op || 'eq'] ? 1n : 0n };
  }
  if (type === 'add') {
    // (#304) the operands and the sum on bus pins, or a pin per bit
    const w = +p.width || 1, per = p.bits && w > 1;
    const op = g => { if (!per) return inp[g]; let v = 0n; for (let i = 0; i < w; i++) v |= inp[`${g}${i}`] << BigInt(i); return v; };
    const sum = op('A') + op('B') + (p.cin ? inp.CI : 0n);
    const out = { CO: (sum >> BigInt(w)) & 1n };
    if (per) for (let i = 0; i < w; i++) out[`S${i}`] = (sum >> BigInt(i)) & 1n; else out.S = sum & mask(w);
    return out;
  }
  if (/^mux\d+$/.test(type)) return { O: en ? inp[`D${selOf(Math.log2(+type.slice(3)))}`] : 0n };
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
const rnd = (() => { let x = 12345; return () => { x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff; return x; }; })();
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
  assert.equal(b.length, 2 + 3 + 4 + 5 + 2 + 3 + 4 + 5 + 2 + 3 + 4 + 2 + 3 + 4 + 2 + 3 + 4 + 2 + 3 + 4);
  for (const t of ['and2b1', 'and5b5', 'or3b2', 'nand4b4', 'nor2b1', 'xor2b1', 'xor2b2']) { assert.ok(SYMBOLS[t], t); assert.equal(SYMBOLS[t].category, 'Logic'); }
  assert.equal(SYMBOLS.and2b1.title, 'AND2B1');
  // (#328: the variants are not in the palette, the basic gate's Inverted inputs make them; XOR2B1 / XOR2B2 are
  // Silinx symbols, not in the Xilinx library)
  for (const t of b) assert.equal(SYMBOLS[t].hidden, true, t);
  // (#337: XNOR too)
  assert.deepEqual(b.filter(t => SYMBOLS[t].noLib), ['xor2b1', 'xor2b2', 'xor3b1', 'xor3b2', 'xor3b3', 'xor4b1', 'xor4b2', 'xor4b3', 'xor4b4',
    'xnor2b1', 'xnor2b2', 'xnor3b1', 'xnor3b2', 'xnor3b3', 'xnor4b1', 'xnor4b2', 'xnor4b3', 'xnor4b4']);
  assert.deepEqual([gateVariant('xnor2', 1), gateVariant('xnor2', 1, 3), gateVariant('xnor4b2', 0)], ['xnor2b1', 'xnor3b1', 'xnor4']);
  // (#330: one palette entry a gate, the 2-input one named AND, OR…; its Inputs make AND3 / AND4, XOR3, XNOR4…)
  const gates = Object.keys(SYMBOLS).filter(t => SYMBOLS[t].gate && SYMBOLS[t].inputs > 1);
  assert.deepEqual(gates.filter(t => !SYMBOLS[t].hidden), ['and2', 'or2', 'nand2', 'nor2', 'xor2', 'xnor2']);
  assert.deepEqual(gates.filter(t => !SYMBOLS[t].hidden).map(t => [SYMBOLS[t].title, SYMBOLS[t].paletteTitle]).flat(), ['AND2', 'AND', 'OR2', 'OR', 'NAND2', 'NAND', 'NOR2', 'NOR', 'XOR2', 'XOR', 'XNOR2', 'XNOR']);
  for (const t of ['xor3', 'xor4', 'xnor3', 'xnor4']) assert.equal(SYMBOLS[t].title, t.toUpperCase());
  assert.deepEqual([gateVariant('and2', 0, 4), gateVariant('and3b2', 2, 4), gateVariant('nor4b3', 0, 2), gateVariant('xnor2', 0, 3), gateVariant('xor2b1', 1, 4)], ['and4', 'and4b2', 'nor2', 'xnor3', 'xor4b1']);
  assert.deepEqual([gateVariant('and2', 3, 2), gateVariant('nand2', 0, 5), gateVariant('xnor2', 3, 2)], [null, null, null]);
  assert.deepEqual([gateVariant('and3', 2), gateVariant('and3b2', 0), gateVariant('nor4b1', 4), gateVariant('xor2', 1), gateVariant('or2b2', 1)], ['and3b2', 'and3', 'nor4b4', 'xor2b1', 'or2b1']);
  assert.deepEqual([gateVariant('and2', 3), gateVariant('xnor2', 3), gateVariant('inv', 1), gateVariant('mux2', 1), gateVariant('nope', 0)], [null, null, null, null, null]);
  assert.ok(SYMBOL_CATEGORIES.includes('Decoders/Encoders'));
  assert.equal(SYMBOLS.decoder.category, 'Decoders/Encoders');
  assert.equal(SYMBOLS.encoder.category, 'Decoders/Encoders');
  assert.equal(SYMBOLS.demux.category, 'Mux');
  // (#324: one DECODER, as D2_4E; one ENCODER, as PENC4_2, #1553)
  assert.deepEqual([SYMBOLS.decoder.presets, SYMBOLS.encoder.presets], [undefined, undefined]);
  assert.deepEqual([defaultParams('decoder'), defaultParams('encoder')], [{ n: 2, en: true, bus: false }, { n: 2, mode: 'priority', bus: false }]);
  // (#313: one entry per symbol, the enable E a parameter; #334: one MUX (M2_1, its Select bits making M4_1 …
  // M16_1) and one DEMUX (its Select bits), no DEMUX1_n presets)
  assert.equal(SYMBOLS.demux.presets, undefined);
  assert.deepEqual(SYMBOLS.demux.params.map(p => p.name), ['width', 'sel', 'en', 'selBus', 'bits']);   // (Pins per bit, #2081)
  assert.deepEqual([SYMBOLS.mux2, SYMBOLS.mux4, SYMBOLS.mux8, SYMBOLS.mux16, SYMBOLS.demux].map(S => [S.paletteTitle || S.title, !!S.hidden]),
    [['MUX', false], ['M4_1', true], ['M8_1', true], ['M16_1', true], ['DEMUX', false]]);
  assert.deepEqual([1, 2, 3, 4].map(sel => symbolDef({ type: 'demux', params: { sel } }).title), ['DEMUX1_2', 'DEMUX1_4', 'DEMUX1_8', 'DEMUX1_16']);
  assert.deepEqual([SYMBOLS.mux2, SYMBOLS.mux4, SYMBOLS.mux8, SYMBOLS.mux16].map(S => [S.title, (S.presets || []).length, S.params.map(p => p.name).join(',')]),
    [['M2_1', 0, 'width,en,bits'], ['M4_1', 0, 'width,en,selBus,bits'], ['M8_1', 0, 'width,en,selBus,bits'], ['M16_1', 0, 'width,en,selBus,bits']]);
  assert.deepEqual([!!SYMBOLS.decoder.presetsOnly, !!SYMBOLS.encoder.presetsOnly, !!SYMBOLS.demux.presetsOnly], [false, false, false]);
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
  assert.deepEqual(pw({ type: 'demux', params: { sel: 2, width: 1 } }), { D: 'in1', S1: 'in1', S0: 'in1', O0: 'out1', O1: 'out1', O2: 'out1', O3: 'out1' });
  // (#301: the bus S of before, the enable E; M4_1(E))
  assert.deepEqual(pw({ type: 'demux', params: { sel: 2, width: 1, selBus: true } }), { D: 'in1', S: 'in2', O0: 'out1', O1: 'out1', O2: 'out1', O3: 'out1' });
  assert.deepEqual(pw({ type: 'demux', params: { sel: 2, width: 4, en: true } }), { D: 'in4', E: 'in1', S1: 'in1', S0: 'in1', O0: 'out4', O1: 'out4', O2: 'out4', O3: 'out4' });
  assert.deepEqual(pw({ type: 'mux4', params: { width: 1 } }), { D0: 'in1', D1: 'in1', D2: 'in1', D3: 'in1', S1: 'in1', S0: 'in1', O: 'out1' });
  assert.deepEqual(pw({ type: 'mux4', params: { width: 8, en: true } }), { D0: 'in8', D1: 'in8', D2: 'in8', D3: 'in8', E: 'in1', S1: 'in1', S0: 'in1', O: 'out8' });
  assert.deepEqual(pw({ type: 'mux2', params: { width: 1, en: true } }), { D0: 'in1', D1: 'in1', E: 'in1', S0: 'in1', O: 'out1' });
  assert.deepEqual(Object.keys(pw({ type: 'mux16', params: { en: true } })), [...Array(16).keys()].map(i => `D${i}`).concat(['E', 'S3', 'S2', 'S1', 'S0', 'O']));
  for (const t of ['mux8', 'mux16']) for (const en of [false, true]) { const d = symbolDef({ type: t, params: { en } }); assert.equal(new Set(d.pins.map(q => `${q.x},${q.y}`)).size, d.pins.length, `${t} distinct pin positions`); }
  assert.deepEqual(['M2_1', 'M2_1E', 'M4_1', 'M4_1E', 'DEMUX1_4E'], [{ type: 'mux2', params: {} }, { type: 'mux2', params: { en: true } }, { type: 'mux4', params: {} }, { type: 'mux4', params: { en: true } }, { type: 'demux', params: { sel: 2, en: true } }].map(c => symbolDef(c).title));
  assert.equal(symbolDef({ type: 'decoder', params: { n: 4 } }).title, 'D4_16E');
  assert.equal(symbolDef({ type: 'encoder', params: { n: 3, mode: 'one-hot' } }).title, 'ENC8_3');
});

// ------------------------------------------------------------------ simulation of the generated HDL
test('simulation: every inverted-input gate (exhaustive, Width 1)', () => {
  const cases = Object.keys(SYMBOLS).filter(t => /b\d$/.test(t)).map(type => ({ type, params: { width: 1 } }));
  check('bgates', cases, 32);
});

// #330: every gate of 2..5 inputs (XOR3 / XOR4 / XNOR3 / XNOR4 new: a 3-input XNOR is not (a xor b xor c)), VHDL and Verilog
test('simulation: every gate with 2..5 inputs (exhaustive, Width 1)', () => {
  const cases = Object.keys(SYMBOLS).filter(t => SYMBOLS[t].gate && SYMBOLS[t].inputs > 1 && !SYMBOLS[t].invIn).map(type => ({ type, params: { width: 1 } }));
  assert.ok(['xor3', 'xor4', 'xnor3', 'xnor4', 'and5'].every(t => cases.some(c => c.type === t)));
  check('gates', cases, 32);
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

// #1553: a new ENCODER is a priority encoder (PENC4_2), the highest index winning; one-hot still a Type; a saved
// ENCODER keeps its Type, one saved without it (from before) one-hot as it was
// (the reference: the index of the highest bit set from Math.clz32, the OR of the indexes; not the model above)
const encRef = (mode, x, m) => ({ A: mode === 'one-hot' ? [...Array(m).keys()].filter(i => (x >> i) & 1).reduce((a, i) => a | i, 0) : x ? 31 - Math.clz32(x) : 0, V: x ? 1 : 0 });
function checkEncoderExhaustive(name, params) {
  const n = params.n, m = 1 << n;
  for (const lang of ['vhdl', 'verilog']) {
    const { doc, items: [{ s, pins }] } = buildDoc(name, lang, [{ type: 'encoder', params }]);
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics.map(d => `${d.severity} ${d.message}`), [], `${name} ${lang}: no warnings`);
    const vecs = [];
    for (let x = 0; x < m; x++) {
      const inp = {}, exp = {}, r = encRef(s.params.mode, x, m);
      if (params.bus) inp[`${s.name}_I`] = [BigInt(x), m]; else for (let i = 0; i < m; i++) inp[`${s.name}_I${i}`] = [BigInt((x >> i) & 1), 1];
      if (params.bus) exp[`${s.name}_A`] = [BigInt(r.A), n]; else for (let j = 0; j < n; j++) exp[`${s.name}_A${j}`] = [BigInt((r.A >> j) & 1), 1];
      exp[`${s.name}_V`] = [BigInt(r.V), 1];
      vecs.push({ inp, exp });
    }
    assert.equal(pins.length, (params.bus ? 2 : m + n) + 1);
    const tb = testbench(lang, name, doc, vecs);
    const r = simulate([{ path: g.filename, text: g.code }, { path: lang === 'vhdl' ? 'tb.vhd' : 'tb.v', text: tb }], 'tb', { until: 1e7 });
    assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], `${lang} compile\n${g.code}`);
    const log = r.sim.log.map(l => l.text);
    assert.ok(log.includes('errs=0'), `${name} ${lang}\n${log.slice(0, 20).join('\n')}\n${g.code}`);
  }
}

test('#1553 a new ENCODER is a priority encoder: PENC4_2, the highest active input wins', () => {
  const p = defaultParams('encoder');
  assert.equal(p.mode, 'priority');
  assert.equal(SYMBOLS.encoder.params.find(q => q.name === 'mode').options.join(','), 'priority,one-hot');
  assert.equal(symbolDef({ type: 'encoder', params: p }).title, 'PENC4_2');
  assert.equal(symbolDef({ type: 'encoder', params: { ...p, mode: 'one-hot' } }).title, 'ENC4_2');
  // the reference itself: I1 and I3 at 1 give 3 (priority), 1 | 3 = 3 (one-hot); I1 and I2: 2 and 3
  assert.deepEqual([encRef('priority', 0b1010, 4), encRef('one-hot', 0b1010, 4), encRef('priority', 0b0110, 4), encRef('one-hot', 0b0110, 4), encRef('priority', 0, 4)],
    [{ A: 3, V: 1 }, { A: 3, V: 1 }, { A: 2, V: 1 }, { A: 3, V: 1 }, { A: 0, V: 0 }]);
});

test('#1553 simulation: 4- and 8-input encoders, every input pattern, priority (the default) and one-hot, bit and bus pins, VHDL and Verilog', () => {
  for (const n of [2, 3]) for (const bus of [false, true]) {
    checkEncoderExhaustive(`penc${n}${bus ? 'b' : ''}`, { ...defaultParams('encoder'), n, bus });   // (the default Type, as placed)
    checkEncoderExhaustive(`enc${n}${bus ? 'b' : ''}`, { n, mode: 'one-hot', bus });
  }
});

test('#1553 a saved ENCODER keeps its Type: one-hot and priority as saved, none (from before) one-hot', () => {
  const saved = lang => ({ ...newDoc('old', lang), symbols: [
    { id: 'S1', type: 'encoder', x: 100, y: 100, name: 'U1', params: { n: 2, mode: 'one-hot', bus: false } },
    { id: 'S2', type: 'encoder', x: 100, y: 300, name: 'U2', params: { n: 3, mode: 'priority', bus: true } },
    { id: 'S3', type: 'encoder', x: 100, y: 500, name: 'U3', params: { n: 2, bus: true } }] });
  const d = normalizeDoc(JSON.parse(JSON.stringify(saved('vhdl'))));
  assert.deepEqual(d.symbols.map(s => [s.params.mode, symbolDef(s).title]), [['one-hot', 'ENC4_2'], ['priority', 'PENC8_3'], ['one-hot', 'ENC4_2']]);
  // (normalized again, as on every reload: unchanged)
  assert.deepEqual(normalizeDoc(JSON.parse(JSON.stringify(d))).symbols.map(s => s.params), d.symbols.map(s => s.params));
  // the HDL of the one saved without a Type: the one-hot encoder's (OR of the indexes), not a chain of choices
  for (const lang of ['vhdl', 'verilog']) {
    const doc = saved(lang);
    doc.symbols = [doc.symbols[2]];
    doc.ports = [{ id: 'P1', name: 'i', dir: 'in', width: 4, x: 100, y: 500 }];
    const g = generateHdl(normalizeDoc(doc), { lang });
    const one = generateHdl(normalizeDoc({ ...doc, symbols: [{ ...doc.symbols[0], params: { n: 2, mode: 'one-hot', bus: true } }] }), { lang });
    assert.equal(g.code, one.code);
    assert.doesNotMatch(g.code, lang === 'vhdl' ? / when / : / \? /);
  }
});

test('simulation: demultiplexers 1:2 .. 1:16 with data widths 1 and 4 (exhaustive / random)', () => {
  const cases = [];
  for (const sel of [1, 2, 3, 4]) for (const width of [1, 4]) cases.push({ type: 'demux', params: { sel, width } });
  check('demuxes', cases, 64);
});

// #301: the select bits on pins of their own (or the bus S of before), the enable E
test('#301 simulation: M2_1(E), M4_1(E) and DEMUX1_2 .. 1_8(E), the select bits as pins or as the bus S, widths 1 and 4', () => {
  const cases = [];
  for (const type of ['mux2', 'mux4', 'mux8', 'mux16']) for (const en of [false, true]) for (const selBus of [false, true]) for (const width of [1, 4]) {
    if (type === 'mux2' && selBus) continue;
    cases.push({ type, params: { width, en, selBus } });
  }
  check('muxes301', cases, 64);
  const dm = [];
  for (const sel of [1, 2, 3, 4]) for (const en of [false, true]) for (const selBus of [false, true]) for (const width of [1, 4]) {
    if (sel === 1 && selBus) continue;
    dm.push({ type: 'demux', params: { sel, width, en, selBus } });
  }
  check('demuxes301', dm, 64);
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

// ------------------------------------------------------------------ flip-flops FD* / FT* / FJK*
test('flip-flop library: Xilinx names, pins, INIT defaults', () => {
  const ffs = Object.keys(SYMBOLS).filter(t => SYMBOLS[t].ff);
  for (const t of ['fd', 'fdc', 'fdce', 'fdcp', 'fdcpe', 'fde', 'fdp', 'fdpe', 'fdr', 'fdre', 'fdrs', 'fdrse', 'fds', 'fdse',
    'ft', 'ftc', 'ftce', 'ftcp', 'ftcpe', 'ftp', 'ftpe', 'ftrse', 'ftsre', 'fjk', 'fjkc', 'fjkce', 'fjkcp', 'fjkcpe', 'fjkp', 'fjkpe', 'fjkrse', 'fjksre']) {
    assert.ok(ffs.includes(t), t);
    assert.equal(SYMBOLS[t].category, 'Flip-Flops');
  }
  const pins = t => symbolDef({ type: t, params: {} }).pins.map(p => p.name).sort().join(',');
  assert.equal(pins('fdrse'), 'C,CE,D,Q,R,S');
  assert.equal(pins('fdcpe'), 'C,CE,CLR,D,PRE,Q');
  assert.equal(pins('ftce'), 'C,CE,CLR,Q,T');
  assert.equal(pins('ftrse'), 'C,CE,Q,R,S,T');
  assert.equal(pins('fjkc'), 'C,CLR,J,K,Q');
  assert.equal(pins('fjkpe'), 'C,CE,J,K,PRE,Q');
  assert.equal(pins('fjk'), 'C,J,K,Q');
  const init = t => SYMBOLS[t].params.find(p => p.name === 'init').default;
  for (const t of ['fdp', 'fdpe', 'fds', 'fdse', 'ftp', 'ftpe', 'ftsre', 'fjkp', 'fjkpe', 'fjksre']) assert.equal(init(t), '1', t);
  for (const t of ['fd', 'fdc', 'fdcp', 'fdcpe', 'fdr', 'fdrs', 'fdrse', 'ftc', 'ftrse', 'fjkc', 'fjkcpe', 'fjkrse']) assert.equal(init(t), '0', t);
  // clock pin drawn with the clock triangle; existing FD geometry unchanged (D and Q on the first row)
  const fd = symbolDef({ type: 'fdce', params: {} });
  assert.deepEqual(fd.pins.map(p => `${p.name}@${p.y}`), ['D@10', 'CE@30', 'C@50', 'CLR@70', 'Q@10']);
  assert.ok(fd.pins.find(p => p.name === 'C').clock);
});

function ffModel(f, q, inp, edge) {
  if (f.clr && inp.CLR) return 0;
  if (f.pre && inp.PRE) return 1;
  if (!edge) return q;
  const sync = (f.sp ? [['S', 1], ['R', 0]] : [['R', 0], ['S', 1]]).filter(([p]) => (p === 'R' ? f.r : f.s));
  for (const [p, v] of sync) if (inp[p]) return v;
  if (f.ce && !inp.CE) return q;
  if (f.k === 'd') return inp.D;
  if (f.k === 't') return q ^ inp.T;
  return inp.J && !q ? 1 : inp.K && q ? 0 : q;
}

test('simulation: every FD* / FT* / FJK* flip-flop (VHDL and Verilog) follows the Xilinx priorities and INIT', () => {
  const types = Object.keys(SYMBOLS).filter(t => SYMBOLS[t].ff);
  // every type with its default INIT, a few with the other INIT value
  const cases = [...types.map(t => [t, SYMBOLS[t].params[0].default]), ['fd', '1'], ['ftce', '1'], ['fjkrse', '1'], ['fdpe', '0']];
  for (const lang of ['vhdl', 'verilog']) {
    const doc = newDoc('ffs', lang);
    const items = [];
    cases.forEach(([type, init], k) => {
      const s = { id: `S${k + 1}`, type, x: 200 + (k % 6) * 200, y: 60 + Math.floor(k / 6) * 200, rot: 0, mirror: false, name: `U${k + 1}`, params: { init } };
      doc.symbols.push(s);
      const pins = symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0]);
      for (const q of pins) doc.ports.push({ id: `P${doc.ports.length + 1}`, name: `${s.name}_${q.name}`, dir: q.dir === 'out' ? 'out' : 'in', width: 1, x: q.x, y: q.y });
      items.push({ s, f: SYMBOLS[type].ff, ins: pins.filter(q => q.dir === 'in' && q.name !== 'C').map(q => q.name), q: +init });
    });
    assert.deepEqual(netlist(doc).diagnostics.filter(d => d.severity === 'error'), []);
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics.filter(d => d.severity === 'error').map(d => d.message), [], g.code);
    // stimulus: 60 cycles; async inputs rarely active, never released while the other async input stays active
    let seed = 7;
    const rb = p => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff < p ? 1 : 0; };
    const vh = lang === 'vhdl';
    const set = (n, v) => (vh ? `    ${n} <= '${v}';` : `    ${n} = 1'b${v};`);
    const chk = (n, v, tag) => (vh ? `    if ${n} /= '${v}' then errs := errs + 1; report "${tag} ${n}" severity warning; end if;` : `    if (${n} !== 1'b${v}) begin errs = errs + 1; $display("${tag} ${n}"); end`);
    const L = [];
    const cur = items.map(() => ({}));
    for (let step = 0; step < 60; step++) {
      items.forEach((it, k) => {
        const prev = cur[k], inp = {};
        for (const p of it.ins) {
          const pr = p === 'CLR' || p === 'PRE' ? 0.12 : p === 'R' || p === 'S' ? 0.2 : p === 'CE' ? 0.7 : 0.5;
          inp[p] = step < 2 && (p === 'CLR' || p === 'PRE') ? 0 : rb(pr);
        }
        if (it.f.clr && it.f.pre && prev.CLR && !inp.CLR) inp.PRE = 0;
        if (it.f.clr && it.f.pre && prev.PRE && !inp.PRE) inp.CLR = 0;
        cur[k] = inp;
        for (const p of it.ins) L.push(set(`${it.s.name}_${p}`, inp[p]));
      });
      L.push(vh ? '    wait for 2 ns;' : '    #2;');
      items.forEach((it, k) => { it.q = ffModel(it.f, it.q, cur[k], false); L.push(chk(`${it.s.name}_Q`, it.q, `s${step}a`)); });
      for (const it of items) L.push(set(`${it.s.name}_C`, 1));
      L.push(vh ? '    wait for 2 ns;' : '    #2;');
      items.forEach((it, k) => { it.q = ffModel(it.f, it.q, cur[k], true); L.push(chk(`${it.s.name}_Q`, it.q, `s${step}b`)); });
      for (const it of items) L.push(set(`${it.s.name}_C`, 0));
      L.push(vh ? '    wait for 2 ns;' : '    #2;');
    }
    // initial values (before any input changes Q): first sample uses INIT, checked through the model above
    const ports = doc.ports;
    const tb = vh ? ['library ieee; use ieee.std_logic_1164.all;', 'entity tb is end;', 'architecture s of tb is',
      ...ports.map(p => `  signal ${p.name} : std_logic${p.dir === 'in' ? " := '0'" : ''};`),
      'begin', `  dut : entity work.ffs port map (${ports.map(p => `${p.name} => ${p.name}`).join(', ')});`,
      '  process', '    variable errs : integer := 0;', '  begin', ...L, '    report "errs=" & integer\'image(errs);', '    wait;', '  end process;', 'end;'].join('\n')
      : ['`timescale 1ns/1ps', 'module tb;', '  integer errs = 0;', ...ports.map(p => `  ${p.dir === 'in' ? 'reg' : 'wire'} ${p.name}${p.dir === 'in' ? ' = 0' : ''};`),
        `  ffs dut (${ports.map(p => `.${p.name}(${p.name})`).join(', ')});`, '  initial begin', ...L, '    $display("errs=%0d", errs);', '  end', 'endmodule'].join('\n');
    const r = simulate([{ path: g.filename, text: g.code }, { path: vh ? 'tb.vhd' : 'tb.v', text: tb }], 'tb', { until: 1e7 });
    assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], `${lang}\n${g.code}`);
    const log = r.sim.log.map(l => l.text);
    assert.ok(log.includes('errs=0'), `${lang}\n${log.slice(0, 30).join('\n')}`);
    for (const it of items) it.q = +it.s.params.init;   // reset the models for the other language
  }
});

// ---- 1-bit arithmetic: a 1-bit operand is a std_logic in VHDL (regression: unsigned(std_logic))
test('1-bit add / sub / compare generate valid VHDL and Verilog with the right function', () => {
  const sym = (type, params) => ({ id: 'U', type, x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: { ...defaultParams(type), width: 1, ...params } });
  const cases = [
    ['add', {}, ['A', 'B'], ['S'], (a, b) => [(a + b) & 1]],
    ['add', { cin: true, cout: true }, ['A', 'B', 'CI'], ['S', 'CO'], (a, b, c) => [(a + b + c) & 1, (a + b + c) >> 1]],
    ['sub', {}, ['A', 'B'], ['D'], (a, b) => [(a - b) & 1]],
    ['compare', { op: 'lt' }, ['A', 'B'], ['O'], (a, b) => [a < b ? 1 : 0]],
  ];
  for (const [type, params, ins, outs, f] of cases) {
    const s = sym(type, params);
    const doc = normalizeDoc({ name: 'dut', lang: 'vhdl', symbols: [s], wires: [], labels: [], ports: [] });
    // one I/O marker on every pin
    for (const p of symbolPins(doc.symbols[0], {})) doc.ports.push({ id: `P_${p.name}`, name: p.name.toLowerCase(), dir: p.dir === 'out' ? 'out' : 'in', width: 1, x: p.x, y: p.y });
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateHdl(normalizeDoc(doc), { lang });
      const n = ins.length;
      const tb = `module tb; reg [${n - 1}:0] v; ${outs.map(o => `wire ${o.toLowerCase()};`).join(' ')}
        dut u(${[...ins.map((x, i) => `.${x.toLowerCase()}(v[${i}])`), ...outs.map(o => `.${o.toLowerCase()}(${o.toLowerCase()})`)].join(', ')});
        integer i; initial begin for (i = 0; i < ${1 << n}; i = i + 1) begin v = i; #1 $display("%0d ${outs.map(() => '%b').join(' ')}", i, ${outs.map(o => o.toLowerCase()).join(', ')}); end end endmodule`;
      const r = simulate([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', text: g.code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e6 });
      assert.deepEqual(r.errors, [], `${type}/${lang}: ${JSON.stringify(r.errors)}\n${g.code}`);
      const lines = r.sim.log.map(l => String(l.text).trim()).filter(t => /^\d+ /.test(t));
      for (const line of lines) {
        const [i, ...got] = line.split(' ').map(Number);
        const bits = ins.map((_, k) => (i >> k) & 1);
        assert.deepEqual(got, f(...bits), `${type}${JSON.stringify(params)}/${lang} inputs ${bits}`);
      }
      assert.equal(lines.length, 1 << n);
    }
  }
});

// #304: adders of two 1-, 2- and 4-bit numbers, a pin per bit (ADD1 the full adder, ADD2, ADD4 as the Xilinx
// ADD4), against the bus adder's function; their pins and presets
test('#304 adders with a pin per bit: ADD1 (full adder), ADD2, ADD4, with and without the carries; pins and presets', () => {
  const S = SYMBOLS.add;
  assert.equal(S.presets, undefined, 'ADD only: its options make ADD1 / ADD2 / ADD4 (#317)');
  const pw = c => symbolDef(c).pins.map(p => `${p.name}:${p.dir}${p.width}`);
  assert.deepEqual(pw({ type: 'add', params: { width: 1, cin: true, cout: true } }), ['A:in1', 'B:in1', 'CI:in1', 'S:out1', 'CO:out1']);
  assert.deepEqual(pw({ type: 'add', params: { width: 4, cin: true, cout: true, bits: true } }),
    ['A0:in1', 'A1:in1', 'A2:in1', 'A3:in1', 'B0:in1', 'B1:in1', 'B2:in1', 'B3:in1', 'CI:in1', 'S0:out1', 'S1:out1', 'S2:out1', 'S3:out1', 'CO:out1']);
  assert.deepEqual([symbolDef({ type: 'add', params: { width: 4, bits: true } }).title, symbolDef({ type: 'add', params: { width: 2, bits: true } }).title], ['ADD4', 'ADD2']);
  const d4 = symbolDef({ type: 'add', params: { width: 4, cin: true, cout: true, bits: true } });
  assert.equal(new Set(d4.pins.map(q => `${q.x},${q.y}`)).size, d4.pins.length, 'distinct pin positions');
  const cases = [];
  for (const width of [1, 2, 4]) for (const carries of [true, false]) cases.push({ type: 'add', params: { width, cin: carries, cout: carries, bits: width > 1 } });
  cases.push({ type: 'add', params: { width: 4, cin: true, cout: true } });   // the bus adder, the reference
  check('adders304', cases, 64);
});

// #315: the palette's flip-flops are FD, FT and FJK; a variant is one of them with its inputs, as the Xilinx
// library has them; REG no longer in the palette
test('#315 flip-flops: FD / FT / FJK in the palette, the variant of a choice of inputs (or none), REG hidden', async () => {
  const { ffVariant, FF_INPUTS } = await import('../core/schdoc.js');
  assert.deepEqual(Object.entries(SYMBOLS).filter(([, S]) => S.category === 'Flip-Flops' && !S.hidden).map(([t]) => t), ['fd', 'ft', 'fjk']);
  assert.equal(SYMBOLS.register.hidden, true);
  assert.deepEqual(FF_INPUTS.map(([q]) => q), ['ce', 'clr', 'pre', 'r', 's']);
  const v = (t, f) => ffVariant(t, f);
  assert.deepEqual([v('fd', {}), v('fd', { ce: true }), v('fd', { ce: true, clr: true }), v('fd', { clr: true, pre: true, ce: true }), v('fd', { r: true }), v('fd', { r: true, s: true, ce: true })],
    ['fd', 'fde', 'fdce', 'fdcpe', 'fdr', 'fdrse']);
  assert.deepEqual([v('fd', { clr: true, r: true }), v('ft', { r: true }), v('ft', { ce: true, r: true, s: true }), v('fjk', { ce: true, clr: true }), v('fdce', {})], [null, null, 'ftrse', 'fjkce', 'fd']);
  assert.equal(v('and2', {}), null);
});

// #319: the comparator with a pin per bit (A0.., B0..), every relation, unsigned and signed, against the bus one
test('#319 comparators with a pin per bit: every relation, unsigned and signed; pins', () => {
  const pw = c => symbolDef(c).pins.map(p => `${p.name}:${p.dir}${p.width}`);
  assert.deepEqual(pw({ type: 'compare', params: { width: 3, op: 'lt', bits: true } }), ['A0:in1', 'A1:in1', 'A2:in1', 'B0:in1', 'B1:in1', 'B2:in1', 'O:out1']);
  assert.equal(symbolDef({ type: 'compare', params: { width: 4, op: 'ge', bits: true } }).title, 'COMP4 ≥');
  const cases = [];
  for (const op of ['eq', 'ne', 'lt', 'le', 'gt', 'ge']) for (const signed of [false, true]) cases.push({ type: 'compare', params: { width: 3, op, signed, bits: true } });
  cases.push({ type: 'compare', params: { width: 3, op: 'lt', signed: true } });
  check('comps319', cases, 64);
});

// #319: the counter with a pin per bit (Q0..), counting up and down, its clock enable and reset
test('#319 counters with a pin per bit: Q0..Q3 count as the bus Q; pins; VHDL and Verilog', () => {
  const pw = c => symbolDef(c).pins.map(p => p.name);
  assert.deepEqual(pw({ type: 'counter', params: { width: 4, en: true, reset: 'async', bits: true } }), ['CE', 'C', 'CLR', 'Q0', 'Q1', 'Q2', 'Q3']);
  for (const lang of ['vhdl', 'verilog']) for (const dir of ['up', 'down']) {
    const doc = newDoc('cnt', lang);
    const c = { id: 'S1', type: 'counter', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 4, en: false, reset: 'sync', dir, bits: true } };
    doc.symbols.push(c);
    for (const q of symbolPins(normalizeDoc({ ...doc, symbols: [c] }).symbols[0])) doc.ports.push({ id: `P${doc.ports.length + 1}`, name: q.name.toLowerCase(), dir: q.dir === 'out' ? 'out' : 'in', width: 1, x: q.x, y: q.y });
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics.filter(d => d.severity === 'error'), [], g.code);
    const tb = lang === 'vhdl'
      ? `library ieee; use ieee.std_logic_1164.all;\nentity tb is end;\narchitecture s of tb is\n  signal c, r, q0, q1, q2, q3 : std_logic := '0';\nbegin\n  dut : entity work.cnt port map (c => c, r => r, q0 => q0, q1 => q1, q2 => q2, q3 => q3);\n  process begin\n    r <= '1'; c <= '1'; wait for 5 ns; c <= '0'; wait for 5 ns; r <= '0';\n    for i in 1 to 5 loop c <= '1'; wait for 5 ns; c <= '0'; wait for 5 ns; end loop;\n    report "q=" & std_logic'image(q3) & std_logic'image(q2) & std_logic'image(q1) & std_logic'image(q0);\n    wait;\n  end process;\nend;`
      : "module tb; reg c = 0, r = 0; wire q0, q1, q2, q3; integer i;\n  cnt dut (.c(c), .r(r), .q0(q0), .q1(q1), .q2(q2), .q3(q3));\n  initial begin r = 1; c = 1; #5 c = 0; #5 r = 0; for (i = 0; i < 5; i = i + 1) begin c = 1; #5 c = 0; #5; end $display(\"q=%b%b%b%b\", q3, q2, q1, q0); end\nendmodule";
    const r = simulate([{ path: g.filename, text: g.code }, { path: lang === 'vhdl' ? 'tb.vhd' : 'tb.v', text: tb }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors.map(e => e.message), [], g.code);
    const want = dir === 'up' ? '0101' : '1011';
    assert.ok(r.sim.log.some(l => l.text.replace(/'/g, '').includes(`q=${want}`)), `${lang} ${dir}: ${r.sim.log.map(l => l.text).join(' | ')}\n${g.code}`);
  }
});

// #322: the subtractor's borrows (BI, BO) and its pins per bit, against D = A - B - BI, BO = A < B + BI
test('#322 subtractors: borrow in / out, a pin per bit; pins', () => {
  const pw = c => symbolDef(c).pins.map(p => p.name);
  assert.deepEqual(pw({ type: 'sub', params: { width: 4, bin: true, bout: true } }), ['A', 'B', 'BI', 'D', 'BO']);
  assert.deepEqual(pw({ type: 'sub', params: { width: 2, bin: true, bout: true, bits: true } }), ['A0', 'A1', 'B0', 'B1', 'BI', 'D0', 'D1', 'BO']);
  assert.equal(symbolDef({ type: 'sub', params: { width: 4, bits: true } }).title, 'SUB4');
  const cases = [];
  for (const width of [1, 2, 4]) for (const br of [false, true]) cases.push({ type: 'sub', params: { width, bin: br, bout: br, bits: width > 1 } });
  cases.push({ type: 'sub', params: { width: 4, bin: true, bout: true } }, { type: 'sub', params: { width: 1, bin: true, bout: true } }, { type: 'sub', params: { width: 4, bout: true } });
  check('subs322', cases, 64);
});

// #681: the type drawn on the adder, subtractor, comparator, register and counter carries their width (as the
// Xilinx ADD8 / COMP4 / CB8CE), their bus pins Width bits; the other symbols keep their library title
test('#681 symbols with a width in their name: ADD8, SUB16, COMP4, CNT8, REG8; bus pins of Width bits', () => {
  const name = (type, params) => symbolTypeName({ type, params });
  for (const w of [1, 2, 4, 8, 16, 32]) {
    assert.equal(name('add', { width: w }), `ADD${w}`);
    assert.equal(name('sub', { width: w, bin: true }), `SUB${w}`);
    assert.equal(name('compare', { width: w, op: 'lt' }), `COMP${w}`);
    assert.equal(name('counter', { width: w }), `CNT${w}`);
    assert.equal(name('register', { width: w }), `REG${w}`);
    const pins = t => Object.fromEntries(symbolDef({ type: t, params: { width: w } }).pins.map(p => [p.name, p.width]));
    assert.deepEqual(pins('add'), { A: w, B: w, S: w });
    assert.deepEqual(pins('sub'), { A: w, B: w, D: w });
    assert.deepEqual(pins('compare'), { A: w, B: w, O: 1 });
  }
  // the default width (8) when none is given, a text width read as a number, a bad one as 1
  assert.equal(name('add', {}), 'ADD8');
  assert.equal(symbolTypeName({ type: 'compare' }), 'COMP8');
  assert.equal(name('add', { width: '12' }), 'ADD12');
  assert.equal(name('add', { width: 'x' }), 'ADD1');
  assert.equal(name('add', { width: 0 }), 'ADD1');
  // a pin per bit: the same name as the box's title (#304, #319)
  assert.equal(name('add', { width: 4, bits: true }), symbolDef({ type: 'add', params: { width: 4, bits: true } }).title);
  // the gates and flip-flops: their title only (their width inside the gate / on the bus pins)
  assert.equal(name('and2', { width: 8 }), 'AND2');
  assert.equal(name('fdce', { width: 8 }), 'FDCE');
  assert.equal(name('inv', { width: 4 }), 'INV');
  assert.equal(name('nosuch', {}), 'NOSUCH');
});

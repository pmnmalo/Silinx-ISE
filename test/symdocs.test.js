// core/symdocs.js + core/symtables.js: Symbol Info datasheets of the schematic symbol library —
// docs for every symbol and preset in English and Portuguese, pin tables from the real pin
// definitions, truth tables computed by simulating the HDL of each symbol (checked against
// reference functions and the Xilinx Libraries Guide tables), flip-flop / register / counter mode
// tables checked against the simulated behaviour, equivalent HDL that compiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYMBOLS, defaultParams, symbolDef, symbolPins } from '../core/schdoc.js';
import { compile, elaborate } from '../core/compile.js';
import {
  docKeys, symbolDoc, symbolSummary, presetOf, modeTable, modeQText, xilinxEquivalents, XILINX_SYMBOLS,
  UI_TEXTS, T, PARAM_LABELS_PT, symbolHdl, oneSymbolDoc, firstSentence,
} from '../core/symdocs.js';
import { truthTable, compactRows, symbolSim } from '../core/symtables.js';
import * as V from '../core/values.js';

const MODULES = { half: { name: 'half', lang: 'vhdl', ports: [{ name: 'x', dir: 'in', width: 1 }, { name: 'y', dir: 'in', width: 1 }, { name: 's', dir: 'out', width: 1 }, { name: 'c', dir: 'out', width: 4 }] } };
const paramsFor = k => (k.type === 'module' ? { ...k.params, module: 'half' } : k.params);

// ------------------------------------------------------------------ coverage
test('every symbol type and preset of the palette has a datasheet in English and Portuguese', () => {
  const keys = docKeys();
  const types = new Set(keys.map(k => k.type));
  for (const t of Object.keys(SYMBOLS)) assert.ok(types.has(t), `${t} documented`);
  for (const [t, S] of Object.entries(SYMBOLS)) for (const p of S.presets || []) assert.ok(keys.some(k => k.type === t && k.preset === p.title), `${p.title} documented`);
  assert.ok(keys.length >= 120, `${keys.length} entries`);
  for (const k of keys) {
    const params = paramsFor(k);
    const en = symbolDoc(k.type, params, { modules: MODULES, preset: k.preset, withHdl: false });
    const pt = symbolDoc(k.type, params, { lang: 'pt', modules: MODULES, preset: k.preset, withHdl: false });
    const what = `${k.type}${k.preset ? ` (${k.preset})` : ''}`;
    assert.equal(en.preset, k.preset ?? presetOf(k.type, params), `${what}: preset recognised`);
    for (const d of [en, pt]) {
      assert.ok(d.text.length >= 1 && d.text.every(x => typeof x === 'string' && x.length > 20), `${what} ${d.lang}: description`);
      assert.ok(d.text[0].length > 80 || k.type === 'module', `${what} ${d.lang}: a real paragraph (${d.text[0]})`);
      assert.ok(d.summary && d.text[0].startsWith(d.summary), `${what} ${d.lang}: summary is the first sentence`);
      for (const p of d.pins) assert.ok(p.func && p.func.length > 3, `${what} ${d.lang}: function of pin ${p.name}`);
      for (const p of d.params) { assert.ok(p.meaning && p.meaning.length > 5, `${what} ${d.lang}: meaning of ${p.name}`); assert.ok(p.label, `${what}: label of ${p.name}`); }
      assert.ok(!/undefined|NaN|\[object/.test(JSON.stringify({ t: d.text, f: d.formula, p: d.pins, q: d.params })), `${what} ${d.lang}: no undefined text`);
    }
    assert.notEqual(en.text[0], pt.text[0], `${what}: Portuguese description differs from the English one`);
    for (let i = 0; i < en.pins.length; i++) if (!/^[A-Z0-9 ()]+$/.test(en.pins[i].func)) assert.notEqual(en.pins[i].func, pt.pins[i].func, `${what}: PT function of pin ${en.pins[i].name}`);
    for (let i = 0; i < en.params.length; i++) assert.notEqual(en.params[i].meaning, pt.params[i].meaning, `${what}: PT meaning of ${en.params[i].name}`);
    assert.equal(symbolSummary(k.type, params, 'pt', k.preset), pt.summary);
    // Portuguese technical vocabulary
    if (k.type === 'mux4') assert.match(pt.text.join(' '), /multiplexador/);
    if (k.type === 'decoder') assert.match(pt.text.join(' '), /descodificador/i);
    if (k.type === 'encoder') assert.match(pt.text.join(' '), /codificador/i);
    if (k.type === 'add') assert.match(pt.text.join(' '), /somador/);
    if (k.type === 'compare') assert.match(pt.text.join(' '), /compara/);
    if (SYMBOLS[k.type].ff) assert.match(pt.text.join(' '), /báscula \(flip-flop\)/);
    if (k.type === 'register') assert.match(pt.text.join(' '), /registo/);
    if (k.type === 'counter') assert.match(pt.text.join(' '), /contador/);
  }
});

test('pin tables are the real pins of the symbol at the shown parameters', () => {
  const cases = [...docKeys().map(k => [k.type, paramsFor(k)]),
    ['mux4', { width: 8 }], ['decoder', { n: 3, en: false, bus: true }], ['encoder', { n: 4, bus: true }], ['add', { width: 16, cin: true, cout: true }],
    ['register', { width: 4, en: false, reset: 'sync' }], ['counter', { width: 3, en: true, reset: 'none' }], ['busjoin', { widths: '3,1,4' }], ['slice', { msb: 7, lsb: 4 }],
    ['hdlblock', { inputs: [{ name: 'clk', width: 1, clock: true }, { name: 'd', width: 8 }], outputs: [{ name: 'q', width: 8 }] }]];
  for (const [type, params] of cases) {
    const d = symbolDoc(type, params, { modules: MODULES, withHdl: false });
    const sym = { id: 'S1', type, x: 100, y: 100, rot: 90, mirror: false, name: 'U1', params: { ...defaultParams(type), ...params } };
    const real = symbolPins(sym, MODULES);
    assert.deepEqual(d.pins.map(p => [p.name, p.dir, p.width]), real.map(p => [p.name, p.dir, p.width ?? null]), `${type} ${JSON.stringify(params)}`);
    assert.deepEqual(d.pins.map(p => p.name), symbolDef(sym, MODULES).pins.map(p => p.name));
    for (const p of d.pins) assert.equal(p.widthText, p.width == null ? p.widthText : String(p.width));
  }
  // the pin table follows the parameters
  assert.deepEqual(symbolDoc('decoder', { n: 3 }).pins.map(p => p.name), ['A0', 'A1', 'A2', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
  assert.deepEqual(symbolDoc('mux4', { width: 8 }).pins.map(p => `${p.name}:${p.width}`), ['D0:8', 'D1:8', 'D2:8', 'D3:8', 'S:2', 'O:8']);
  assert.deepEqual(symbolDoc('fdcpe').pins.map(p => p.name), ['PRE', 'D', 'CE', 'C', 'CLR', 'Q']);
  assert.equal(symbolDoc('vcc').pins[0].widthText, 'net');
  assert.equal(symbolDoc('vcc', {}, { lang: 'pt' }).pins[0].widthText, 'da rede');
  assert.equal(symbolDoc('slice', { msb: 7, lsb: 4 }).pins[0].widthText, '≥ 8');
});

test('parameter tables: every parameter with its label, value, default and meaning', () => {
  const d = symbolDoc('compare', { width: 4, op: 'lt', signed: true }, { lang: 'pt' });
  assert.deepEqual(d.params.map(p => [p.name, p.label, p.value, p.default]), [['width', 'Largura', 4, 8], ['op', 'Operação', 'lt', 'eq'], ['signed', 'Com sinal', true, false]]);
  for (const S of Object.values(SYMBOLS)) for (const p of S.params || []) assert.ok(PARAM_LABELS_PT[p.label], `PT label of '${p.label}'`);
  assert.equal(symbolDoc('fds').params[0].default, '1', 'Xilinx INIT default of FDS is 1');
  assert.match(symbolDoc('fdce').params[0].meaning, /power-up/);
});

test('datasheet UI texts have Portuguese translations', () => {
  for (const [k, v] of Object.entries(UI_TEXTS)) { assert.ok(v && v !== k || /^(Flip-Flops)$/.test(k), `PT of '${k}'`); assert.equal(T(k, 'pt'), v); assert.equal(T(k, 'en'), k); }
  assert.equal(T('Truth table', 'pt'), 'Tabela de verdade');
  assert.equal(firstSentence('The 4:1 multiplexer selects. More text here.'), 'The 4:1 multiplexer selects.');
});

test('presets: parameters -> Xilinx-style preset names', () => {
  assert.equal(presetOf('decoder', { n: 3 }), 'D3_8E');
  assert.equal(presetOf('decoder', { n: 3, bus: true }), 'D3_8E');
  assert.equal(presetOf('decoder', { n: 3, en: false }), null);
  assert.equal(presetOf('decoder', { n: 5 }), null);
  assert.equal(presetOf('encoder', { n: 3, mode: 'one-hot' }), 'ENC8_3');
  assert.equal(presetOf('encoder', { n: 4 }), 'PENC16_4');
  assert.equal(presetOf('demux', { sel: 2, width: 8 }), 'DEMUX1_4');
  assert.equal(presetOf('mux4', {}), null);
  assert.equal(symbolDoc('decoder', { n: 4 }).title, 'D4_16E');
  assert.equal(symbolDoc('decoder', { n: 4, en: false }).title, 'D4_16');
  assert.equal(symbolDoc('fdce').title, 'FDCE');
});

test('Xilinx library symbols imported from ISE schematics share the docs of their native symbols', () => {
  for (const [name, x] of Object.entries(XILINX_SYMBOLS)) {
    assert.ok(SYMBOLS[x.type], `${name} -> ${x.type}`);
    const d = symbolDoc(x.type, x.params, { withHdl: false });
    assert.ok(d.xilinx.includes(name), `${name} listed in the datasheet of ${x.type} ${JSON.stringify(x.params)}: ${d.xilinx}`);
  }
  for (const n of ['AND2', 'AND3B2', 'NOR4B4', 'XNOR2', 'INV', 'BUF', 'IBUF', 'OBUF', 'BUFG', 'INV8', 'M2_1', 'D2_4E', 'D3_8E', 'D4_16E', 'FD', 'FDCE', 'FDRSE', 'FTCE', 'FJKCPE', 'FD8CE', 'FD16RE', 'CB8CE', 'CB16RE', 'COMP8', 'COMPM16', 'ADD8', 'ADD16', 'VCC', 'GND'])
    assert.ok(XILINX_SYMBOLS[n], `${n} mapped`);
  assert.ok(!XILINX_SYMBOLS.FT && !XILINX_SYMBOLS.FJK, 'plain FT / FJK are not Xilinx symbols');
  assert.deepEqual(xilinxEquivalents('decoder', { n: 2 }), ['D2_4E']);
  assert.deepEqual(xilinxEquivalents('compare', { width: 8, op: 'lt' }), ['COMPM8']);
  assert.deepEqual(xilinxEquivalents('add', { width: 8 }), []);
  assert.ok(xilinxEquivalents('buf', { width: 1 }).includes('BUFG'));
  assert.deepEqual(xilinxEquivalents('register', { width: 16, en: true, reset: 'sync', init: '0' }), ['FD16RE']);
});

// ------------------------------------------------------------------ equivalent HDL
test('the equivalent HDL of every symbol compiles (VHDL and Verilog) and is named after the symbol', () => {
  for (const k of docKeys()) {
    if (k.type === 'module' || k.type === 'hdlblock') continue;
    const hdl = symbolHdl(k.type, k.params);
    const { doc } = oneSymbolDoc(k.type, k.params);
    for (const lang of ['vhdl', 'verilog']) {
      const code = hdl[lang];
      assert.match(code, lang === 'vhdl' ? new RegExp(`entity ${doc.name} is`) : new RegExp(`module ${doc.name}\\b`), `${k.type} ${lang}`);
      assert.match(code.split('\n')[0], /Symbol Info/);
      const lib = compile([{ path: `t.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: code, lang }]);
      const design = elaborate(lib, doc.name);
      const errs = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
      assert.deepEqual(errs.map(e => e.message), [], `${k.type}${k.preset ? ` ${k.preset}` : ''} ${lang}:\n${code}`);
    }
  }
  assert.match(symbolHdl('fdce').vhdl, /if CLR = '1' then[\s\S]*elsif rising_edge\(C\) then[\s\S]*if CE = '1' then/);
  assert.match(symbolHdl('mux4').verilog, /module M4_1/);
  assert.match(symbolHdl('constant', { value: '5', width: 4 }).vhdl, /entity CONSTANT_sym is/);
  // a module symbol: an instance of the module
  const m = symbolDoc('module', { module: 'half' }, { modules: MODULES });
  assert.match(m.hdl.vhdl, /entity work\.half/);
});

// ------------------------------------------------------------------ truth tables
const tbl = (type, params, opts) => { const t = truthTable(type, params, opts); assert.equal(t.kind, 'exhaustive', `${type}: ${t.error || t.kind}`); return t; };
// value of a column group in a row ('in' bit string) -> { pin: number }
function decode(cols, bits) {
  const v = {};
  cols.forEach((c, j) => { v[c.pin] ??= 0; if (bits[j] === '1') v[c.pin] |= 1 << c.bit; });
  return v;
}
function checkAgainst(t, ref, what) {
  assert.equal(t.rows.length, 2 ** t.inCols.length, `${what}: every combination`);
  for (const r of t.rows) {
    const exp = ref(decode(t.inCols, r.in));
    const got = decode(t.outCols, r.out);
    for (const [pin, val] of Object.entries(exp)) assert.equal(got[pin], val, `${what}: ${t.inCols.map(c => c.label).join(' ')} = ${r.in} -> ${pin}`);
  }
  // the compact table is the same function: every row matches the compact rows with its output only
  const covers = (c, m) => [...c].every((x, i) => x === 'X' || x === m[i]);
  for (const r of t.rows) {
    const m = t.compact.filter(c => covers(c.in, r.in));
    assert.ok(m.length >= 1, `${what}: row ${r.in} in the compact table`);
    for (const c of m) assert.equal(c.out, r.out, `${what}: compact row ${c.in}`);
  }
}

test('gates and inverted-input gates (ANDnBk …): truth tables computed by simulation', () => {
  const OPS = { and: a => a.every(Boolean), or: a => a.some(Boolean), xor: a => a.filter(Boolean).length % 2 === 1 };
  for (const [type, S] of Object.entries(SYMBOLS)) {
    if (!S.gate || S.inputs < 2) continue;
    const t = tbl(type, { width: 1 });
    assert.deepEqual(t.inCols.map(c => c.label), Array.from({ length: S.inputs }, (_, i) => `I${i}`));
    const base = S.gate.replace(/^n(?=and|or)/, '').replace(/^xn/, 'x');
    const neg = S.gate !== base;
    checkAgainst(t, v => {
      const ins = Array.from({ length: S.inputs }, (_, i) => (i < (S.invIn || 0) ? !v[`I${i}`] : !!v[`I${i}`]));
      return { O: (OPS[base](ins) !== neg) ? 1 : 0 };
    }, type);
  }
  checkAgainst(tbl('inv', {}), v => ({ O: v.I ? 0 : 1 }), 'inv');
  checkAgainst(tbl('buf', {}), v => ({ O: v.I }), 'buf');
  // Xilinx AND2B1: O = I0' · I1 (the compact table of the Libraries Guide)
  assert.deepEqual(tbl('and2b1', {}).rows.map(r => `${r.in}:${r.out}`), ['00:0', '01:1', '10:0', '11:0']);
  assert.deepEqual(tbl('and2', {}).compact.map(r => `${r.in}:${r.out}`), ['X0:0', '0X:0', '11:1']);
  assert.deepEqual(tbl('nor3b2', {}).compact.find(r => r.out === '1').in, '110');
  // bitwise gates wider than 6 input bits: shown per bit (Width = 1)
  const w = truthTable('and4', { width: 8 });
  assert.equal(w.perBit, true);
  assert.equal(w.inCols.length, 4);
});

test('multiplexers, demultiplexers and decoders with enable: truth tables match the Xilinx definitions', () => {
  checkAgainst(tbl('mux2', {}), v => ({ O: v.S0 ? v.D1 : v.D0 }), 'M2_1');
  const m4 = tbl('mux4', {});
  assert.deepEqual(m4.inCols.map(c => c.label), ['S(1)', 'S(0)', 'D0', 'D1', 'D2', 'D3']);
  checkAgainst(m4, v => ({ O: v[`D${v.S}`] }), 'M4_1');
  // the M4_1 table of the Libraries Guide: S1 S0 D0 D1 D2 D3 | O
  assert.deepEqual(m4.compact.map(r => `${r.in}:${r.out}`), ['000XXX:0', '001XXX:1', '01X0XX:0', '01X1XX:1', '10XX0X:0', '10XX1X:1', '11XXX0:0', '11XXX1:1']);
  const m4w = truthTable('mux4', { width: 4 });
  assert.ok(m4w.perBit && m4w.kind === 'exhaustive' && m4w.rows.length === 64);
  for (const k of [1, 2, 3]) {
    const n = 1 << k;
    const t = tbl('demux', { sel: k });
    checkAgainst(t, v => Object.fromEntries(Array.from({ length: n }, (_, i) => [`O${i}`, (k === 1 ? v.S0 : v.S) === i ? v.D : 0])), `DEMUX1_${n}`);
  }
  for (const n of [1, 2, 3, 4]) for (const en of [true, false]) for (const bus of [false, true]) {
    const t = tbl('decoder', { n, en, bus });
    checkAgainst(t, v => {
      const a = bus ? v.A : Array.from({ length: n }, (_, i) => v[`A${i}`] << i).reduce((x, y) => x | y, 0);
      const e = en ? v.E : 1;
      if (bus) return { D: e ? 1 << a : 0 };
      return Object.fromEntries(Array.from({ length: 1 << n }, (_, i) => [`D${i}`, e && a === i ? 1 : 0]));
    }, `decoder n=${n} en=${en} bus=${bus}`);
  }
  // D2_4E as in the Libraries Guide: A1 A0 E | D3 D2 D1 D0
  const d24 = tbl('decoder', { n: 2 });
  assert.deepEqual(d24.inCols.map(c => c.label), ['A1', 'A0', 'E']);
  assert.deepEqual(d24.outCols.map(c => c.label), ['D3', 'D2', 'D1', 'D0']);
  assert.deepEqual(d24.compact.map(r => `${r.in}:${r.out}`), ['XX0:0000', '001:0001', '011:0010', '101:0100', '111:1000']);
  // D3_8E: 4 input bits, the disabled row and one row per address
  assert.equal(tbl('decoder', { n: 3 }).compact.length, 9);
});

test('priority and one-hot encoders: truth tables (exhaustive up to 8 inputs) and representative rows', () => {
  for (const n of [2, 3]) for (const mode of ['priority', 'one-hot']) for (const bus of [false, true]) {
    const m = 1 << n;
    const t = tbl('encoder', { n, mode, bus }, { maxFull: 8 });
    checkAgainst(t, v => {
      const ins = bus ? v.I : Array.from({ length: m }, (_, i) => v[`I${i}`] << i).reduce((x, y) => x | y, 0);
      let a = 0;
      if (mode === 'priority') { for (let i = m - 1; i >= 0; i--) if ((ins >> i) & 1) { a = i; break; } } else for (let i = 0; i < m; i++) if ((ins >> i) & 1) a |= i;
      const r = { V: ins ? 1 : 0 };
      if (bus) r.A = a; else for (let j = 0; j < n; j++) r[`A${j}`] = (a >> j) & 1;
      return r;
    }, `encoder n=${n} ${mode} bus=${bus}`);
  }
  // PENC4_2: I3 I2 I1 I0 | A1 A0 V — the highest input wins
  const p = tbl('encoder', { n: 2 });
  assert.deepEqual(p.inCols.map(c => c.label), ['I3', 'I2', 'I1', 'I0']);
  assert.deepEqual(p.compact.map(r => `${r.in}:${r.out}`), ['0000:000', '0001:001', '001X:011', '01XX:101', '1XXX:111']);
  // PENC8_3: 8 inputs, simulated exhaustively, shown compact (9 rows)
  const p8 = tbl('encoder', { n: 3 });
  assert.equal(p8.full, false);
  assert.equal(p8.compact.length, 9);
  // 16 inputs: representative rows, one per active input
  const p16 = truthTable('encoder', { n: 4, mode: 'one-hot' });
  assert.equal(p16.kind, 'samples');
  assert.deepEqual(p16.inCols.map(c => c.label), ['I15…I0']);
  const row = p16.rows.find(r => r.in[0] === '0000000000100000');
  assert.deepEqual(row.out, ['0101', '1']);
});

test('arithmetic symbols: representative rows computed by simulation (8 bits and more)', () => {
  const add = truthTable('add', { width: 8, cin: true, cout: true });
  assert.equal(add.kind, 'samples');
  assert.deepEqual(add.inCols.map(c => c.label), ['A(7:0)', 'B(7:0)', 'CI']);
  assert.deepEqual(add.outCols.map(c => c.label), ['S(7:0)', 'CO']);
  for (const r of add.rows) {
    const s = Number(r.values.A) + Number(r.values.B) + Number(r.values.CI);
    assert.deepEqual(r.out, [String(s % 256), String(s >> 8)], `${r.in}`);
  }
  assert.ok(add.rows.some(r => r.out[1] === '1'), 'a carry out row');
  const sub = truthTable('sub', { width: 8 });
  assert.ok(sub.rows.some(r => r.in[0] === '4' && r.in[1] === '9' && r.out[0] === '251 (-5)'));
  const cmp = truthTable('compare', { width: 8, op: 'lt', signed: true });
  for (const r of cmp.rows) {
    const sg = x => (Number(x) >= 128 ? Number(x) - 256 : Number(x));
    assert.equal(r.out[0], sg(r.values.A) < sg(r.values.B) ? '1' : '0');
  }
  // small widths: exhaustive (2-bit ADD = 4 input bits)
  checkAgainst(tbl('add', { width: 2, cout: true }), v => ({ S: (v.A + v.B) & 3, CO: (v.A + v.B) >> 2 }), 'ADD2');
  checkAgainst(tbl('compare', { width: 3, op: 'ge' }), v => ({ O: v.A >= v.B ? 1 : 0 }), 'COMP3 ge');
  checkAgainst(tbl('sub', { width: 3 }), v => ({ D: (v.A - v.B) & 7 }), 'SUB3');
});

test('constants, bus taps and bus joins', () => {
  assert.deepEqual(tbl('vcc', {}).rows, [{ in: '', out: '1' }]);
  assert.deepEqual(tbl('gnd', {}).rows, [{ in: '', out: '0' }]);
  assert.deepEqual(tbl('constant', { value: '0x5', width: 4 }).rows, [{ in: '', out: '0101' }]);
  checkAgainst(tbl('slice', { msb: 3, lsb: 1 }), v => ({ O: (v.I >> 1) & 7 }), 'slice');
  checkAgainst(tbl('busjoin', { widths: '2,1' }), v => ({ O: (v.I0 << 1) | v.I1 }), 'busjoin');
  assert.equal(truthTable('busjoin', { widths: '8,8' }).kind, 'samples');
  assert.equal(truthTable('fdce', {}).kind, 'none');
  assert.equal(truthTable('hdlblock', {}).kind, 'none');
});

test('compactRows: prime cubes covering each output group', () => {
  const rows = ['000', '001', '010', '011', '100', '101', '110', '111'].map(i => ({ in: i, out: i === '111' ? '1' : '0' }));
  assert.deepEqual(compactRows(rows, 3).map(r => `${r.in}:${r.out}`), ['XX0:0', 'X0X:0', '0XX:0', '111:1']);
});

// ------------------------------------------------------------------ mode tables vs simulation
const FF_TYPES = Object.keys(SYMBOLS).filter(t => SYMBOLS[t].ff);
const SEQ_CASES = [
  ...FF_TYPES.flatMap(t => ['0', '1'].map(init => [t, { init }])),
  ...[true, false].flatMap(en => ['none', 'async', 'sync'].map(reset => ['register', { width: 4, en, reset, init: '5' }])),
  ...[true, false].flatMap(en => ['none', 'async', 'sync'].flatMap(reset => ['up', 'down'].map(dir => ['counter', { width: 4, en, reset, dir }]))),
];
const qOf = sim => { const v = sim.read().Q; assert.ok(!v.x, 'Q is 0/1'); return Number(v.v); };

test('mode tables of every flip-flop, register and counter agree with the simulated behaviour', () => {
  for (const [type, params] of SEQ_CASES) {
    const m = modeTable(type, params);
    assert.ok(m, `${type} has a mode table`);
    assert.equal(m.cols[m.cols.length - 1], 'C');
    const sim = symbolSim(type, params);
    assert.ok(sim.ok, `${type}: ${sim.error}`);
    const ins = sim.ins.map(p => p.pin);
    assert.deepEqual([...ins].sort(), [...m.cols].sort(), `${type}: the table has a column per input`);
    const W = type === 'register' || type === 'counter' ? 4 : 1;
    const mask = (1 << W) - 1;
    const zeros = Object.fromEntries(ins.map(p => [p, 0n]));
    const p = { ...defaultParams(type), ...params };
    for (const row of m.rows) for (const xc of [0, 1]) {
      // power-up state, then (registers / counters) a known non-zero state loaded with clock edges
      sim.apply(zeros);
      sim.live.reset();
      if (type === 'register') { sim.apply({ ...zeros, D: 0b0110n, CE: 1n }); sim.apply({ C: 1n }); sim.apply({ C: 0n }); }
      if (type === 'counter') for (let k = 0; k < 3; k++) { sim.apply({ ...zeros, CE: 1n }); sim.apply({ C: 1n }); sim.apply({ C: 0n }); }
      const q0 = qOf(sim);
      if (type === 'register') assert.equal(q0, 0b0110);
      if (type === 'counter') assert.equal(q0, p.dir === 'down' ? 13 : 3);
      // apply the row: X = xc everywhere (and a clock edge when C = X and xc = 1), D of a register = a pattern
      const pat = xc ? 0b1010 : 0b0101;
      const vals = {};
      for (const c of m.cols) if (c !== 'C') { const x = row.in[c]; vals[c] = BigInt(x === 'X' ? xc : x === 'D' ? pat : +x); }
      sim.apply({ ...vals, C: 0n });
      if (row.in.C === '↑' || xc) sim.apply({ C: 1n });
      const exp = { 0: 0, 1: 1, zero: 0, nc: q0, toggle: q0 ^ 1, D: pat, init: 5, inc: (q0 + 1) & mask, dec: (q0 - 1) & mask }[row.q];
      assert.equal(qOf(sim), exp, `${type} ${JSON.stringify(params)}: row ${JSON.stringify(row.in)} -> ${row.q} (X = ${xc}, Q was ${q0})`);
    }
    // no edge, no asynchronous input: Q holds
    sim.apply(zeros); sim.live.reset();
    const q0 = qOf(sim);
    sim.apply(Object.fromEntries(ins.filter(i => !['CLR', 'PRE', 'C'].includes(i)).map(i => [i, 1n])));
    assert.equal(qOf(sim), q0, `${type}: no clock edge, no change`);
  }
});

test('mode tables: Xilinx layout and priorities', () => {
  const rows = (t, p) => modeTable(t, p).rows.map(r => `${Object.values(r.in).join('')}:${r.q}`);
  // FDCE: CLR CE D C | Q
  assert.deepEqual(modeTable('fdce').cols, ['CLR', 'CE', 'D', 'C']);
  assert.deepEqual(rows('fdce'), ['1XXX:0', '00XX:nc', '010↑:0', '011↑:1']);
  // FDCPE: CLR > PRE
  assert.deepEqual(rows('fdcpe'), ['1XXXX:0', '01XXX:1', '000XX:nc', '0010↑:0', '0011↑:1']);
  // FDRSE: R > S > CE ; FDSE-like FTSRE: S > R
  assert.deepEqual(modeTable('fdrse').cols, ['R', 'S', 'CE', 'D', 'C']);
  assert.deepEqual(rows('fdrse').slice(0, 2), ['1XXX↑:0', '01XX↑:1']);
  assert.deepEqual(modeTable('ftsre').cols, ['S', 'R', 'CE', 'T', 'C']);
  assert.deepEqual(rows('ftsre').slice(0, 2), ['1XXX↑:1', '01XX↑:0']);
  assert.deepEqual(rows('fjk'), ['00↑:nc', '01↑:0', '10↑:1', '11↑:toggle']);
  assert.deepEqual(rows('ft'), ['0↑:nc', '1↑:toggle']);
  assert.deepEqual(rows('register', { reset: 'sync', en: true }), ['1XX↑:init', '00XX:nc', '01D↑:D']);
  assert.deepEqual(rows('counter', { reset: 'async', en: true, dir: 'down' }), ['1XX:zero', '00X:nc', '01↑:dec']);
  assert.equal(modeQText('nc', 'fdce', {}, 'pt'), 'Sem alteração');
  assert.equal(modeQText('toggle', 'ftce', {}, 'en'), "Toggle (Q')");
  assert.equal(modeQText('init', 'register', { init: '0x3' }), 'INIT (0x3)');
  assert.equal(modeTable('and2'), null);
  assert.match(modeTable('fdcpe', {}, 'pt').notes.join(' '), /Prioridade, da mais alta para a mais baixa: CLR > PRE > CE > dados/);
});

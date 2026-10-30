// Flip-flops with the inverted output QN (#2161): "Inverted output QN (/Q)" in their properties gives FD*, FT* and FJK*
// a second output QN = not Q, below Q; their HDL drives it as not Q, compiled and simulated (QN against Q at every
// clock) in VHDL and Verilog with no warnings; without it the symbol and its HDL are as before; exported to ISE as a
// Silinx symbol (no library flip-flop has QN) and imported back with the option.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYMBOLS, newDoc, normalizeDoc, netlist, generateHdl, symbolDef, symbolPins } from '../core/schdoc.js';
import { simulate } from '../core/compile.js';
import { exportIseSch, importIseSch, decodeXlSymbol, parseIseSch } from '../core/isesch.js';

const FFS = Object.keys(SYMBOLS).filter((t) => SYMBOLS[t].ff);
const ext = (lang) => (lang === 'vhdl' ? 'vhd' : 'v');

// a sheet: U1 (type, its params), a marker on each pin named as the pin in lower case (`skip`: the pins left open)
function sheet(type, lang, params, skip = []) {
  const doc = newDoc('ffq', lang);
  doc.symbols.push({ id: 'S1', type, x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params });
  for (const p of symbolPins(doc.symbols[0], {})) {
    if (skip.includes(p.name)) continue;
    const x = p.dir === 'in' ? p.x - 40 : p.x + 40;
    doc.ports.push({ id: `P${p.name}`, name: p.name.toLowerCase(), dir: p.dir === 'in' ? 'in' : 'out', width: p.width || 1, x, y: p.y });
    doc.wires.push({ id: `W${p.name}`, points: [{ x, y: p.y }, { x: p.x, y: p.y }] });
  }
  return normalizeDoc(doc);
}

// a test bench: 24 clocks, the inputs from a fixed sequence (CLR / PRE now and then), Q and QN printed after each edge
// (and at the start, INIT); `outs`: the outputs the sheet has
function bench(doc, lang, W, outs) {
  const ins = doc.ports.filter((p) => p.dir === 'in' && p.name !== 'c').map((p) => p.name);
  const step = (i) => ins.map((n) => {
    const v = (i * 37 + 11 * (n.charCodeAt(0) + n.length)) & 0xff;
    const bit = n === 'clr' || n === 'pre' ? +(v % 7 === 0) : n === 'ce' ? +(v % 4 !== 0) : n === 'r' || n === 's' ? +(v % 5 === 0) : v & 1;
    return [n, W > 1 && !['clr', 'pre', 'ce', 'r', 's'].includes(n) ? ((v ^ (v >> 3)) & ((1 << W) - 1)).toString(2).padStart(W, '0') : String(bit)];
  });
  const all = ['c', ...ins, ...outs];
  const wide = (n) => W > 1 && !['c', 'clr', 'pre', 'ce', 'r', 's'].includes(n);
  if (lang === 'vhdl') {
    const sig = all.map((n) => `  signal ${n} : ${wide(n) ? `std_logic_vector(${W - 1} downto 0)` : 'std_logic'}${outs.includes(n) ? '' : ` := ${wide(n) ? "(others => '0')" : "'0'"}`};`).join('\n');
    const img = (n) => (wide(n) ? Array.from({ length: W }, (_, k) => `std_logic'image(${n}(${W - 1 - k}))`).join(' & ') : `std_logic'image(${n})`);
    const pr = `report "${outs.map((n) => `${n}=" & ${img(n)} & " `).join('')}";`;
    const steps = Array.from({ length: 24 }, (_, i) => `    ${step(i).map(([n, v]) => `${n} <= ${wide(n) ? `"${v}"` : `'${v}'`}; `).join('')}wait for 5 ns; c <= '1'; wait for 5 ns; c <= '0'; ${pr}`).join('\n');
    return `library ieee; use ieee.std_logic_1164.all;\nentity tb is end tb;\narchitecture t of tb is\n${sig}\nbegin\n  uut: entity work.ffq port map (${all.map((n) => `${n} => ${n}`).join(', ')});\n  process begin\n    wait for 1 ns; ${pr}\n${steps}\n    report "done"; wait;\n  end process;\nend t;\n`;
  }
  const decl = all.map((n) => `  ${outs.includes(n) ? 'wire' : 'reg '}${wide(n) ? ` [${W - 1}:0]` : ''} ${n}${outs.includes(n) ? '' : ' = 0'};`).join('\n');
  const pr = `$display("${outs.map((n) => `${n}=%b `).join('')}", ${outs.join(', ')});`;
  const steps = Array.from({ length: 24 }, (_, i) => `    ${step(i).map(([n, v]) => `${n} = ${wide(n) ? `${W}'b${v}` : `1'b${v}`}; `).join('')}#5; c = 1; #5; c = 0; ${pr}`).join('\n');
  return `\`timescale 1ns/1ps\nmodule tb;\n${decl}\n  ffq uut (${all.map((n) => `.${n}(${n})`).join(', ')});\n  initial begin\n    #1; ${pr}\n${steps}\n    $display("done"); $finish;\n  end\nendmodule\n`;
}

// simulated: the printed values, [{ q, qn }] (bit strings), the start first
function run(doc, lang, W, outs) {
  const g = generateHdl(doc, { lang });
  const r = simulate([{ path: `ffq.${ext(lang)}`, text: g.code }, { path: `tb.${ext(lang)}`, text: bench(doc, lang, W, outs) }], 'tb', { until: 1e6 });
  assert.deepEqual(r.errors.map((e) => e.message), [], `${doc.symbols[0].type} ${lang}: compiles`);
  const log = r.sim.log.map((l) => l.text);
  assert.ok(log.some((l) => /done/.test(l)), `${doc.symbols[0].type} ${lang}: ran to the end\n${log.join('\n')}`);
  return { g, rows: log.filter((l) => /qn=/.test(l)).map((l) => Object.fromEntries([...l.matchAll(/(\w+)=([01'U]+)/g)].map(([, n, v]) => [n, v.replace(/'/g, '')]))) };
}
const inv = (b) => [...b].map((c) => (c === '1' ? '0' : '1')).join('');

test('#2161 the flip-flops: Inverted output QN their third parameter, off by default; with it QN below Q, level with the last input', () => {
  assert.ok(FFS.length >= 30 && ['fd', 'fdce', 'fdcpe', 'fdrse', 'ft', 'ftcpe', 'fjk', 'fjksre'].every((t) => FFS.includes(t)));
  for (const t of FFS) {
    assert.deepEqual(SYMBOLS[t].params.map((p) => [p.name, p.default]).slice(1), [['width', 1], ['qn', false]], t);
    const off = symbolDef({ type: t, params: {} }), on = symbolDef({ type: t, params: { qn: true } });
    assert.ok(!off.pins.some((p) => p.name === 'QN'), t);
    // (the same symbol with QN added: its other pins where they were, its size as before)
    assert.deepEqual(on.pins.slice(0, -1), off.pins, t);
    assert.deepEqual([on.w, on.h], [off.w, off.h], t);
    const west = off.pins.filter((p) => p.side === 'W'), q = off.pins.find((p) => p.name === 'Q');
    assert.deepEqual(on.pins.at(-1), { name: 'QN', dir: 'out', x: 90, y: west.at(-1).y, side: 'E', width: 1, neg: true }, t);
    assert.ok(on.pins.at(-1).y > q.y, `${t}: below Q`);
  }
  assert.deepEqual(symbolDef({ type: 'fdce', params: { qn: true, width: 4 } }).pins.map((p) => `${p.name}@${p.y}/${p.width}`), ['D@10/4', 'CE@30/1', 'C@50/1', 'CLR@70/1', 'Q@10/4', 'QN@70/4']);
});

test('#2161 without QN the HDL is as before: no QN, no local copy of Q for a D flip-flop', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const a = generateHdl(sheet('fdce', lang, { init: '0' }), { lang }), b = generateHdl(sheet('fdce', lang, { init: '0', qn: false }), { lang });
    assert.equal(a.code, b.code, lang);
    assert.doesNotMatch(a.code, /qn|u1_q/i, lang);   // (its block's mark too: {"init":"0","width":1})
    assert.deepEqual(a.diagnostics, [], lang);
  }
});

test('#2161 every flip-flop with QN: QN = not Q at power-up and after every clock, no warnings, in VHDL and Verilog', () => {
  for (const t of FFS) {
    for (const lang of ['vhdl', 'verilog']) {
      const doc = sheet(t, lang, { init: SYMBOLS[t].params[0].default, qn: true });
      assert.deepEqual(netlist(doc).diagnostics, [], `${t} ${lang}: netlist`);
      const { g, rows } = run(doc, lang, 1, ['q', 'qn']);
      assert.deepEqual(g.diagnostics, [], `${t} ${lang}: no warnings`);
      assert.match(g.code, lang === 'vhdl' ? /qn <= not u1_q\w*;/i : /assign qn = ~q;/i, `${t} ${lang}`);
      assert.equal(rows.length, 25, `${t} ${lang}`);
      assert.equal(rows[0].q, SYMBOLS[t].params[0].default, `${t} ${lang}: INIT`);
      for (const [i, r] of rows.entries()) assert.equal(r.qn, inv(r.q), `${t} ${lang} clock ${i}: ${JSON.stringify(r)}`);
      assert.ok(rows.some((r) => r.q === '0') && rows.some((r) => r.q === '1'), `${t} ${lang}: Q takes both values ${rows.map((r) => r.q).join('')}`);
    }
  }
});

test('#2161 Width 4 with QN: QN the bitwise complement of Q; QN alone connected: Q kept in a register of its own', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const { g, rows } = run(sheet('fdce', lang, { init: '0', width: 4, qn: true }), lang, 4, ['q', 'qn']);
    assert.deepEqual(g.diagnostics, [], lang);
    for (const r of rows) assert.equal(r.qn, inv(r.q), `${lang}: ${JSON.stringify(r)}`);
    assert.ok(new Set(rows.map((r) => r.q)).size > 3, `${lang}: Q changes`);
    // (only QN wired: an FT toggling every clock, T = 1 from the bench now and then; QN from INIT 0: 1 at the start)
    const doc = sheet('ftc', lang, { init: '0', qn: true }, ['Q']);
    const one = run(doc, lang, 1, ['qn']);
    assert.deepEqual(one.g.diagnostics, [], `${lang}: QN alone`);
    // (Q's net in the block's own entity the register itself: no copy of it assigned and never read, XST's Xst:646)
    assert.doesNotMatch(one.g.code, /net_\d+ <= U1_q|assign net_\d+/, lang);
    assert.equal(one.rows[0].qn, '1', lang);
    assert.ok(one.rows.some((r) => r.qn === '0'), `${lang}: QN alone toggles`);
  }
});

test('#2161 neither Q nor QN connected: the flip-flop skipped with its warning, as before', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = sheet('fd', lang, { init: '0', qn: true }, ['Q', 'QN']);
    assert.deepEqual(generateHdl(doc, { lang }).diagnostics.map((d) => d.message), ['U1: no output connected, skipped'], lang);
  }
});

test('#2161 exported to ISE as xl_<type>_i<INIT>[_w<W>]_qn (a Silinx symbol), imported back with QN', () => {
  assert.deepEqual(decodeXlSymbol('xl_fdce_i0_qn'), { type: 'fdce', params: { init: '0', qn: true } });
  assert.deepEqual(decodeXlSymbol('xl_fjkp_i1_w4_qn'), { type: 'fjkp', params: { init: '1', width: 4, qn: true } });
  assert.deepEqual(decodeXlSymbol('xl_fd_i1'), { type: 'fd', params: { init: '1' } });
  for (const [type, params, name] of [['fdce', { init: '0', qn: true }, 'xl_fdce_i0_qn'], ['ft', { init: '0', width: 4, qn: true }, 'xl_ft_i0_w4_qn'], ['fdce', { init: '0' }, 'fdce']]) {
    const ex = exportIseSch(sheet(type, 'vhdl', params), { timestamp: '2024-1-2T3:4:5' });
    assert.equal(parseIseSch(ex.xml).blocks[0].symbol, name);
    const back = importIseSch(ex.xml, { name: 'ffq', symbols: Object.fromEntries(ex.files.filter((f) => f.kind === 'sym').map((f) => [f.path, f.text])) });
    const s = back.doc.symbols[0];
    assert.deepEqual([s.type, !!s.params.qn, s.params.width ?? 1], [type, !!params.qn, params.width ?? 1], name);
    assert.deepEqual(back.warnings, [], name);
    assert.deepEqual(netlist(back.doc).diagnostics, [], `${name}: its connections back`);
  }
});

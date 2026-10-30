// The templates of the Schematic Wizard (#2180, core/sch-templates.js): each one, its parameters at the defaults and
// the limits, draws a schematic with no warnings and no clash of its wires, whose HDL compiles, elaborates and
// simulates in VHDL and Verilog as a model of it written here says; the wizard's table: renamed and added ports,
// a template's port removed or changed refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCH_TEMPLATES, templateDefaults, templateError, templateOf } from '../core/chart-templates.js';
import { schematicFromTemplate, schematicTemplatePorts, templatePortsError } from '../core/sch-templates.js';
import { netlist, generateHdl, portBox, symbolBox } from '../core/schdoc.js';
import { wireStats } from '../core/schbeautify.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

const LANGS = ['vhdl', 'verilog'];
const ext = (lang) => (lang === 'vhdl' ? 'vhd' : 'v');
const hdlOf = (doc, lang) => {
  const g = generateHdl(doc, { lang });
  assert.deepEqual(g.diagnostics, [], lang);
  return g.code;
};
// the HDL compiled and elaborated, as Check Syntax does: its errors and warnings
const checkDiags = (code, lang, top) => {
  const lib = compile([{ path: `${top}.${ext(lang)}`, lang, text: code }]);
  const design = elaborate(lib, top);
  return [...lib.errors, ...design.diags, ...designChecks(lib, design, { lint: true })].map((d) => `${d.severity}: ${d.message}`);
};

// each template's parameters: the defaults, the limits, the options
const variants = () => SCH_TEMPLATES.slice(1).flatMap((t) => {
  const def = templateDefaults('sch', t.id), out = [def];
  for (const p of t.params || []) {
    if (p.min != null) for (const v of [p.min, p.max]) out.push({ ...def, [p.key]: v });
    if (p.options) for (const [v] of p.options) out.push({ ...def, [p.key]: v });
  }
  return out.map((params) => [t.id, params]);
});

test('#2180 every template, at the defaults and the limits: no warnings, nothing overlapping, its wires clean, on the sheet (VHDL, Verilog)', () => {
  for (const [id, params] of variants()) {
    const what = `${id} ${JSON.stringify(params)}`;
    assert.equal(templateError('sch', id, params), null, what);
    for (const lang of LANGS) {
      const doc = schematicFromTemplate({ name: 'm', lang, id, params });
      assert.deepEqual(netlist(doc).diagnostics, [], what);
      assert.deepEqual(checkDiags(hdlOf(doc, lang), lang, 'm'), [], `${what} ${lang}`);
      const st = wireStats(doc);
      assert.deepEqual([st.clashes, st.diagonals], [{}, 0], what);
      if (id !== 'fulladder') assert.equal(st.crossings, 0, what);
      assert.deepEqual(doc.ports.map((p) => `${p.name}:${p.dir}:${p.width}`).sort(), schematicTemplatePorts(id, params).map((p) => `${p.name}:${p.dir}:${p.width}`).sort(), what);
      const boxes = [...doc.ports.map(portBox), ...doc.symbols.map((s) => symbolBox(s))];
      for (const b of boxes) assert.ok(b.x >= 10 && b.y >= 10 && b.x + b.w <= doc.sheet.w - 10 && b.y + b.h <= doc.sheet.h - 10, `${what}: on the sheet`);
      // (a tap sits on its bus: its box may touch a wire, not another box)
      boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${what}: overlap ${JSON.stringify([a, b])}`)));
    }
  }
});

// a test bench of the module: each vector its inputs set (a clock pulse after, when `clk`), then its outputs printed in binary
function bench(ports, vectors, lang, clk) {
  const ins = ports.filter((p) => p.dir === 'in' && p.name !== clk), outs = ports.filter((p) => p.dir === 'out');
  const all = [...ins, ...outs, ...(clk ? [{ name: clk, width: 1 }] : [])];
  const bits = (v, w) => BigInt(v).toString(2).padStart(w, '0');
  if (lang === 'vhdl') {
    const type = (p) => (p.width > 1 ? `std_logic_vector(${p.width - 1} downto 0)` : 'std_logic');
    const lit = (v, w) => (w > 1 ? `"${bits(v, w)}"` : `'${bits(v, 1)}'`);
    const show = (p) => (p.width > 1 ? `to_string(${p.name})` : `std_logic'image(${p.name})`);
    return `library ieee; use ieee.std_logic_1164.all;\nentity tb is end;\narchitecture s of tb is\n${all.map((p) => ` signal ${p.name} : ${type(p)};`).join('\n')}\nbegin\n u : entity work.m port map (${all.map((p) => `${p.name} => ${p.name}`).join(', ')});\n process begin\n${clk ? ` ${clk} <= '0';\n` : ''}${vectors.map((v) => `${ins.map((p) => ` ${p.name} <= ${lit(v[p.name], p.width)};`).join('')} wait for 1 ns;${clk ? ` ${clk} <= '1'; wait for 1 ns; ${clk} <= '0'; wait for 1 ns;` : ''} report ${outs.map(show).join(' & " " & ')};`).join('\n')}\n wait;\n end process;\nend;`;
  }
  const decl = (p, k) => `${k} ${p.width > 1 ? `[${p.width - 1}:0] ` : ''}${p.name};`;
  return `module tb;\n${[...ins, ...(clk ? [{ name: clk, width: 1 }] : [])].map((p) => decl(p, 'reg')).join(' ')} ${outs.map((p) => decl(p, 'wire')).join(' ')}\n m u(${all.map((p) => `.${p.name}(${p.name})`).join(', ')});\n initial begin\n${clk ? ` ${clk} = 0;\n` : ''}${vectors.map((v) => `${ins.map((p) => ` ${p.name} = ${p.width}'b${bits(v[p.name], p.width)};`).join('')} #1;${clk ? ` ${clk} = 1; #1; ${clk} = 0; #1;` : ''} $display("${outs.map(() => '%b').join(' ')}", ${outs.map((p) => p.name).join(', ')});`).join('\n')}\n end\nendmodule`;
}

// the outputs of the template's module simulated, per vector, as bit strings joined by a space
// (handClock: the vectors drive clk themselves, no pulse after each)
function sim(id, params, vectors, lang, handClock = false) {
  const ports = schematicTemplatePorts(id, params);
  const code = hdlOf(schematicFromTemplate({ name: 'm', lang, id, params }), lang);
  const clk = !handClock && ports.some((p) => p.name === 'clk') ? 'clk' : null;
  const r = simulate([{ path: `m.${ext(lang)}`, text: code }, { path: `tb.${ext(lang)}`, text: bench(ports, vectors, lang, clk) }], 'tb', { until: 1e8 });
  assert.deepEqual(r.errors, [], `${id} ${lang}`);
  return r.sim.log.map((l) => l.text.replace(/['"]/g, '').trim());
}

// a repeatable pseudo-random generator (the reference's stimuli)
const rng = (seed = 11) => (bits) => {
  let v = 0n;
  for (let i = 0; i < bits; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; v = (v << 1n) | BigInt((seed >> 16) & 1); }
  return v;
};
const bin = (v, w) => BigInt.asUintN(w, BigInt(v)).toString(2).padStart(w, '0');
const expectSame = (id, params, vectors, model) => {
  const want = vectors.map(model());
  for (const lang of LANGS) assert.deepEqual(sim(id, params, vectors, lang), want, `${id} ${JSON.stringify(params)} ${lang}`);
};

test('#2180 the register: q takes d at the clock edge, held while ce = 0, cleared by rst (asynchronous, synchronous), simulated against a model', () => {
  for (const reset of ['async', 'sync', 'none']) for (const en of ['yes', 'no']) for (const n of [1, 8]) {
    const r = rng(n * 7 + 1);
    const vectors = Array.from({ length: 40 }, (_, i) => ({ d: r(n), ce: en === 'yes' ? r(1) : 0n, rst: reset === 'none' ? 0n : i === 0 ? 1n : (r(3) === 0n ? 1n : 0n) }));
    expectSame('register', { n, en, reset }, vectors, () => { let q = 0n; return (v) => { if (reset !== 'none' && v.rst) q = 0n; else if (en === 'no' || v.ce) q = v.d; return bin(q, n); }; });
  }
});

test('#2180 the shift register: q shifted left with si at bit 0, held while ce = 0, simulated against a model', () => {
  for (const n of [2, 8, 32]) {
    const r = rng(n);
    const vectors = Array.from({ length: 60 }, (_, i) => ({ si: r(1), ce: r(2) === 0n ? 0n : 1n, rst: i === 0 ? 1n : 0n }));
    expectSame('shift', { n, en: 'yes', reset: 'async' }, vectors, () => { let q = 0n; return (v) => { if (v.rst) q = 0n; else if (v.ce) q = BigInt.asUintN(n, (q << 1n) | v.si); return bin(q, n); }; });
  }
});

test('#2180 the counter: up and down, the enable, the resets, past its end, simulated against a model', () => {
  for (const dir of ['up', 'down']) for (const reset of ['async', 'sync']) for (const n of [1, 3]) {
    const r = rng(n + 3);
    const vectors = Array.from({ length: 40 }, (_, i) => ({ ce: r(2) === 0n ? 0n : 1n, rst: i === 0 || i === 30 ? 1n : 0n }));
    expectSame('counter', { n, en: 'yes', reset, dir }, vectors, () => { let q = 0n; return (v) => { if (v.rst) q = 0n; else if (v.ce) q = BigInt.asUintN(n, dir === 'up' ? q + 1n : q - 1n); return bin(q, n); }; });
  }
});

test('#2180 the asynchronous reset clears at once, the synchronous one waits for the clock edge (register, shift register, counter)', () => {
  const on = { ce: 1n, rst: 0n, d: 1n, si: 1n };
  const steps = [{ ...on, clk: 0n }, { ...on, clk: 1n }, { ...on, clk: 0n }, { ...on, clk: 0n, rst: 1n }, { ...on, clk: 1n, rst: 1n }];
  // (q after each step, before and after the edge: the first edge loads or counts, the reset then clears; an unknown start not read)
  const pick = (log) => log.slice(1).map((q) => Number(BigInt(`0b${q}`)));
  for (const lang of LANGS) for (const [id, extra] of [['register', {}], ['shift', {}], ['counter', { dir: 'up' }]]) {
    const q = (reset) => pick(sim(id, { n: 2, en: 'yes', reset, ...extra }, [{ ...on, clk: 0n, rst: 1n }, ...steps], lang, true).slice(1));
    assert.deepEqual(q('async'), [1, 1, 0, 0], `${id} asynchronous ${lang}`);
    assert.deepEqual(q('sync'), [1, 1, 1, 0], `${id} synchronous ${lang}`);
  }
});

test('#2180 the multiplexer and the demultiplexer: every select, against a model', () => {
  for (const k of [1, 2, 3, 4]) for (const n of [1, 4]) {
    const r = rng(k * 5 + n), m = 1 << k;
    const vectors = Array.from({ length: 2 * m }, (_, i) => {
      const v = { s: BigInt(i % m), d: r(n) };
      for (let j = 0; j < m; j++) v[`d${j}`] = r(n);
      return v;
    });
    expectSame('mux', { n, k }, vectors.map(({ d, ...v }) => v), () => (v) => bin(v[`d${v.s}`], n));
    expectSame('demux', { n, k }, vectors.map((v) => ({ s: v.s, d: v.d })), () => (v) => Array.from({ length: m }, (_, j) => bin(BigInt(j) === v.s ? v.d : 0n, n)).join(' '));
  }
});

test('#2180 the adder, the subtractor, the comparator (unsigned, signed), the full adder of gates: against the arithmetic', () => {
  for (const n of [1, 8, 32]) {
    const r = rng(n + 9);
    const vectors = Array.from({ length: 50 }, () => ({ a: r(n), b: r(n) }));
    const signedOf = (x) => BigInt.asIntN(n, x);
    expectSame('adder', { n }, vectors.map((v) => ({ ...v, ci: r(1) })), () => (v) => { const t = v.a + v.b + v.ci; return `${bin(t, n)} ${bin(t >> BigInt(n), 1)}`; });
    expectSame('subtractor', { n }, vectors.map((v) => ({ ...v, bi: r(1) })), () => (v) => { const t = v.a - v.b - v.bi; return `${bin(t, n)} ${t < 0n ? 1 : 0}`; });
    const cmp = (a, b) => [a === b, a < b, a > b].map((x) => (x ? '1' : '0')).join(' ');
    // (an equal pair too: rarely drawn at random)
    const pairs = [...vectors, { a: vectors[0].a, b: vectors[0].a }];
    expectSame('comparator', { n, signed: 'no' }, pairs, () => (v) => cmp(v.a, v.b));
    expectSame('comparator', { n, signed: 'yes' }, pairs, () => (v) => cmp(signedOf(v.a), signedOf(v.b)));
  }
  const all = Array.from({ length: 8 }, (_, i) => ({ a: BigInt(i >> 2 & 1), b: BigInt(i >> 1 & 1), ci: BigInt(i & 1) }));
  expectSame('fulladder', {}, all, () => (v) => { const t = v.a + v.b + v.ci; return `${bin(t, 1)} ${bin(t >> 1n, 1)}`; });
});

test('#2180 the decoder and the priority encoder: every value, against a model', () => {
  for (const n of [1, 3, 5]) {
    const vectors = Array.from({ length: 2 << n }, (_, i) => ({ a: BigInt(i % (1 << n)), en: BigInt(i >> n & 1) }));
    expectSame('decoder', { n }, vectors, () => (v) => bin(v.en ? 1n << v.a : 0n, 1 << n));
  }
  for (const n of [2, 3, 5]) {
    const m = 1 << n, r = rng(n);
    const vectors = [{ i: 0n }, ...Array.from({ length: m }, (_, j) => ({ i: 1n << BigInt(j) })), ...Array.from({ length: 30 }, () => ({ i: r(m) }))];
    expectSame('encoder', { n }, vectors, () => (v) => {
      let top = -1;
      for (let j = 0; j < m; j++) if ((v.i >> BigInt(j)) & 1n) top = j;
      return `${bin(Math.max(top, 0), n)} ${top < 0 ? 0 : 1}`;
    });
  }
});

test('#2180 the wizard\'s table: ports renamed (the wires follow), others added (their markers unwired, its warning), a template\'s port removed or changed refused', () => {
  const params = { n: 4, en: 'yes', reset: 'async' };
  const table = () => schematicTemplatePorts('register', params).map((p) => ({ ...p }));
  const rows = table();
  rows.find((p) => p.role === 'q').name = 'a_rather_long_output_name';
  rows.find((p) => p.role === 'clk').name = 'the_clock_of_the_register';
  rows.push({ name: 'spare', dir: 'in', width: 2 }, { name: 'led', dir: 'out', width: 1 });
  for (const lang of LANGS) {
    const doc = schematicFromTemplate({ name: 'm', lang, id: 'register', params, ports: rows, description: 'A register.' });
    assert.equal(doc.description, 'A register.');
    assert.deepEqual(netlist(doc).diagnostics.map((d) => `${d.severity}: ${d.message}`), ["warning: I/O marker 'spare' is not connected", "warning: I/O marker 'led' is not connected"]);
    const nets = generateHdl(doc, { lang }).code;
    assert.match(nets, /the_clock_of_the_register/);
    const boxes = doc.ports.map(portBox);
    for (const b of boxes) assert.ok(b.x >= 10 && b.y >= 10 && b.x + b.w <= doc.sheet.w - 10);
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, 'markers overlap')));
  }
  assert.equal(templatePortsError('register', params, rows), null);
  assert.equal(templatePortsError('register', params, rows.filter((p) => p.role !== 'd')), "The template's port 'd' was removed: put it back, or choose another template or parameters on the Template page.");
  const wide = table(); wide.find((p) => p.role === 'd').width = 5;
  assert.equal(templatePortsError('register', params, wide), "The port 'd' is wired by the template, with its direction and width: change them on the Template page, or in the schematic editor after creating it.");
  const turned = table(); turned.find((p) => p.role === 'ce').dir = 'out';
  assert.match(templatePortsError('register', params, turned), /^The port 'ce' is wired by the template/);
  assert.throws(() => schematicFromTemplate({ name: 'm', id: 'register', params, ports: wide }), /wired by the template/);
  const dup = table(); dup[0].name = 'q';
  assert.throws(() => schematicFromTemplate({ name: 'm', id: 'register', params, ports: dup }), /q/);
  assert.deepEqual(templatePortsError('empty', {}, [{ name: 'x', dir: 'in', width: 1 }]), null);
  assert.deepEqual(schematicTemplatePorts('empty', {}), []);
});

test('#2180 the templates\' parameters refused with their messages; an unknown template is the empty one', () => {
  assert.equal(templateError('sch', 'register', { n: 0, en: 'yes', reset: 'async' }), 'Width (bits): a whole number from 1 to 32.');
  assert.equal(templateError('sch', 'shift', { n: 1, en: 'yes', reset: 'async' }), 'Width (bits): a whole number from 2 to 32.');
  assert.equal(templateError('sch', 'mux', { n: 8, k: 5 }), 'Select bits: a whole number from 1 to 4.');
  assert.equal(templateError('sch', 'counter', { n: 8, en: 'yes', reset: 'async', dir: 'sideways' }), 'Direction: choose one.');
  assert.equal(templateError('sch', 'decoder', { n: 6 }), 'Address bits (N): a whole number from 1 to 5.');
  assert.equal(templateOf('sch', 'nope').id, 'empty');
});


// The templates of the Schematic Wizard (#2180, core/sch-templates.js): each one, its parameters at the defaults and
// the limits, draws a schematic with no warnings and no clash of its wires, whose HDL compiles, elaborates and
// simulates in VHDL and Verilog as a model of it written here says; the wizard's table: renamed and added ports,
// a template's port removed or changed refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCH_TEMPLATES, templateDefaults, templateError, templateOf } from '../core/chart-templates.js';
import { schematicFromTemplate, schematicTemplatePorts, templatePortsError } from '../core/sch-templates.js';
import { HEX_SEGMENTS } from '../core/sch-circuits.js';
import { readFileSync } from 'node:fs';
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

// the wires that have to cross (a circuit's fan-outs), at most
const CROSSINGS = { fulladder: 9, modcounter: 1, pwm: 1, edge: 1, debounce: 1, addsub: 2, display: 2 };

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
      assert.ok(st.crossings <= (CROSSINGS[id] ?? 0), `${what}: ${st.crossings} crossings`);
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

test('#2180 the full adder of gates: against the arithmetic', () => {
  const all = Array.from({ length: 8 }, (_, i) => ({ a: BigInt(i >> 2 & 1), b: BigInt(i >> 1 & 1), ci: BigInt(i & 1) }));
  expectSame('fulladder', {}, all, () => (v) => { const t = v.a + v.b + v.ci; return `${bin(t, 1)} ${bin(t >> 1n, 1)}`; });
});

test('#2231 the modulo-N counter: 0 to N-1 and back, tc at the last count, held while ce = 0, the reset, against a model', () => {
  for (const N of [2, 3, 10, 16]) {
    const r = rng(N), w = Math.max(1, Math.ceil(Math.log2(N)));
    const vectors = Array.from({ length: 3 * N + 20 }, (_, i) => ({ ce: r(2) === 0n ? 0n : 1n, rst: i === 0 || i === 2 * N + 5 ? 1n : 0n }));
    expectSame('modcounter', { n: N }, vectors, () => { let q = 0; return (v) => {
      // (tc read after the edge, with this vector's ce)
      if (v.rst) q = 0; else if (v.ce) q = (q + 1) % N;
      return `${bin(q, w)} ${v.ce && q === N - 1 ? 1 : 0}`;
    }; });
  }
});

test('#2231 the clock divider: tick one clock in every N, the reset restarts it, against a model', () => {
  for (const N of [2, 5, 16]) {
    const vectors = Array.from({ length: 4 * N }, (_, i) => ({ rst: i === 0 || i === 2 * N + 1 ? 1n : 0n }));
    expectSame('clockdiv', { n: N }, vectors, () => { let q = 0; return (v) => { q = v.rst ? 0 : (q + 1) % N; return bin(q === N - 1 ? 1 : 0, 1); }; });
  }
});

test('#2231 the PWM: out high for duty clocks in every 2^N, the duty taken at load, against a model', () => {
  for (const n of [1, 3]) for (const duty of [0n, 1n, BigInt((1 << n) - 1)]) {
    const vectors = Array.from({ length: 3 << n }, (_, i) => ({ duty: i < 2 ? duty : 0n, load: i === 1 ? 1n : 0n, rst: i === 0 ? 1n : 0n }));
    expectSame('pwm', { n }, vectors, () => { let q = 0n, h = 0n; return (v) => {
      if (v.rst) { q = 0n; h = 0n; } else { q = BigInt.asUintN(n, q + 1n); if (v.load) h = v.duty; }
      return bin(h > q ? 1 : 0, 1);
    }; });
  }
  // over a whole period, after the duty is taken: exactly duty clocks
  for (const lang of LANGS) {
    const vectors = [{ duty: 5n, load: 0n, rst: 1n }, { duty: 5n, load: 1n, rst: 0n }, ...Array.from({ length: 8 }, () => ({ duty: 0n, load: 0n, rst: 0n }))];
    assert.equal(sim('pwm', { n: 3 }, vectors, lang).slice(2).filter((x) => x === '1').length, 5, lang);
  }
});

test('#2231 the edge detector: a pulse of one clock at the rising, the falling or both edges, against the input', () => {
  const r = rng(5);
  // (d changes between edges: pulse read just before the next change is 0, so the pulse is read with d still applied)
  const vectors = Array.from({ length: 40 }, (_, i) => ({ d: i < 2 ? 0n : r(1), rst: i === 0 ? 1n : 0n }));
  for (const kind of ['rise', 'fall', 'both']) for (const lang of LANGS) {
    // two vectors per value of d: the first sees it change (before the clock), read before the edge by hand-clocking
    const clocked = vectors.flatMap((v) => [{ ...v, clk: 0n }, { ...v, clk: 1n }, { ...v, clk: 0n }]);
    const got = sim('edge', { kind }, clocked, lang, true);
    let prev = 0n;
    const want = clocked.map((v, i) => {
      if (v.rst) prev = 0n; else if (i % 3 === 1) prev = v.d;
      return bin(kind === 'rise' ? v.d & (prev ^ 1n) : kind === 'fall' ? (v.d ^ 1n) & prev : v.d ^ prev, 1);
    });
    assert.deepEqual(got.slice(3), want.slice(3), `${kind} ${lang}`);
  }
});

test('#2231 the debouncer: bouncing shorter than the sampling never reaches q, the new level does, against a model', () => {
  const N = 4;
  const levels = [0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const vectors = levels.map((d, i) => ({ d: BigInt(d), rst: i === 0 ? 1n : 0n }));
  expectSame('debounce', { n: N }, vectors, () => { let a = 0n, b = 0n, q = 0n, c = 0; return (v) => {
    const tick = !v.rst && c === N - 1;
    if (v.rst) q = 0n; else if (tick) q = b;
    b = a; a = v.d;
    c = v.rst || tick ? 0 : c + 1;
    return bin(q, 1);
  }; });
});

test('#2231 the adder-subtractor: s, co and ov against the arithmetic (corners and random, adding and subtracting)', () => {
  for (const n of [1, 4, 8, 32]) {
    const r = rng(n + 9), top = 1n << BigInt(n - 1), mask = (1n << BigInt(n)) - 1n;
    const corners = [0n, 1n, top, top - 1n, mask];
    const pairs = corners.flatMap((a) => corners.map((b) => ({ a: a & mask, b: b & mask })));
    const vectors = [...pairs, ...Array.from({ length: 30 }, () => ({ a: r(n), b: r(n) }))].flatMap((v) => [{ ...v, sub: 0n }, { ...v, sub: 1n }]);
    const signed = (x) => BigInt.asIntN(n, x);
    expectSame('addsub', { n }, vectors, () => (v) => {
      const raw = v.sub ? v.a + (v.b ^ mask) + 1n : v.a + v.b;
      const exact = v.sub ? signed(v.a) - signed(v.b) : signed(v.a) + signed(v.b);
      return `${bin(raw, n)} ${bin(raw >> BigInt(n), 1)} ${exact === signed(BigInt.asUintN(n, raw)) ? 0 : 1}`;
    });
  }
});

test('#2231 the accumulator: q takes q + d while ce = 1, wraps around, cleared by rst, against a model', () => {
  for (const n of [1, 4, 32]) {
    const r = rng(n + 2);
    const vectors = Array.from({ length: 50 }, (_, i) => ({ d: r(n), ce: r(2) === 0n ? 0n : 1n, rst: i === 0 || i === 30 ? 1n : 0n }));
    expectSame('accumulator', { n }, vectors, () => { let q = 0n; return (v) => { if (v.rst) q = 0n; else if (v.ce) q = BigInt.asUintN(n, q + v.d); return bin(q, n); }; });
  }
});

test('#2231 the multiplexed display: each digit in turn, its anode low, the segments of every value (the same table as the stopwatch example\'s)', () => {
  for (const k of [2, 4]) {
    const N = 3, sel = k === 2 ? 1 : 2;
    const value = (i) => (k === 2 ? 0x5an : 0x1e7cn) + BigInt(i >> 4);
    const vectors = Array.from({ length: 16 * k * N + 10 }, (_, i) => ({ d: BigInt.asUintN(4 * k, value(i)), rst: i === 0 ? 1n : 0n }));
    expectSame('display', { k: String(k), n: N }, vectors, () => { let c = 0, s = 0; return (v) => {
      if (v.rst) { c = 0; s = 0; } else {
        if (c === N - 1) s = (s + 1) % (1 << sel);
        c = c === N - 1 ? 0 : c + 1;
      }
      const digit = Number((v.d >> BigInt(4 * s)) & 15n);
      return `${HEX_SEGMENTS[digit]} ${bin(~(1n << BigInt(s)), k)}`;
    }; });
  }
  // every value of a digit, from the example's own table where it has it
  const text = readFileSync(new URL('../examples/stopwatch/src/sevenseg.vhd', import.meta.url), 'utf8');
  for (const [, bits, v] of text.matchAll(/"([01]{7})" when "([01]{4})"/g)) assert.equal(HEX_SEGMENTS[parseInt(v, 2)], bits, v);
  assert.equal(new Set(HEX_SEGMENTS).size, 16);
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
  assert.equal(templateError('sch', 'modcounter', { n: 1 }), 'Modulus (N): a whole number from 2 to 65536.');
  assert.equal(templateError('sch', 'display', { k: '3', n: 10 }), 'Digits: choose one.');
  assert.equal(templateError('sch', 'counter', { n: 8, en: 'yes', reset: 'async', dir: 'sideways' }), 'Direction: choose one.');
  assert.equal(templateOf('sch', 'nope').id, 'empty');
});


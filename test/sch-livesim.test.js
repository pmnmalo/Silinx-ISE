// core/schlive.js: live schematic simulation — schematic nets mapped to the elaborated signals,
// inputs forced, clocks stepped, values read back per net / pin / I/O marker / stored register.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compile, elaborate } from '../core/compile.js';
import { newDoc, normalizeDoc, symbolPins, modulesFromLibrary, schematicFromHdl } from '../core/schdoc.js';
import { buildLiveSim, level, fmtValue, parseValue } from '../core/schlive.js';
import * as V from '../core/values.js';

// ------------------------------------------------------------------ helpers
function sym(doc, type, x, y, params = {}, name) {
  const s = { id: `S${doc.symbols.length + 1}`, type, x, y, rot: 0, mirror: false, name: name || `U${doc.symbols.length + 1}`, params: { ...params } };
  doc.symbols.push(s);
  return s;
}
const pinAt = (doc, s, pin, modules) => { const p = symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0], modules).find(q => q.name === pin); assert.ok(p, `pin ${pin} of ${s.type}`); return { x: p.x, y: p.y }; };
let wid = 0;
const wire = (doc, ...pts) => { const w = { id: `W${++wid}`, points: pts.map(p => ({ ...p })) }; doc.wires.push(w); return w; };
const conn = (doc, a, b, mx = Math.round((a.x + b.x) / 20) * 10) => (a.y === b.y || a.x === b.x ? wire(doc, a, b) : wire(doc, a, { x: mx, y: a.y }, { x: mx, y: b.y }, b));
// an I/O marker wired straight to a pin (inputs on the left, outputs on the right)
function io(doc, s, pin, name, dir, width = 1, modules) {
  const p = pinAt(doc, s, pin, modules);
  const at = { x: p.x + (dir === 'in' ? -40 : 40), y: p.y };
  const port = { id: `P${doc.ports.length + 1}`, name, dir, width, x: at.x, y: at.y };
  doc.ports.push(port);
  wire(doc, at, p);
  return port;
}
const bin = v => V.toBin(v);
const val = (live, portId) => bin(live.portValue(portId));
const byName = (doc, n) => doc.ports.find(p => p.name === n).id;
function build(doc, opts = {}) {
  const r = buildLiveSim(doc, opts);
  assert.deepEqual(r.errors, [], r.code);
  assert.ok(r.ok && r.live);
  return r.live;
}

for (const lang of ['vhdl', 'verilog']) {
  test(`${lang}: gates — every net follows the inputs`, () => {
    const doc = newDoc('gates', lang);
    const g1 = sym(doc, 'and2', 200, 100), g2 = sym(doc, 'xor2', 200, 300), g3 = sym(doc, 'inv', 420, 100);
    io(doc, g1, 'I0', 'a', 'in'); io(doc, g1, 'I1', 'b', 'in');
    io(doc, g2, 'I0', 'c', 'in'); io(doc, g2, 'I1', 'd', 'in');
    const internal = conn(doc, pinAt(doc, g1, 'O'), pinAt(doc, g3, 'I'));
    io(doc, g3, 'O', 'y', 'out'); io(doc, g2, 'O', 'z', 'out');
    const live = build(doc);
    const net = live.nl.wireNet.get(internal.id);
    assert.ok(live.netSig.get(net.id), 'internal net mapped to a signal');
    assert.equal(live.inputs.length, 4);
    assert.ok(live.inputs.every(i => !i.clock));
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(n => byName(doc, n));
    assert.equal(bin(live.netValue(net)), '0');
    assert.equal(val(live, byName(doc, 'y')), '1');
    live.set(a, 1n); live.set(b, 1n);
    assert.equal(bin(live.netValue(net)), '1');
    assert.equal(level(live.netValue(net)), '1');
    assert.equal(val(live, byName(doc, 'y')), '0');
    assert.equal(bin(live.pinValue(g3.id, 'I')), '1');
    assert.equal(bin(live.pinValue(g3.id, 'O')), '0');
    live.toggle(b);
    assert.equal(val(live, byName(doc, 'y')), '1');
    live.set(c, 1n);
    assert.equal(val(live, byName(doc, 'z')), '1');
    live.set(d, 1n);
    assert.equal(val(live, byName(doc, 'z')), '0');
    // snapshot: one entry per net, changes when a value changes
    const s0 = live.snapshot();
    live.toggle(d);
    const s1 = live.snapshot();
    assert.equal(s0.size, live.nl.nets.length);
    const changed = [...s1].filter(([k, v]) => s0.get(k) !== v).map(([k]) => k);
    assert.ok(changed.length >= 2 && changed.length <= 3, `changed nets: ${changed}`);
  });

  test(`${lang}: 2:1 mux`, () => {
    const doc = newDoc('mux', lang);
    const m = sym(doc, 'mux2', 200, 100, { width: 1 });
    io(doc, m, 'D0', 'd0', 'in'); io(doc, m, 'D1', 'd1', 'in'); io(doc, m, 'S0', 's', 'in'); io(doc, m, 'O', 'o', 'out');
    const live = build(doc);
    const [d0, d1, s, o] = ['d0', 'd1', 's', 'o'].map(n => byName(doc, n));
    live.set(d1, 1n);
    assert.equal(val(live, o), '0');
    live.set(s, 1n);
    assert.equal(val(live, o), '1');
    live.set(d0, 1n); live.set(d1, 0n);
    assert.equal(val(live, o), '0');
    live.set(s, 0n);
    assert.equal(val(live, o), '1');
  });

  test(`${lang}: 4-bit bus adder with carry out`, () => {
    const doc = newDoc('adder4', lang);
    const ad = sym(doc, 'add', 200, 100, { width: 4, cout: true });
    io(doc, ad, 'A', 'a', 'in', 4); io(doc, ad, 'B', 'b', 'in', 4);
    io(doc, ad, 'S', 's', 'out', 4); io(doc, ad, 'CO', 'co', 'out');
    const live = build(doc);
    const [a, b, s, co] = ['a', 'b', 's', 'co'].map(n => byName(doc, n));
    assert.equal(live.input(a).width, 4);
    live.set(a, 5n); live.set(b, 6n);
    assert.equal(fmtValue(live.portValue(s)), 'B');
    assert.equal(fmtValue(live.portValue(s), 'dec'), '11');
    assert.equal(fmtValue(live.portValue(s), 'bin'), '1011');
    assert.equal(val(live, co), '0');
    live.set(b, 0xcn);
    assert.equal(fmtValue(live.portValue(s), 'dec'), '1');
    assert.equal(val(live, co), '1');
    // the bus net of A carries the 4-bit value
    const na = live.nl.portNet.get(a);
    assert.equal(live.netValue(na).w, 4);
    assert.equal(fmtValue(live.netValue(na)), '5');
    live.toggle(a);            // a bus input: +1
    assert.equal(fmtValue(live.portValue(a)), '6');
    live.set(a, 0x1fn);        // wraps to the width
    assert.equal(fmtValue(live.portValue(a)), 'F');
  });

  test(`${lang}: D flip-flop — clock detected, one value per step, stored value`, () => {
    const doc = newDoc('dff', lang);
    const ff = sym(doc, 'fd', 200, 100);
    // a toggle flip-flop made of an FD and an inverter feeding Q back to D
    const t = sym(doc, 'fd', 200, 300, {}, 'TFF');
    const inv = sym(doc, 'inv', 400, 400);
    io(doc, ff, 'D', 'd', 'in'); io(doc, ff, 'C', 'clk', 'in');
    io(doc, ff, 'Q', 'q', 'out');
    const qt = pinAt(doc, t, 'Q');
    io(doc, t, 'Q', 'qt', 'out');
    conn(doc, { x: qt.x + 40, y: qt.y }, pinAt(doc, inv, 'I'), qt.x + 20);
    const ti = pinAt(doc, inv, 'O');
    wire(doc, ti, { x: ti.x + 20, y: ti.y }, { x: ti.x + 20, y: 460 }, { x: 150, y: 460 }, { x: 150, y: pinAt(doc, t, 'D').y }, pinAt(doc, t, 'D'));
    const tc = pinAt(doc, t, 'C');
    doc.labels.push({ id: 'L1', x: tc.x - 20, y: tc.y, net: 'clk' });
    wire(doc, { x: tc.x - 40, y: tc.y }, tc);
    const live = build(doc);
    const [d, clk, q, qtp] = ['d', 'clk', 'q', 'qt'].map(n => byName(doc, n));
    assert.deepEqual(live.inputs.filter(i => i.clock).map(i => i.name), ['clk']);
    assert.equal(val(live, q), '0');                // INIT 0
    assert.equal(bin(live.stored(ff.id)), '0');
    assert.equal(live.stored(inv.id), null);         // not a register
    live.set(d, 1n);
    assert.equal(val(live, q), '0', 'D alone does not change Q');
    live.cycle(clk);
    assert.equal(val(live, q), '1');
    assert.equal(bin(live.stored(ff.id)), '1');
    assert.equal(val(live, qtp), '1');
    live.cycle(clk);
    assert.equal(val(live, qtp), '0');
    live.cycle(clk);
    assert.equal(val(live, qtp), '1');
    assert.equal(live.input(clk).value, 0n, 'a step ends with the clock low');
    const t0 = live.now;
    assert.ok(t0 > 0);
    // power cycle: time 0, registers back to INIT, inputs keep their values
    live.reset();
    assert.ok(live.now < t0, 'back to time 0');
    assert.equal(val(live, q), '0');
    assert.equal(val(live, qtp), '0');
    assert.equal(live.input(d).value, 1n);
  });

  test(`${lang}: counter with asynchronous clear`, () => {
    const doc = newDoc('cnt', lang);
    const c = sym(doc, 'counter', 200, 100, { width: 4, en: true, reset: 'async' });
    io(doc, c, 'CE', 'en', 'in'); io(doc, c, 'C', 'clk', 'in'); io(doc, c, 'CLR', 'rst', 'in');
    io(doc, c, 'Q', 'count', 'out', 4);
    const live = build(doc);
    const [en, clk, rst, count] = ['en', 'clk', 'rst', 'count'].map(n => byName(doc, n));
    assert.deepEqual(live.inputs.filter(i => i.clock).map(i => i.name), ['clk']);
    live.cycle(clk);
    assert.equal(fmtValue(live.portValue(count)), '0', 'not enabled');
    live.set(en, 1n);
    for (let k = 0; k < 3; k++) live.cycle(clk);
    assert.equal(fmtValue(live.portValue(count)), '3');
    assert.equal(fmtValue(live.stored(c.id)), '3');
    live.cycles([clk], 14);
    assert.equal(fmtValue(live.portValue(count)), '1', 'wraps around');
    live.set(rst, 1n);
    assert.equal(fmtValue(live.portValue(count)), '0', 'asynchronous clear, no clock');
  });

  test(`${lang}: module symbol — instance port values, open output read from the instance`, () => {
    const sub = lang === 'vhdl'
      ? { 'src/half.vhd': 'library ieee; use ieee.std_logic_1164.all;\nentity half is port (x, y : in std_logic; s, c : out std_logic); end;\narchitecture a of half is begin s <= x xor y; c <= x and y; end;' }
      : { 'src/half.v': 'module half(input x, input y, output s, output c); assign s = x ^ y; assign c = x & y; endmodule' };
    const sources = Object.entries(sub).map(([path, text]) => ({ path, text }));
    const modules = modulesFromLibrary(compile(sources), { sources: sub });
    const doc = newDoc('wrap', lang);
    const h = sym(doc, 'module', 300, 100, { module: 'half', generics: {} }, 'u_half');
    io(doc, h, 'x', 'a', 'in', 1, modules); io(doc, h, 'y', 'b', 'in', 1, modules);
    io(doc, h, 's', 'sum', 'out', 1, modules);       // c left open
    const r = buildLiveSim(doc, { modules, sources });
    assert.deepEqual(r.errors, []);
    const live = r.live;
    const [a, b, sum] = ['a', 'b', 'sum'].map(n => byName(doc, n));
    live.set(a, 1n);
    assert.equal(val(live, sum), '1');
    assert.equal(bin(live.pinValue(h.id, 'c')), '0');
    live.set(b, 1n);
    assert.equal(val(live, sum), '0');
    assert.equal(bin(live.pinValue(h.id, 'c')), '1', 'open output: the instance port');
    assert.deepEqual(live.instancePorts(h.id).map(p => `${p.name}:${p.dir}=${bin(p.value)}`), ['x:in=1', 'y:in=1', 's:out=0', 'c:out=1']);
    // without the module's source the simulation is refused with the reason
    const r2 = buildLiveSim(doc, { modules, sources: [] });
    assert.equal(r2.ok, false);
    assert.match(r2.errors.join('\n'), /half/);
  });

  test(`${lang}: the HDL file the schematic is linked to is replaced by the schematic`, () => {
    const doc = newDoc('linked', lang);
    const g = sym(doc, 'or2', 200, 100);
    io(doc, g, 'I0', 'a', 'in'); io(doc, g, 'I1', 'b', 'in'); io(doc, g, 'O', 'y', 'out');
    doc.generatedFile = lang === 'vhdl' ? 'src/linked.vhd' : 'src/linked.v';
    // a stale (and broken) copy of the module in the project
    const stale = lang === 'vhdl' ? 'entity linked is port (a : in bit); end; architecture x of linked is begin oops; end;' : 'module linked(input a); oops endmodule';
    const live = build(doc, { sources: [{ path: doc.generatedFile, text: stale }, { path: 'src/other_copy.' + (lang === 'vhdl' ? 'vhd' : 'v'), text: stale }] });
    live.set(byName(doc, 'b'), 1n);
    assert.equal(val(live, byName(doc, 'y')), '1');
  });
}

test('X / Z values: an undriven net, a constant, levels and text', () => {
  const doc = newDoc('xz', 'vhdl');
  const g = sym(doc, 'and2', 200, 100);
  io(doc, g, 'I0', 'a', 'in');
  const i1 = pinAt(doc, g, 'I1');
  doc.labels.push({ id: 'L1', x: i1.x - 20, y: i1.y, net: 'floating' });
  wire(doc, { x: i1.x - 40, y: i1.y }, i1);
  io(doc, g, 'O', 'y', 'out');
  const r = buildLiveSim(doc);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.ok(r.warnings.some(w => /no driver/.test(w)), r.warnings.join('\n'));
  const live = r.live;
  live.set(byName(doc, 'a'), 1n);
  assert.equal(level(live.portValue(byName(doc, 'y'))), 'x', 'U and 1 = X');
  assert.equal(level(live.netValue(live.nl.labelNet.get('L1'))), 'x');
  assert.equal(level(V.fromBits('zz')), 'z');
  assert.equal(level(V.fromBits('0z')), 'x');
  assert.equal(level(V.fromBits('000')), '0');
  assert.equal(level(V.fromBits('010')), '1');
  assert.equal(level(null), null);
  assert.equal(fmtValue(V.fromBits('1x')), 'X');
  assert.equal(fmtValue(V.fromBits('1x'), 'bin'), '1X');
  assert.equal(fmtValue(V.fromBits('z')), 'Z');
  assert.equal(fmtValue(V.fromBits('1010x'), 'dec'), 'X');
});

test('parseValue: hex, binary and decimal spellings, wrapped to the width', () => {
  assert.equal(parseValue('0x1F', 8), 31n);
  assert.equal(parseValue('1Fh', 8), 31n);
  assert.equal(parseValue('#ff', 8), 255n);
  assert.equal(parseValue('0b101', 8), 5n);
  assert.equal(parseValue('101', 8, 'bin'), 5n);
  assert.equal(parseValue('101b', 8), 5n);
  assert.equal(parseValue('12', 8), 12n);
  assert.equal(parseValue('12', 8, 'hex'), 18n);
  assert.equal(parseValue('-1', 4), 15n);
  assert.equal(parseValue('300', 8), 44n);
  assert.equal(parseValue('1_0000', 8, 'bin'), 16n);
  assert.equal(parseValue('zz', 8), null);
  assert.equal(parseValue('', 8), null);
  assert.equal(parseValue('12', 8, 'bin'), null);
});

test('errors refuse the simulation with the message: two drivers, an empty sheet', () => {
  const doc = newDoc('bad', 'vhdl');
  const g1 = sym(doc, 'inv', 200, 100), g2 = sym(doc, 'inv', 200, 200);
  io(doc, g1, 'I', 'a', 'in'); io(doc, g2, 'I', 'b', 'in');
  const o1 = pinAt(doc, g1, 'O'), o2 = pinAt(doc, g2, 'O');
  wire(doc, o1, { x: o1.x + 30, y: o1.y }, { x: o1.x + 30, y: o2.y }, o2);
  const r = buildLiveSim(doc);
  assert.equal(r.ok, false);
  assert.equal(r.live, null);
  assert.match(r.errors.join('\n'), /2 drivers/);
  const e = buildLiveSim(newDoc('empty', 'vhdl'));
  assert.equal(e.ok, false);
  assert.match(e.errors[0], /empty/);
});

test('hundreds of symbols: build and a settle stay fast', () => {
  const doc = newDoc('chain', 'vhdl');
  let prev = null, first = null;
  for (let i = 0; i < 300; i++) {
    const s = sym(doc, 'inv', 100 + (i % 20) * 80, 100 + Math.floor(i / 20) * 60);
    if (prev) { const o = pinAt(doc, prev, 'O'), n = pinAt(doc, s, 'I'); wire(doc, o, { x: o.x, y: o.y + 30 }, { x: n.x - 10, y: o.y + 30 }, { x: n.x - 10, y: n.y }, n); }
    else first = s;
    prev = s;
  }
  io(doc, first, 'I', 'a', 'in');
  io(doc, prev, 'O', 'y', 'out');
  const t0 = Date.now();
  const live = build(doc);
  const tBuild = Date.now() - t0;
  const t1 = Date.now();
  for (let k = 0; k < 20; k++) live.toggle(byName(doc, 'a'));
  const tRun = Date.now() - t1;
  assert.equal(val(live, byName(doc, 'y')), '0');    // 300 inverters (even), a = 0
  live.toggle(byName(doc, 'a'));
  assert.equal(val(live, byName(doc, 'y')), '1');
  assert.ok(tBuild < 5000, `build ${tBuild} ms`);
  assert.ok(tRun < 3000, `20 toggles ${tRun} ms`);
  const t2 = Date.now();
  live.snapshot();
  assert.ok(Date.now() - t2 < 500);
});

// the blinky example converted to schematics (Convert to Schematic): HDL blocks, linked HDL files,
// module symbols of the other (mixed-language) project modules
const BLINKY = new URL('../examples/blinky/src/', import.meta.url);
const blinky = () => fs.readdirSync(BLINKY).filter(f => /\.(vhd|v)$/.test(f)).map(f => ({ path: `src/${f}`, text: fs.readFileSync(new URL(f, BLINKY), 'utf8') }));

test('converted schematic (knight: process as an HDL block, enum state): clock detected, LEDs shift per step', async () => {
  const sources = blinky();
  const files = Object.fromEntries(sources.map(s => [s.path, s.text]));
  const lib = compile(sources);
  const modules = modulesFromLibrary(lib, { sources: files });
  const doc = await schematicFromHdl(elaborate(lib, 'knight').top, { sources: files, modules, lang: 'vhdl' });
  doc.generatedFile = 'src/knight.vhd';
  const live = build(doc, { modules, sources });
  const [clk, rst, step, mode] = ['clk', 'rst', 'step', 'mode'].map(n => byName(doc, n));
  const leds = byName(doc, 'leds');
  assert.deepEqual(live.inputs.filter(i => i.clock).map(i => i.name), ['clk']);
  assert.equal(fmtValue(live.portValue(leds), 'bin'), '00000001');
  live.cycle(clk);
  assert.equal(fmtValue(live.portValue(leds), 'bin'), '00000001', 'no step');
  live.set(step, 1n);
  live.cycles([clk], 3);
  assert.equal(fmtValue(live.portValue(leds), 'bin'), '00001000');
  live.set(mode, 1n);
  assert.equal(fmtValue(live.portValue(leds), 'dec'), '3', 'binary counter mode');
  live.set(rst, 1n); live.cycle(clk);
  assert.equal(fmtValue(live.portValue(leds), 'dec'), '0');
});

test('converted schematic of a mixed-language top (VHDL + Verilog + ASM modules): builds and runs', async () => {
  const sources = blinky();
  const files = Object.fromEntries(sources.map(s => [s.path, s.text]));
  const lib = compile(sources);
  const modules = modulesFromLibrary(lib, { sources: files });
  const doc = await schematicFromHdl(elaborate(lib, 'top').top, { sources: files, modules, lang: 'vhdl' });
  doc.generatedFile = 'src/top.vhd';
  assert.ok(doc.symbols.some(s => s.type === 'module' && s.params.module === 'prescaler'));
  const live = build(doc, { modules, sources });
  const clk = byName(doc, 'clk'), sw = byName(doc, 'sw'), led = byName(doc, 'led');
  assert.deepEqual(live.inputs.map(i => `${i.name}${i.clock ? ':clock' : ''}`), ['clk:clock', 'sw', 'btn']);
  live.set(sw, 1n); live.cycle(clk); live.set(sw, 0n);
  assert.equal(fmtValue(live.portValue(led), 'bin'), '00000001');
  live.set(sw, 0b1000n);                     // sw(3) inverts the LEDs
  assert.equal(fmtValue(live.portValue(led), 'bin'), '11111110');
  // a module symbol shows its instance's port values
  const pre = doc.symbols.find(s => s.type === 'module' && s.params.module === 'prescaler');
  assert.deepEqual(live.instancePorts(pre.id).map(p => p.name), ['clk', 'rst', 'tick']);
});

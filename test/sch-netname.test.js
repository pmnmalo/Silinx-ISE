// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
//
// #689: two wires with the same net name are one net, connected by name without a wire drawn between them
// (as in ISE, and as the gates example uses it); netByName finds the net a new name would join, so that
// the editor asks before joining them. The generated VHDL and Verilog have a single signal, and simulate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simulate } from '../core/compile.js';
import { copySchematic, pasteSchematic } from '../core/schclip.js';
import { newDoc, netlist, generateHdl, netByName, renameNet, netShort } from '../core/schdoc.js';

const P = (x, y) => ({ x, y });
const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });
// a -> U1 -> a wire named s; another wire named s, not drawn to it -> U2 -> y: y = a
function byName(lang, second = 's') {
  const doc = newDoc('byname', lang);
  doc.symbols.push(inv('S1', 'U1', 80, 90), inv('S2', 'U2', 80, 290));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 220, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(80, 100)] }, { id: 'W2', points: [P(160, 100), P(220, 100)] },
    { id: 'W3', points: [P(40, 300), P(80, 300)] }, { id: 'W4', points: [P(160, 300), P(220, 300)] });
  doc.labels.push({ id: 'L1', x: 200, y: 100, net: 's' }, { id: 'L2', x: 60, y: 300, net: second });
  return doc;
}
const nets = nl => nl.nets.map(n => n.endpoints.map(e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`)).sort().join(' ')).filter(s => s.includes(' ')).sort();

test('#689 netByName: the other net a name would join (net names and I/O markers; the base of a bus name; VHDL case-insensitive)', () => {
  const doc = byName('vhdl', 't');
  const nl = netlist(doc);
  const w2 = nl.wireNet.get('W2'), w3 = nl.wireNet.get('W3'), w1 = nl.wireNet.get('W1');
  assert.equal(netByName(doc, nl, 's', w3), w2, "W3 named s would join W2's net");
  assert.equal(netByName(doc, nl, 'S', w3), w2, 'VHDL: S is s');
  assert.equal(netByName(doc, nl, 's(3:0)', w3), w2, 'the base of a bus name');
  assert.equal(netByName(doc, nl, 'a', w3), w1, "an I/O marker's name");
  assert.equal(netByName(doc, nl, 's', w2), null, 'its own name: no other net');
  assert.equal(netByName(doc, nl, 'u', w3), null, 'a new name');
  assert.equal(netByName(doc, nl, '', w3), null);
  const v = byName('verilog', 't');
  const vn = netlist(v);
  assert.equal(netByName(v, vn, 'S', vn.wireNet.get('W3')), null, 'Verilog: S is not s');
  assert.equal(netByName(v, vn, 's', vn.wireNet.get('W3')), vn.wireNet.get('W2'));
});

test('#689 two wires with the same net name: one net (no warnings); different names: two nets', () => {
  const nl = netlist(byName('vhdl'));
  assert.deepEqual(nets(nl), ['S1.I port:P1', 'S1.O S2.I', 'S2.O port:P2']);
  assert.equal(nl.wireNet.get('W2'), nl.wireNet.get('W3'));
  assert.equal(nl.wireNet.get('W2').name, 's');
  assert.deepEqual(nl.diagnostics.map(d => d.message), [], 'no warnings');
  const apart = netlist(byName('vhdl', 't'));
  assert.notEqual(apart.wireNet.get('W2'), apart.wireNet.get('W3'));
  assert.deepEqual(apart.diagnostics.map(d => d.message).sort(), ["net 's' connects only U1.O", "net 't' connects only U2.I", "net 't' has no driver (read by U2.I)"]);
  // the gates example connects its nets by name this way (a, b, c, d, prime_sop, prime_nand on two wires each)
  const gates = JSON.parse(fs.readFileSync(new URL('../examples/gates/src/gates.sch.json', import.meta.url), 'utf8'));
  const gn = netlist(gates);
  for (const name of ['a', 'b', 'c', 'd', 'prime_sop', 'prime_nand']) {
    const ls = gates.labels.filter(l => l.net === name);
    assert.equal(ls.length, 2, name);
    assert.equal(gn.labelNet.get(ls[0].id), gn.labelNet.get(ls[1].id), `${name}: one net`);
  }
});

const TB = {
  vhdl: `library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture t of tb is
  signal a, y : std_logic := '0';
begin
  uut: entity work.byname port map (a => a, y => y);
  process begin
    a <= '0'; wait for 10 ns; assert y = '0' report "a=0" severity error;
    a <= '1'; wait for 10 ns; assert y = '1' report "a=1" severity error;
    report "done"; wait;
  end process;
end t;
`,
  verilog: `\`timescale 1ns/1ps
module tb;
  reg a = 0;
  wire y;
  byname uut (.a(a), .y(y));
  initial begin
    a = 0; #10; if (y !== 0) $error("a=0");
    a = 1; #10; if (y !== 1) $error("a=1");
    $display("done"); $finish;
  end
endmodule
`,
};
test('#689 connected by name: the VHDL and the Verilog have one signal s, compiled and simulated (y = a)', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateHdl(byName(lang), { lang });
    assert.deepEqual(g.diagnostics.map(d => d.message), [], `${lang}: no warnings`);
    const decl = lang === 'vhdl' ? /signal s\b[^;]*;/g : /wire s\b[^;]*;/g;
    assert.equal((g.code.match(decl) || []).length, 1, `${lang}: one signal s\n${g.code}`);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const r = simulate([{ path: `byname.${ext}`, text: g.code }, { path: `tb.${ext}`, text: TB[lang] }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors.map(e => e.message), [], `${lang}: compiles\n${g.code}`);
    const log = r.sim.log.map(l => `${l.kind}:${l.text}`);
    assert.deepEqual(r.sim.log.filter(l => l.kind === 'error' || l.kind === 'failure'), [], `${lang}: ${log.join('\n')}`);
    assert.ok(log.some(l => /done/.test(l)), `${lang}: ran to the end: ${log.join('\n')}`);
  }
});

// #734: a net connected by name renamed as a whole: its net names and its I/O marker of the old name
test('#734 renameNet: every net name of the set takes the new name (VHDL: any case), each its own bus range; still one net, and it simulates', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = byName(lang, lang === 'vhdl' ? 'S' : 's');   // (VHDL: S is s)
    const nl = netlist(doc);
    const r = renameNet(doc, nl, nl.labelNet.get('L1'), 'q', 'L1');
    assert.deepEqual([r.labels.map(l => l.id), r.ports.length], [['L1', 'L2'], 0], lang);
    assert.deepEqual(doc.labels.map(l => l.net), ['q', 'q'], lang);
    const after = netlist(doc);
    assert.equal(after.wireNet.get('W2'), after.wireNet.get('W3'), `${lang}: still one net`);
    assert.deepEqual(after.diagnostics.map(d => d.message), [], `${lang}: no warnings`);
    const g = generateHdl(doc);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const sim = simulate([{ path: `byname.${ext}`, text: g.code }, { path: `tb.${ext}`, text: TB[lang] }], 'tb', { until: 1e6 });
    assert.deepEqual(sim.errors.map(e => e.message), [], `${lang}: compiles\n${g.code}`);
    assert.deepEqual(sim.sim.log.filter(l => l.kind === 'error' || l.kind === 'failure'), [], lang);
  }
  // Verilog: S and s are two names, two nets: S is left alone
  const v = byName('verilog', 'S');
  const vr = renameNet(v, netlist(v), netlist(v).labelNet.get('L1'), 'q', 'L1');
  assert.deepEqual([vr.labels.length, v.labels.map(l => l.net)], [1, ['q', 'S']]);
});

test('#734 renameNet: a bus keeps each label\'s range; another name on the same net and a new name of nothing are left alone', () => {
  const doc = byName('vhdl');
  doc.labels[0].net = 'd(3:0)'; doc.labels[1].net = 'd(3:0)';
  doc.labels.push({ id: 'L3', x: 180, y: 100, net: 'other' });   // a second name on W2's net
  const nl = netlist(doc);
  const r = renameNet(doc, nl, nl.labelNet.get('L2'), 'q', 'L2');
  assert.deepEqual(doc.labels.map(l => l.net), ['q(3:0)', 'q', 'other']);
  assert.deepEqual(r.labels.map(l => l.id), ['L1', 'L2']);
  assert.deepEqual(renameNet(doc, nl, null, 'x'), { labels: [], ports: [] });
  assert.deepEqual(renameNet(doc, nl, nl.labelNet.get('L1'), 'bad name!'), { labels: [], ports: [] });
});

test('#734 renameNet: a net named like an I/O marker renames the marker too (a port of the module)', () => {
  const doc = byName('vhdl', 'a');   // W3's net named a: connected by name to the input marker a
  const nl = netlist(doc);
  assert.equal(nl.labelNet.get('L2'), nl.wireNet.get('W1'), 'one net with the marker');
  const r = renameNet(doc, nl, nl.labelNet.get('L2'), 'b', 'L2');
  assert.deepEqual([r.labels.map(l => l.id), r.ports.map(p => p.id)], [['L2'], ['P1']]);
  assert.deepEqual([doc.ports.map(p => p.name), doc.labels.map(l => l.net)], [['b', 'y'], ['s', 'b']]);
  const after = netlist(doc);
  assert.equal(after.labelNet.get('L2'), after.wireNet.get('W1'), 'still connected to the marker');
  assert.match(generateHdl(doc).code, /\bb\s*:\s*in\b/i);
});

// #754: a wire drawn from W2's net (s) to W3's net is a short when W3's net has another name of its own, as ISE's
// schematic editor says ("Wire would create a short between net x and net y"); the editor refuses it
const W5 = { id: 'W5', points: [P(220, 100), P(220, 200), P(40, 200), P(40, 300)] };
const wired = (doc, w = W5) => { const d = structuredClone(doc); d.wires.push(structuredClone(w)); return d; };
const named = (lang, second) => { const d = byName(lang, second); if (second == null) d.labels.pop(); return d; };

test('#754 netShort: a wire between two nets of different names (net names, I/O markers) is a short', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = named(lang, 't');
    assert.deepEqual(netShort(doc, wired(doc)), ['s', 't'], `${lang}: s and t`);
    // the same wire in the old code: one net with two names, an error found only later
    assert.deepEqual(netlist(wired(doc)).diagnostics.map(d => d.message), ['net has several names: s, t'], lang);
    // a net named after the input marker a, joined to s: a short too
    const a = named(lang, 'a');
    assert.deepEqual(netShort(a, wired(a)), ['s', 'a'], `${lang}: s and the marker a`);
  }
  // two input markers on one net: a short (each marker names its net)
  const doc = named('vhdl', null);
  doc.ports.push({ id: 'P3', name: 'b', dir: 'in', width: 1, x: 40, y: 300 });
  doc.wires = doc.wires.filter(w => w.id !== 'W3').concat({ id: 'W3', points: [P(40, 300), P(100, 300)] });
  const w1 = { id: 'W6', points: [P(60, 100), P(60, 200), P(40, 200), P(40, 300)] };
  assert.deepEqual(netShort(doc, wired(doc, w1)), ['a', 'b']);
});

test('#754 netShort: not a short: the same name (VHDL: any case), an unnamed net, an output marker on an input\'s net, names one net already had', () => {
  const same = named('vhdl', 'S');
  assert.equal(netShort(same, wired(same)), null, 'VHDL: S is s, already one net');
  const v = named('verilog', 'S');
  assert.deepEqual(netShort(v, wired(v)), ['s', 'S'], 'Verilog: S is not s');
  const unnamed = named('vhdl', null);
  assert.equal(netShort(unnamed, wired(unnamed)), null, 'an unnamed net takes the name s');
  assert.equal(netShort(unnamed, unnamed), null, 'nothing joined');
  // an output marker on the input marker's net: y <= a, as the HDL assigns it
  const fed = named('vhdl', null);
  fed.ports.push({ id: 'P3', name: 'z', dir: 'out', width: 1, x: 60, y: 160 });
  assert.equal(netShort(fed, wired(fed, { id: 'W6', points: [P(60, 100), P(60, 160)] })), null, 'an output marker joined');
  // a net that already had two names (an older document), extended by a wire to U3's input
  const old = wired(named('vhdl', 't'));
  old.symbols.push(inv('S3', 'U3', 300, 190));
  const ext = wired(old, { id: 'W7', points: [P(220, 100), P(300, 100), P(300, 200)] });
  const en = netlist(ext);
  assert.equal(en.wireNet.get('W7'), en.wireNet.get('W3'), 'W7 on the net of s and t');
  assert.equal(netShort(old, ext), null, 'no new short');
});

test('#754 a wire to an unnamed net (allowed): the VHDL and the Verilog compile and simulate (y = a), no warnings', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = wired(named(lang, null));
    assert.deepEqual(netlist(doc).diagnostics.map(d => d.message), [], `${lang}: no warnings`);
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics.map(d => d.message), [], `${lang}: no warnings`);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const r = simulate([{ path: `byname.${ext}`, text: g.code }, { path: `tb.${ext}`, text: TB[lang] }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors.map(e => e.message), [], `${lang}: compiles\n${g.code}`);
    const log = r.sim.log.map(l => `${l.kind}:${l.text}`);
    assert.deepEqual(r.sim.log.filter(l => l.kind === 'error' || l.kind === 'failure'), [], `${lang}: ${log.join('\n')}`);
    assert.ok(log.some(l => /done/.test(l)), `${lang}: ran to the end`);
  }
});

// #806: the same short made by a move (W3 and its name t moved onto W2's end) or by a paste (a copy of W3 there):
// what the editor compares, the schematic before and after
test('#806 netShort: a wire moved, or pasted, onto another named net\'s end is a short; moved with the same name, not', () => {
  const doc = named('vhdl', 't');
  const moved = structuredClone(doc);
  moved.wires.find(w => w.id === 'W3').points = [P(220, 100), P(280, 100)];
  moved.labels.find(l => l.id === 'L2').x = 240; moved.labels.find(l => l.id === 'L2').y = 100;
  assert.deepEqual(netShort(doc, moved), ['s', 't'], 'moved');
  const s2 = named('vhdl', 's'), m2 = structuredClone(s2);
  m2.wires.find(w => w.id === 'W3').points = [P(220, 100), P(280, 100)];
  m2.labels.find(l => l.id === 'L2').x = 240; m2.labels.find(l => l.id === 'L2').y = 100;
  assert.equal(netShort(s2, m2), null, 'the same name s: no short');
  // a copy of W3 (its name t, pasted as t_1) 180 right and 200 up: its start on W2's end
  const pasted = structuredClone(doc);
  const r = pasteSchematic(pasted, copySchematic(doc, { wires: ['W3'], labels: ['L2'] }), { dx: 180, dy: -200 });
  assert.deepEqual(r.renamed.nets.get('t'), 't_1');
  assert.deepEqual(netShort(doc, pasted), ['s', 't_1'], 'pasted');
});

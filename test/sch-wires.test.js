// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
//
// #678: a schematic wire connects at its ends only. A wire passing over a pin, an I/O marker, another
// wire's end or bend does not connect to it (no net with two drivers just because a wire was drawn
// across a symbol); a connection made in the middle of a wire (a wire ended on its segment, a symbol
// dropped onto it, #170) splits that wire there (splitWiresAt). A document saved before (version 2) is
// converted with its nets kept; the generated VHDL and Verilog have the right nets, and simulate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import * as V from '../core/values.js';
import { newDoc, normalizeDoc, netlist, generateHdl, symbolPins, splitWiresAt, joinOnWires, DOC_VERSION } from '../core/schdoc.js';

const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });
const pin = (doc, id, name) => { const s = doc.symbols.find(q => q.id === id); return symbolPins(s, {}).find(p => p.name === name); };
const P = (x, y) => ({ x, y });
// the nets as sets of their pins / markers (and labels), sorted: the reference to compare with
const nets = nl => nl.nets.map(n => n.endpoints.map(e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`)).sort().join(' ')).filter(s => s.includes(' ')).sort();
const messages = nl => nl.diagnostics.map(d => `${d.severity}: ${d.message}`);

// Two inverters, y = not a and z = not b. The wire from U1.O to the marker y runs down x = 300, over
// U2's output pin (300, 250), where U2's own wire to z starts: before #678 all of it one net, with two
// drivers (U1.O, U2.O).
function crossing(lang = 'vhdl') {
  const doc = newDoc('cross', lang);
  doc.symbols.push(inv('S1', 'U1', 80, 90), inv('S2', 'U2', 220, 240));
  const o1 = pin(doc, 'S1', 'O'), i1 = pin(doc, 'S1', 'I'), o2 = pin(doc, 'S2', 'O'), i2 = pin(doc, 'S2', 'I');
  assert.deepEqual([o1, o2].map(p => [p.x, p.y]), [[160, 100], [300, 250]]);
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: i1.x - 40, y: i1.y }, { id: 'P2', name: 'b', dir: 'in', width: 1, x: i2.x - 40, y: i2.y },
    { id: 'P3', name: 'y', dir: 'out', width: 1, x: 500, y: 400 }, { id: 'P4', name: 'z', dir: 'out', width: 1, x: 500, y: 250 });
  doc.wires.push(
    { id: 'W1', points: [P(i1.x - 40, i1.y), P(i1.x, i1.y)] },
    { id: 'W2', points: [P(i2.x - 40, i2.y), P(i2.x, i2.y)] },
    { id: 'W3', points: [P(160, 100), P(300, 100), P(300, 400), P(500, 400)] },   // over U2.O
    { id: 'W4', points: [P(300, 250), P(500, 250)] });                            // from U2.O, its end on W3
  return doc;
}

test('#678 a wire passing over a pin and over another wire\'s end does not connect to them: no second driver', () => {
  const doc = crossing();
  const nl = netlist(doc);
  assert.deepEqual(nets(nl), ['S1.I port:P1', 'S1.O port:P3', 'S2.I port:P2', 'S2.O port:P4']);
  assert.deepEqual(messages(nl), [], 'no warnings');
  assert.deepEqual(nl.junctions, [], 'no dot where it only crosses');
  // the same in a document saved before #678 (version 2): there, connected (its nets kept as they were)
  const old = netlist({ ...crossing(), version: 2 });
  assert.deepEqual(nets(old), ['S1.I port:P1', 'S1.O S2.O port:P3 port:P4', 'S2.I port:P2']);
  assert.deepEqual(messages(old), ["error: net 'y' has 2 drivers (U1.O, U2.O)"]);
});

test('#678 the ends connect: a wire ended on a pin, on a marker, on another wire\'s end; a bend does not', () => {
  const doc = newDoc('ends', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 80, 90), inv('S2', 'U2', 300, 90), inv('S3', 'U3', 300, 290));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 });
  doc.wires.push(
    { id: 'W1', points: [P(60, 100), P(80, 100)] },                 // marker a -> U1.I
    { id: 'W2', points: [P(160, 100), P(230, 100)] },                // U1.O -> (230, 100) ...
    { id: 'W3', points: [P(230, 100), P(300, 100)] },                // ... end to end -> U2.I
    { id: 'W4', points: [P(230, 100), P(230, 300), P(300, 300)] },   // a third end there -> U3.I: a dot
    // a wire whose bend is on U2.O (380, 100) and whose ends are free: not connected to it
    { id: 'W5', points: [P(380, 60), P(380, 100), P(440, 100)] });
  const nl = netlist(doc);
  assert.deepEqual(nets(nl), ['S1.I port:P1', 'S1.O S2.I S3.I']);
  assert.equal(nl.wireNet.get('W2'), nl.wireNet.get('W4'));
  assert.notEqual(nl.wireNet.get('W5'), nl.pinNet.get('S2/O'));
  assert.deepEqual(nl.junctions, [{ x: 230, y: 100 }]);
  // (U2.O and U3.O left unconnected: outputs, no warning; W5 a wire of its own)
  assert.deepEqual(messages(nl), ['warning: dangling wire not connected to any pin']);
});

test('#678 two wires crossing at a bend of each, or a segment crossing a bend: not connected', () => {
  const doc = newDoc('bends', 'verilog');
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 300, y: 300 },
    { id: 'P3', name: 'b', dir: 'in', width: 1, x: 100, y: 300 }, { id: 'P4', name: 'z', dir: 'out', width: 1, x: 300, y: 100 },
    { id: 'P5', name: 'c', dir: 'in', width: 1, x: 200, y: 50 }, { id: 'P6', name: 'w', dir: 'out', width: 1, x: 200, y: 350 });
  doc.wires.push(
    { id: 'W1', points: [P(100, 100), P(200, 100), P(200, 200), P(300, 200), P(300, 300)] },
    { id: 'W2', points: [P(100, 300), P(100, 200), P(200, 200), P(200, 150), P(300, 150), P(300, 100)] },   // its bend (200, 200) on W1's bend
    { id: 'W3', points: [P(200, 50), P(250, 50), P(250, 350), P(200, 350)] });                             // through W1 and W2's segments
  const nl = netlist(doc);
  assert.deepEqual(nets(nl), ['port:P1 port:P2', 'port:P3 port:P4', 'port:P5 port:P6']);
  assert.deepEqual(nl.junctions, []);
  assert.deepEqual(messages(nl), [], 'no warnings');
});

test('#678 splitWiresAt: a T-junction (a wire ended on a segment), a symbol dropped onto a wire; the pieces', () => {
  const doc = newDoc('split', 'vhdl');
  doc.wires.push({ id: 'W1', points: [P(100, 100), P(300, 100), P(300, 300)], bus: true }, { id: 'W2', points: [P(0, 0), P(0, 50)] });
  // a point inside a segment, a bend, not on the wire, an end: only the first two split
  assert.deepEqual(splitWiresAt(doc, [P(200, 100)]), [{ id: 'W3', from: 'W1' }]);
  assert.deepEqual(doc.wires.map(w => [w.id, w.points.map(p => `${p.x},${p.y}`).join(' '), !!w.bus]),
    [['W1', '100,100 200,100', true], ['W3', '200,100 300,100 300,300', true], ['W2', '0,0 0,50', false]]);
  assert.deepEqual(splitWiresAt(doc, [P(300, 100)]), [{ id: 'W4', from: 'W3' }]);
  assert.deepEqual(doc.wires.find(w => w.id === 'W4').points, [P(300, 100), P(300, 300)]);
  const before = JSON.stringify(doc);
  assert.deepEqual(splitWiresAt(doc, [P(250, 150), P(100, 100), P(300, 300), P(0, 50)]), []);
  assert.equal(JSON.stringify(doc), before, 'nothing split');
  // only the wires of ids (and their pieces)
  doc.wires.push({ id: 'W9', points: [P(0, 200), P(400, 200)] });
  assert.deepEqual(splitWiresAt(doc, [P(300, 200), P(100, 200)], new Set(['W4'])), [{ id: 'W6', from: 'W4' }]);
  assert.equal(doc.wires.find(w => w.id === 'W9').points.length, 2, 'W9 not split');

  // a wire ended on another's segment: apart until the editor splits it there, then a T with a dot
  const t = newDoc('t', 'vhdl');
  t.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 300, y: 100 },
    { id: 'P3', name: 'z', dir: 'out', width: 1, x: 200, y: 200 });
  t.wires.push({ id: 'W1', points: [P(100, 100), P(300, 100)] }, { id: 'W2', points: [P(200, 200), P(200, 100)] });
  assert.deepEqual(nets(netlist(t)), ['port:P1 port:P2']);
  splitWiresAt(t, [P(200, 100)]);
  const nl = netlist(t);
  assert.deepEqual(nets(nl), ['port:P1 port:P2 port:P3']);
  assert.deepEqual(nl.junctions, [{ x: 200, y: 100 }]);
  assert.deepEqual(messages(nl), [], 'no warnings');
  // a gate dropped with its input pin in the middle of a wire (#170): connected once split at its pins
  const g = crossing();
  g.wires = g.wires.filter(w => w.id !== 'W4');
  g.ports = g.ports.filter(p => p.name !== 'z');
  g.symbols.push(inv('S3', 'U3', 300, 140));   // its input pin (300, 150) on W3
  assert.notEqual(netlist(g).pinNet.get('S3/I'), netlist(g).pinNet.get('S1/O'));
  splitWiresAt(g, symbolPins(g.symbols[2], {}));
  const gn = netlist(g);
  assert.equal(gn.pinNet.get('S3/I'), gn.pinNet.get('S1/O'));
  assert.ok(gn.junctions.some(j => j.x === 300 && j.y === 150), 'a dot at the pin');
  // U2.O still lies on W3 (between the split points): apart
  assert.notEqual(gn.pinNet.get('S2/O'), gn.pinNet.get('S1/O'));
});

test('#678 a document saved before (version 2) keeps its nets: converted on opening, its wires split where they connected', () => {
  // T-junction in a segment, a pin in a segment, two wires sharing a bend, an end on a bend
  const v2 = {
    version: 2, name: 'old', lang: 'vhdl', labels: [{ id: 'L1', x: 250, y: 100, net: 'n' }],
    symbols: [inv('S1', 'U1', 100, 90), inv('S2', 'U2', 400, 290)],
    ports: [{ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 500, y: 100 },
      { id: 'P3', name: 'z', dir: 'out', width: 1, x: 500, y: 250 }, { id: 'P4', name: 'w', dir: 'out', width: 1, x: 300, y: 400 },
      { id: 'P5', name: 'v', dir: 'out', width: 1, x: 100, y: 450 }],
    wires: [
      { id: 'W1', points: [P(60, 100), P(100, 100)] },
      { id: 'W2', points: [P(160, 100), P(500, 100)] },                        // U1.O -> y
      { id: 'W3', points: [P(250, 200), P(250, 100)] },                        // its end on W2's segment (a T)
      { id: 'W4', points: [P(250, 200), P(350, 200), P(350, 300), P(400, 300)] },   // -> U2.I
      { id: 'W5', points: [P(300, 400), P(300, 200)] },                        // marker w, its end on W4's segment
      { id: 'W6', points: [P(100, 450), P(460, 450), P(460, 250), P(500, 250)] },   // through U2.O (460, 300)
    ],
  };
  const want = ['S1.I port:P1', 'S1.O S2.I port:P2 port:P4', 'S2.O port:P3 port:P5'];
  const d = normalizeDoc(v2);
  assert.equal(d.version, DOC_VERSION);
  assert.deepEqual(nets(netlist(d)), want, 'converted');
  assert.deepEqual(nets(netlist(v2)), want, 'netlist() of the document as saved');
  assert.deepEqual(normalizeDoc(d), d, 'converted once: the same again');
  // the wires split at the joints: every connection now at wire ends (the inverters' outputs 20 further, #1988:
  // U1.O's wire lengthened, a wire from U2.O's old place, where W6 was split, to it)
  assert.deepEqual(d.wires.map(w => w.points.map(p => `${p.x},${p.y}`).join(' ')), [
    '60,100 100,100', '180,100 250,100', '250,100 500,100', '250,200 250,100', '250,200 300,200', '300,200 350,200 350,300 400,300',
    '300,400 300,200', '100,450 460,450 460,300', '460,300 460,250 500,250', '460,300 480,300']);
  // its HDL the same as before the conversion
  for (const lang of ['vhdl', 'verilog']) assert.equal(generateHdl(d, { lang }).code, generateHdl(v2, { lang }).code, lang);
  // a module symbol whose module is not known yet: kept at version 2, converted when it is
  const mod = { ...v2, symbols: [...v2.symbols, { id: 'S3', type: 'module', x: 600, y: 600, name: 'M1', params: { module: 'sub' } }] };
  assert.equal(normalizeDoc(mod).version, 2);
  const modules = { sub: { name: 'sub', ports: [{ name: 'i', dir: 'in', width: 1 }] } };
  const m = normalizeDoc(mod, { modules });
  assert.equal(m.version, DOC_VERSION);
  assert.deepEqual(nets(netlist(m, { modules })), want);
  // joinOnWires on a converted document: nothing more to split
  assert.deepEqual(joinOnWires(d), []);
});

// the generated HDL of the crossing schematic, compiled and simulated: y = not a, z = not b
const TB = {
  vhdl: `library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture t of tb is
  signal a, b, y, z : std_logic := '0';
begin
  uut: entity work.cross port map (a => a, b => b, y => y, z => z);
  process begin
    a <= '0'; b <= '1'; wait for 10 ns;
    assert y = '1' and z = '0' report "a=0 b=1" severity error;
    a <= '1'; b <= '0'; wait for 10 ns;
    assert y = '0' and z = '1' report "a=1 b=0" severity error;
    a <= '1'; b <= '1'; wait for 10 ns;
    assert y = '0' and z = '0' report "a=1 b=1" severity error;
    report "done"; wait;
  end process;
end t;
`,
  verilog: `\`timescale 1ns/1ps
module tb;
  reg a = 0, b = 0;
  wire y, z;
  cross uut (.a(a), .b(b), .y(y), .z(z));
  initial begin
    a = 0; b = 1; #10; if (!(y === 1 && z === 0)) $error("a=0 b=1");
    a = 1; b = 0; #10; if (!(y === 0 && z === 1)) $error("a=1 b=0");
    a = 1; b = 1; #10; if (!(y === 0 && z === 0)) $error("a=1 b=1");
    $display("done"); $finish;
  end
endmodule
`,
};
test('#678 the crossing schematic\'s VHDL and Verilog: its own nets (no second driver), compiled and simulated', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateHdl(crossing(lang), { lang });
    assert.deepEqual(g.diagnostics.map(d => d.message), [], `${lang}: no warnings`);
    assert.match(g.code, lang === 'vhdl' ? /y <=|y\b.*=>/ : /\.O\(y\)|assign y/);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const r = simulate([{ path: `cross.${ext}`, text: g.code }, { path: `tb.${ext}`, text: TB[lang] }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors.map(e => e.message), [], `${lang}: compiles\n${g.code}`);
    const log = r.sim.log.map(l => `${l.kind}:${l.text}`);
    assert.deepEqual(r.sim.log.filter(l => l.kind === 'error' || l.kind === 'failure'), [], `${lang}: ${log.join('\n')}\n${g.code}`);
    assert.ok(log.some(l => /done/.test(l)), `${lang}: ran to the end: ${log.join('\n')}`);
    const y = r.design.top.signals.find(s => s.name === 'y');
    assert.ok(y?.wave && y.wave.v.some(v => V.toBin(v) === '1'), `${lang}: y toggles`);
  }
});

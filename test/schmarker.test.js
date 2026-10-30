// core/schmarker.js (#2170): a new I/O marker of a schematic: its direction (a pin's, a net's, or on empty space the
// marker added last's), the net of its name it joins (that net's whole width: count(7:0) -> 8); the HDL of a marker
// joined to a bus compiled and simulated in VHDL and Verilog with no warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, normalizeDoc, netlist, generateHdl, symbolPins } from '../core/schdoc.js';
import { lastMarkerDir, newMarkerDir, markerJoin, setMarkerWidth } from '../core/schmarker.js';
import { simulate } from '../core/compile.js';

const P = (x, y) => ({ x, y });

// a(7:0) -> U1 (an 8-bit inverter) -> a wire named count(7:0), its other end free; a net s of one bit elsewhere (`s`)
function sheet(lang = 'vhdl', s = true) {
  const doc = newDoc('top', lang);
  doc.symbols.push({ id: 'S1', type: 'inv', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 8 } });
  const [I, O] = symbolPins(normalizeDoc(doc).symbols[0]);
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 8, x: I.x - 40, y: I.y });
  doc.wires.push({ id: 'W1', points: [P(I.x - 40, I.y), P(I.x, I.y)] }, { id: 'W2', points: [P(O.x, O.y), P(O.x + 100, O.y)] });
  doc.labels.push({ id: 'L1', x: O.x + 60, y: O.y, net: 'count(7:0)' });
  if (s) { doc.wires.push({ id: 'W3', points: [P(100, 400), P(200, 400)] }); doc.labels.push({ id: 'L2', x: 150, y: 400, net: 's' }); }
  return { doc: normalizeDoc(doc), I, O };
}

test('#2170 lastMarkerDir: the direction of the marker added last (its highest P<n>), whatever the order listed; none: an input', () => {
  const d = newDoc('top', 'vhdl');
  assert.equal(lastMarkerDir(d), 'in');
  d.ports.push({ id: 'P2', name: 'y', dir: 'out' }, { id: 'P1', name: 'a', dir: 'in' });
  assert.equal(lastMarkerDir(d), 'out');
  d.ports.push({ id: 'P10', name: 'b', dir: 'inout' });
  assert.equal(lastMarkerDir(d), 'inout', 'P10 after P2');
  d.ports.splice(2, 1);
  d.ports.push({ id: 'X', name: 'c', dir: 'out' }, { id: 'Y', name: 'd', dir: 'bogus' });
  assert.equal(lastMarkerDir(d), 'out', 'ids not P<n>: the highest P<n> still');
  assert.equal(lastMarkerDir({ ports: [{ id: 'X', name: 'c', dir: 'inout' }, { id: 'Y', name: 'd', dir: 'out' }] }), 'out', 'no P<n>: the last listed');
  assert.equal(lastMarkerDir({ ports: [{ id: 'Y', name: 'd', dir: 'bogus' }] }), 'in', 'a direction unknown: an input');
});

test('#2170 newMarkerDir: on a pin its direction, on a net driven an output (else an input), unconnected the last marker\'s', () => {
  const { doc } = sheet();
  const nl = netlist(doc);
  assert.equal(newMarkerDir(doc, { pin: { dir: 'in' } }), 'in');
  assert.equal(newMarkerDir(doc, { pin: { dir: 'out' } }), 'out');
  assert.equal(newMarkerDir(doc, { pin: { dir: 'inout' } }), 'inout');
  assert.equal(newMarkerDir(doc, { net: nl.wireNet.get('W2') }), 'out', 'count: driven by U1');
  assert.equal(newMarkerDir(doc, { net: nl.wireNet.get('W3') }), 'in', 's: undriven');
  assert.equal(newMarkerDir(doc), 'in', 'unconnected: a (P1), an input');
  doc.ports.push({ id: 'P2', name: 'y', dir: 'out', width: 1, x: 600, y: 600 });
  assert.equal(newMarkerDir(doc), 'out', 'unconnected: y (P2), an output');
  assert.equal(newMarkerDir(doc, { pin: { dir: 'in' } }), 'in', 'a pin still its own');
  doc.ports.push({ id: 'P3', name: 'z', dir: 'inout', width: 1, x: 700, y: 600 });
  assert.equal(newMarkerDir(doc, {}), 'inout');
});

test('#2170 markerJoin: a net of the name (any letter case in VHDL), its whole bus width; its own net, or no such net: null', () => {
  const { doc } = sheet();
  const nl = netlist(doc);
  const j = markerJoin(doc, nl, 'count', null);
  assert.equal(j.net, nl.wireNet.get('W2'));
  assert.deepEqual([j.name, j.width], ['count(7:0)', 8]);
  assert.deepEqual([markerJoin(doc, nl, 'COUNT').name, markerJoin(doc, nl, 'COUNT').width], ['count(7:0)', 8], 'VHDL: any case');
  assert.deepEqual([markerJoin(doc, nl, 's').name, markerJoin(doc, nl, 's').width], ['s', 1]);
  assert.equal(markerJoin(doc, nl, 'count', nl.wireNet.get('W2')), null, 'its own net');
  assert.equal(markerJoin(doc, nl, 'q', null), null);
  assert.equal(markerJoin(doc, nl, '', null), null);
  // a bit of a bus only (Count(3)): the bus up to it
  const d2 = normalizeDoc({ ...newDoc('top', 'vhdl'), wires: [{ id: 'W1', points: [P(100, 400), P(200, 400)] }], labels: [{ id: 'L1', x: 150, y: 400, net: 'Count(3)' }] });
  assert.deepEqual(markerJoin(d2, netlist(d2), 'count'), { net: netlist(d2).nets[0], name: 'Count(3:0)', width: 4 }, 'only Count(3) named: bits 3:0, its name as written');
  // Verilog: case-sensitive
  const v = sheet('verilog').doc;
  assert.equal(markerJoin(v, netlist(v), 'COUNT'), null);
  assert.equal(markerJoin(v, netlist(v), 'count').width, 8);
});

test('#2170 setMarkerWidth: at least 1 bit; a single bit\'s HDL type dropped for a bus, a bus\'s kept', () => {
  const p = { width: 1, type: 'std_ulogic' };
  setMarkerWidth(p, 8);
  assert.deepEqual(p, { width: 8 });
  const q = { width: 1, type: 'unsigned(7 downto 0)' };
  setMarkerWidth(q, 8);
  assert.deepEqual(q, { width: 8, type: 'unsigned(7 downto 0)' });
  setMarkerWidth(q, 0);
  assert.equal(q.width, 1);
  setMarkerWidth(q, 'x');
  assert.equal(q.width, 1);
});

test('#2170 a marker joined to count(7:0): an 8-bit output port, one net; no warnings; compiled and simulated in VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const { doc } = sheet(lang, false);
    // placed unconnected, as the Add I/O Marker tool adds it: named count, joined (the user said yes): its width, and
    // the direction of the net joined (driven by U1: an output), not the last marker's (an input)
    assert.equal(newMarkerDir(doc, {}), 'in');
    const j = markerJoin(doc, netlist(doc), 'count', null);
    const dir = newMarkerDir(doc, { net: j.net });
    assert.equal(dir, 'out');
    doc.ports.push({ id: 'P2', name: 'count', dir, width: j.width, x: 600, y: 600 });
    const d = normalizeDoc(doc);
    const nl = netlist(d);
    assert.equal(nl.nets.find((n) => n.ports.includes('P2')), nl.wireNet.get('W2'), `${lang}: one net`);
    assert.equal(nl.wireNet.get('W2').width, 8);
    assert.deepEqual(nl.diagnostics.map((x) => x.message), [], `${lang}: no warnings`);
    const g = generateHdl(d, { lang });
    assert.deepEqual(g.diagnostics, [], lang);
    assert.match(g.code, lang === 'vhdl' ? /count : out std_logic_vector\(7 downto 0\)/ : /output (wire )?\[7:0\] count/, lang);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const tb = lang === 'vhdl'
      ? 'library ieee; use ieee.std_logic_1164.all;\nentity tb is end tb;\narchitecture t of tb is\n  signal a, count : std_logic_vector(7 downto 0) := (others => \'0\');\nbegin\n  uut: entity work.top port map (a => a, count => count);\n  process begin\n    a <= x"5A"; wait for 10 ns;\n    assert count = x"A5" report "count wrong" severity error;\n    report "done"; wait;\n  end process;\nend t;\n'
      : '`timescale 1ns/1ps\nmodule tb;\n  reg [7:0] a = 0;\n  wire [7:0] count;\n  top uut (.a(a), .count(count));\n  initial begin\n    a = 8\'h5A; #10;\n    if (count !== 8\'hA5) $error("count wrong");\n    $display("done"); $finish;\n  end\nendmodule\n';
    const r = simulate([{ path: `top.${ext}`, text: g.code }, { path: `tb.${ext}`, text: tb }], 'tb', { until: 1e6 });
    assert.deepEqual([...r.lib.errors, ...r.design.diags].map((e) => `${e.severity}: ${e.message}`), [], `${lang}: compiled and elaborated with no warnings`);
    const log = r.sim.log.map((l) => `${l.kind}:${l.text}`);
    assert.deepEqual(r.sim.log.filter((l) => l.kind === 'error' || l.kind === 'failure'), [], `${lang}: ${log.join('\n')}`);
    assert.ok(log.some((l) => /done/.test(l)), `${lang}: ran to the end`);
  }
});

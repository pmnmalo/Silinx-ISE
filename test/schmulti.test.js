// The properties several selected objects of a schematic have in common (#1471, core/schmulti.js): which fields, their
// value or mixed, a value set for all of them, what is left out; the HDL of a schematic changed this way compiled and
// simulated, in VHDL and in Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { newDoc, normalizeDoc, netlist, generateHdl, symbolParams, symbolPins } from '../core/schdoc.js';
import { commonProps, applyProp, selectedObjects } from '../core/schmulti.js';

const pin = (doc, id, name) => { const s = doc.symbols.find(x => x.id === id); const p = symbolPins(s).find(q => q.name === name); return { x: p.x, y: p.y }; };
const brief = fs => fs.map(f => `${f.key}=${f.mixed ? '(mixed)' : JSON.stringify(f.value)}`);

// a ── U1 ──(mid)── U2 ── y : two inverters in a row; an AND2, a flip-flop FD and an up counter apart; a third marker b
function chain(lang = 'vhdl', name = 'chain') {
  const doc = normalizeDoc({ ...newDoc(name, lang),
    symbols: [{ id: 'S1', type: 'inv', x: 200, y: 100, name: 'U1' }, { id: 'S2', type: 'inv', x: 400, y: 100, name: 'U2' }],
    ports: [{ id: 'P1', name: 'a', dir: 'in', width: 1, x: 120, y: 110 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 540, y: 110 }] });
  doc.wires.push({ id: 'W1', points: [{ x: 120, y: 110 }, pin(doc, 'S1', 'I')] });
  doc.wires.push({ id: 'W2', points: [pin(doc, 'S1', 'O'), pin(doc, 'S2', 'I')] });
  doc.wires.push({ id: 'W3', points: [pin(doc, 'S2', 'O'), { x: 540, y: 110 }] });
  doc.labels.push({ id: 'L1', x: 300, y: 110, net: 'mid' });
  return doc;
}
const extra = () => {
  const doc = chain();
  doc.symbols.push({ id: 'S3', type: 'and2', name: 'U3', x: 200, y: 400, params: { width: 4 } }, { id: 'S4', type: 'fd', name: 'U4', x: 400, y: 400 });
  doc.ports.push({ id: 'P3', name: 'b', dir: 'inout', width: 2, type: 'std_logic_vector(1 downto 0)', x: 120, y: 600 });
  return normalizeDoc(doc);
};

test('I/O markers: direction, width and HDL type (not the name); the same value, or mixed', () => {
  const doc = extra();
  assert.deepEqual(commonProps(doc, ['port:P1', 'port:P2']).map(f => [f.key, f.label, f.kind]),
    [['dir', 'Direction', 'select'], ['width', 'Width', 'int'], ['type', 'HDL type', 'text']]);
  assert.deepEqual(brief(commonProps(doc, ['port:P1', 'port:P2'])), ['dir=(mixed)', 'width=1', 'type=""']);
  assert.deepEqual(brief(commonProps(doc, ['port:P1', 'port:P2', 'port:P3'])), ['dir=(mixed)', 'width=(mixed)', 'type=(mixed)']);
  assert.deepEqual(commonProps(doc, ['port:P1', 'port:P2'])[0].options, [['in', 'Input'], ['out', 'Output'], ['inout', 'Bidirectional']]);
  assert.ok(commonProps(doc, ['port:P1', 'port:P2']).every(f => !('get' in f) && !('set' in f)));
});

test('a direction set for several I/O markers: all of them, the others not; then common again', () => {
  const doc = extra();
  assert.equal(applyProp(doc, ['port:P1', 'port:P2'], 'dir', 'inout'), 2);
  assert.deepEqual(doc.ports.map(p => p.dir), ['inout', 'inout', 'inout']);
  assert.equal(applyProp(doc, ['port:P1', 'port:P3'], 'dir', 'out'), 2);
  assert.deepEqual(doc.ports.map(p => `${p.name}:${p.dir}`), ['a:out', 'y:inout', 'b:out']);
  assert.deepEqual(brief(commonProps(doc, ['port:P1', 'port:P3'])), ['dir="out"', 'width=(mixed)', 'type=(mixed)']);
});

test('a width set for several I/O markers: as the single marker\'s (clamped, rounded; a scalar HDL type dropped, a vector one kept)', () => {
  const doc = extra();
  doc.ports[0].type = 'std_logic';
  applyProp(doc, ['port:P1', 'port:P2', 'port:P3'], 'width', '8');
  assert.deepEqual(doc.ports.map(p => [p.width, p.type ?? null]), [[8, null], [8, null], [8, 'std_logic_vector(1 downto 0)']]);
  applyProp(doc, ['port:P1', 'port:P2'], 'width', '-3');
  applyProp(doc, ['port:P3'], 'width', '2.6');
  assert.deepEqual(doc.ports.map(p => p.width), [1, 1, 3]);
  applyProp(doc, ['port:P1', 'port:P2'], 'width', 'x');
  assert.deepEqual(doc.ports.map(p => p.width), [1, 1, 3]);
  // the HDL type: set for all, emptied for all
  applyProp(doc, ['port:P1', 'port:P2'], 'type', ' unsigned(0 downto 0) ');
  assert.deepEqual(doc.ports.map(p => p.type ?? null), ['unsigned(0 downto 0)', 'unsigned(0 downto 0)', 'std_logic_vector(1 downto 0)']);
  applyProp(doc, ['port:P1', 'port:P2', 'port:P3'], 'type', '  ');
  assert.deepEqual(doc.ports.map(p => 'type' in p), [false, false, false]);
});

test('symbols: the parameters they all have (the width of gates of different kinds; the INIT of flip-flops), not their names nor inputs', () => {
  const doc = extra();
  // two inverters and an AND2: the width (the same parameter, its value mixed)
  assert.deepEqual(brief(commonProps(doc, ['sym:S1', 'sym:S2'])), ['param:width=1', 'param:bits=false']);
  // (and Pins per bit, all the gates', #2079)
  assert.deepEqual(brief(commonProps(doc, ['sym:S1', 'sym:S2', 'sym:S3'])), ['param:width=(mixed)', 'param:bits=false']);
  const w = commonProps(doc, ['sym:S1', 'sym:S3'])[0];
  assert.deepEqual([w.label, w.kind, w.min, w.max], ['Width', 'int', 1, 1024]);
  // a flip-flop with a gate: the width only; one alone (an independent reference: its own parameters)
  assert.deepEqual(brief(commonProps(doc, ['sym:S4', 'sym:S3'])), ['param:width=(mixed)']);
  assert.deepEqual(commonProps(doc, ['sym:S4']).map(f => f.key), symbolParams(doc.symbols[3]).map(p => `param:${p.name}`));
  // set for all: clamped as one symbol's (1 … 1024, a wrong number its default)
  applyProp(doc, ['sym:S1', 'sym:S2', 'sym:S3', 'sym:S4'], 'param:width', '5000');
  assert.deepEqual(doc.symbols.map(s => s.params.width), [1024, 1024, 1024, 1024]);
  applyProp(doc, ['sym:S1', 'sym:S3'], 'param:width', 'x');
  assert.deepEqual(doc.symbols.map(s => s.params.width), [1, 1024, 1, 1024]);
  // the INIT of a flip-flop (a select): '1'
  applyProp(doc, ['sym:S4'], 'param:init', '1');
  assert.equal(doc.symbols[3].params.init, '1');
  // its name and type left as they are
  assert.deepEqual(doc.symbols.map(s => `${s.name}:${s.type}`), ['U1:inv', 'U2:inv', 'U3:and2', 'U4:fd']);
});

test('the same parameter name with other choices: not common (a flip-flop\'s INIT, a select; a register\'s, a text)', () => {
  const doc = extra();
  doc.symbols.push({ id: 'S5', type: 'fdc', name: 'U5', x: 600, y: 400 }, { id: 'S6', type: 'register', name: 'R1', x: 800, y: 400 });
  const d = normalizeDoc(doc);
  assert.deepEqual(brief(commonProps(d, ['sym:S4', 'sym:S5'])), ['param:init="0"', 'param:width=1']);
  assert.deepEqual(['sym:S4', 'sym:S6'].map(k => symbolParams(d.symbols.find(s => s.id === k.slice(4))).find(p => p.name === 'init').kind), ['select', 'text']);
  assert.deepEqual(brief(commonProps(d, ['sym:S4', 'sym:S6'])), ['param:width=(mixed)']);
});

test('#1705 wires: nothing in common (no "Draw as bus": a wire drawn by its net\'s width); applyProp of bus changes nothing', () => {
  const doc = extra();
  doc.wires[0].bus = true;
  assert.deepEqual(commonProps(doc, ['wire:W1', 'wire:W2']), []);
  assert.deepEqual(commonProps(doc, ['wire:W2']), []);
  const before = JSON.stringify(doc);
  assert.equal(applyProp(doc, ['wire:W1', 'wire:W2', 'wire:W3'], 'bus', true), 0);
  assert.equal(JSON.stringify(doc), before);
});

test('nothing in common: objects of different kinds, net names, nothing selected, ids not found', () => {
  const doc = extra();
  assert.deepEqual(commonProps(doc, ['sym:S1', 'port:P1']), []);
  assert.deepEqual(commonProps(doc, ['port:P1', 'wire:W1']), []);
  assert.deepEqual(commonProps(doc, ['label:L1']), []);
  assert.deepEqual(commonProps(doc, []), []);
  assert.deepEqual(commonProps(doc, ['sym:nope', 'bogus:1']), []);
  // an object not found (deleted meanwhile) is skipped; the others share their fields
  assert.deepEqual(brief(commonProps(doc, ['port:P1', 'port:gone', 'port:P2'])), ['dir=(mixed)', 'width=1', 'type=""']);
  assert.deepEqual(selectedObjects(doc, new Set(['port:P1', 'label:L1', 'wire:x'])).map(o => `${o.kind}:${o.obj.id}`), ['port:P1', 'label:L1']);
  // a field an object does not have: nothing changed
  const before = JSON.stringify(doc);
  assert.equal(applyProp(doc, ['sym:S1', 'label:L1'], 'dir', 'out'), 0);
  assert.equal(applyProp(doc, [], 'dir', 'out'), 0);
  assert.equal(JSON.stringify(doc), before);
});

// a 4-bit chain made by changing several objects together: the HDL compiled, elaborated and simulated with no warnings
for (const lang of ['vhdl', 'verilog']) {
  test(`the chain made 4 bits wide, its two inverters and two markers together: ${lang === 'vhdl' ? 'VHDL' : 'Verilog'} compiles and simulates`, () => {
    const doc = chain(lang, 'wide');
    applyProp(doc, ['sym:S1', 'sym:S2'], 'param:width', 4);
    applyProp(doc, ['port:P1', 'port:P2'], 'width', 4);
    const d = normalizeDoc(doc);
    assert.deepEqual(netlist(d).diagnostics.map(x => `${x.severity}: ${x.message}`), []);
    const g = generateHdl(d, { lang });
    assert.deepEqual(g.diagnostics.map(x => `${x.severity}: ${x.message}`), [], g.code);
    const tb = lang === 'vhdl' ? `
library ieee; use ieee.std_logic_1164.all;
entity tb is end;
architecture s of tb is
  signal a, y : std_logic_vector(3 downto 0);
begin
  u : entity work.wide port map (a => a, y => y);
  process begin
    a <= "1010"; wait for 10 ns;
    assert y = "1010" report "bad 1010" severity error;
    a <= "0011"; wait for 10 ns;
    assert y = "0011" report "bad 0011" severity error;
    report "done"; wait;
  end process;
end;` : `
module tb;
  reg [3:0] a; wire [3:0] y; integer errs = 0;
  wide u (.a(a), .y(y));
  initial begin
    a = 4'b1010; #10; if (y !== 4'b1010) errs = errs + 1;
    a = 4'b0011; #10; if (y !== 4'b0011) errs = errs + 1;
    $display("errs=%0d", errs);
  end
endmodule`;
    const r = simulate([{ path: g.filename, text: g.code }, { path: lang === 'vhdl' ? 'tb.vhd' : 'tb.v', text: tb }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], 'compile / elaboration errors');
    assert.deepEqual([...r.lib.errors, ...r.design.diags].filter(x => x.severity === 'warning').map(x => x.message), [], 'no compile / elaboration warnings');
    const log = r.sim.log.map(l => `${l.kind}:${l.text}`);
    assert.deepEqual(r.sim.log.filter(l => l.kind === 'error' || l.kind === 'failure' || l.kind === 'warning'), [], g.code);
    assert.ok(log.includes(lang === 'vhdl' ? 'note:done' : 'print:errs=0'), log.join('\n'));
  });
}

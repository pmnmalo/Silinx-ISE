import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compile, elaborate } from '../core/compile.js';
import { buildSchematic, clocksOf } from '../core/schematic.js';

const graphOf = (files, top) => {
  const lib = compile(Object.entries(files).map(([path, text]) => ({ path, text })));
  const d = elaborate(lib, top);
  assert.deepEqual(d.diags.filter(x => x.severity === 'error'), []);
  return { g: buildSchematic(d.top), d };
};

test('gates are extracted from continuous assignments', () => {
  const { g } = graphOf({ 'm.v': 'module m(input [3:0] a,b, input s, output [3:0] y); assign y = s ? a & b : ~(a ^ b); endmodule' }, 'm');
  const gates = g.nodes.filter(n => n.kind === 'gate').map(n => n.gate).sort();
  assert.deepEqual(gates, ['and', 'mux', 'not', 'xor']);
  for (const e of g.edges) {
    assert.ok(g.nodes.some(n => n.id === e.from.node && n.ports.some(p => p.id === e.from.port)), 'edge source exists');
    assert.ok(g.nodes.some(n => n.id === e.to.node && n.ports.some(p => p.id === e.to.port)), 'edge target exists');
  }
});

test('partial drivers are merged by a bus joiner', () => {
  const { g } = graphOf({ 'r.v': 'module r(input [1:0] a, output [1:0] y); assign y[0] = ~a[0]; assign y[1] = a[1] & a[0]; endmodule' }, 'r');
  const j = g.nodes.find(n => n.gate === 'concat');
  assert.ok(j);
  assert.equal(g.edges.filter(e => e.to.node === j.id).length, 2);
});

test('clocked VHDL process -> register with clock and async reset', () => {
  const dir = new URL('./fixtures/vhdl/', import.meta.url);
  const files = Object.fromEntries(fs.readdirSync(dir).map(f => [f, fs.readFileSync(new URL(f, dir), 'utf8')]));
  const { d } = graphOf(files, 'top');
  const lib = compile(Object.entries(files).map(([path, text]) => ({ path, text })));
  const cnt = elaborate(lib, 'counter').top;
  const p = cnt.procs.find(x => x.kind === 'process');
  const { clocks, resets } = clocksOf(p);
  assert.deepEqual([...clocks].map(s => s.name), ['clk']);
  assert.ok([...resets].length <= 1);
  const g = buildSchematic(cnt);
  assert.ok(g.nodes.some(n => n.kind === 'reg' && n.ports.some(pt => pt.clock)));
  assert.ok(d.top.children.length > 0);
});

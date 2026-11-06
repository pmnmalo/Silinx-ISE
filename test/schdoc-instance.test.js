// A module instance drawn as a module symbol (core/schdoc-instance.js, #405: out of schematicFromHdl): mounted alone,
// and on designs in VHDL and in Verilog whose instances are connected to nets, constants, gates and nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountInstanceDrawing } from '../core/schdoc-instance.js';
import { schematicFromHdl, modulesFromLibrary, generateHdl } from '../core/schdoc.js';
import { compile, elaborate } from '../core/compile.js';

const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
const layout = (g) => elk.layout(g);

// a schematic of the top of these sources, its HDL generated again and compiled with the other sources
async function drawn(files, top) {
  const src = Object.entries(files).map(([path, text]) => ({ path, text, role: 'design' }));
  const lib = compile(src);
  assert.deepEqual(lib.errors.filter((e) => e.severity === 'error'), []);
  const modules = modulesFromLibrary(lib, {});
  const doc = await schematicFromHdl(elaborate(lib, top).top, { sources: files, modules, layout });
  const g = generateHdl(doc, { modules });
  assert.deepEqual(g.diagnostics, []);
  const again = compile([...src.filter((s) => !s.path.startsWith(`${top}.`)), { path: g.filename, text: g.code, role: 'design' }]);
  assert.deepEqual(again.errors.map((e) => `${e.severity}: ${e.message}`), []);
  return doc;
}
const types = (doc) => doc.symbols.map((s) => s.type + (s.params.module ? `:${s.params.module}` : '')).sort();

test('#405 drawInstance mounted alone: an item that is not an instance, or an instance of no module, is not drawn', () => {
  const added = [];
  const { drawInstance } = mountInstanceDrawing({ addSym: (...a) => { added.push(a); return { id: 'S1' }; }, isPort: () => false, items: [] });
  assert.equal(drawInstance({ kind: 'assign' }, { children: [] }), false);
  assert.equal(drawInstance({ kind: 'instance' }, { children: [] }), false);
  assert.equal(drawInstance({ kind: 'instance' }, { children: [{ blackbox: true }] }), false);
  assert.equal(drawInstance({ kind: 'instance' }, { children: [{}, {}] }), false);
  assert.deepEqual(added, []);
});

test('#405 drawInstance, VHDL: an instance on a net, a constant, a gate and an open output; its generic kept', async () => {
  const files = {
    'cell.vhd': `library ieee; use ieee.std_logic_1164.all;
entity cell is generic (N : integer := 2); port (a, b, c : in std_logic; y, z : out std_logic); end cell;
architecture r of cell is begin y <= a and b and c; z <= a or b; end r;`,
    'top.vhd': `library ieee; use ieee.std_logic_1164.all;
entity top is port (p, q : in std_logic; y : out std_logic); end top;
architecture st of top is
  component cell generic (N : integer := 2); port (a, b, c : in std_logic; y, z : out std_logic); end component;
begin
  U1: cell generic map (N => 3) port map (a => p, b => '1', c => p and q, y => y, z => open);
end st;`,
  };
  const doc = await drawn(files, 'top');
  assert.deepEqual(types(doc), ['and2', 'constant', 'module:cell']);
  const u1 = doc.symbols.find((s) => s.type === 'module');
  assert.equal(u1.name, 'U1');
  assert.deepEqual(u1.params.generics, { n: '3' });   // (named as the library names it, modulesFromLibrary)
  assert.deepEqual(u1.params.ports.map((p) => `${p.name}:${p.dir}:${p.width}`), ['a:in:1', 'b:in:1', 'c:in:1', 'y:out:1', 'z:out:1']);
  assert.equal(doc.symbols.find((s) => s.type === 'constant').params.value, '1');
});

test('#405 drawInstance, Verilog: two instances of a module, wired by a net, a bus slice and a constant', async () => {
  const files = {
    'inv.v': 'module inv(input a, output y); assign y = ~a; endmodule',
    'top.v': `module top(input [1:0] d, output y);
  wire t;
  inv u1(.a(d[0]), .y(t));
  inv u2(.a(t), .y(y));
endmodule`,
  };
  const doc = await drawn(files, 'top');
  assert.deepEqual(types(doc), ['module:inv', 'module:inv', 'slice']);
  assert.deepEqual(doc.symbols.filter((s) => s.type === 'module').map((s) => s.name).sort(), ['u1', 'u2']);
});

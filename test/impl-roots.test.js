// The roots of the Implementation view's hierarchy (#2877, core/elaborate.js implRoots, the Design pane's viewRoots):
// the top module first and always a root, even when another module instantiates it (Set as Top Module on it), then the
// modules no visible module instantiates (the top's former parent among them); a test bench's instances not counted;
// the top's name in any case; a top the project no longer has, or one of another view, not a root. Compared with
// topCandidates (the roots with no top) and with the hierarchy the elaboration of each root builds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, implRoots, topCandidates } from '../core/compile.js';

const ent = (n, body = 'y <= x;', decl = '') => `library ieee; use ieee.std_logic_1164.all;
entity ${n} is port (x : in std_logic; y : out std_logic); end ${n};
architecture r of ${n} is ${decl} begin ${body} end r;\n`;
const inst = (label, m) => `${label} : entity work.${m} port map (x => x, y => y);`;
// a instantiates b (Verilog), b c, c d; e alone; tb (a test bench) instantiates e
const SOURCES = [
  { path: 'src/a.vhd', text: ent('a', inst('u_b', 'b')) },
  { path: 'src/b.v', text: 'module b(input x, output y); c u_c(.x(x), .y()); assign y = ~x; endmodule\n' },
  { path: 'src/c.vhd', text: ent('c', inst('u_d', 'd')) },
  { path: 'src/d.vhd', text: ent('d') },
  { path: 'src/e.vhd', text: ent('e') },
  { path: 'sim/tb.vhd', text: 'library ieee; use ieee.std_logic_1164.all;\nentity tb is end tb;\narchitecture t of tb is signal x, y : std_logic; begin uut : entity work.e port map (x => x, y => y); end t;\n' },
];
const lib = compile(SOURCES);
const design = name => !['tb'].includes(name);   // the Implementation view's modules (the test bench out)
const sorted = a => [...a].sort();

test('implRoots (#2877): with no top, or the top a root, the roots are the modules nobody instantiates', () => {
  assert.deepEqual(lib.errors.filter(e => e.severity === 'error'), []);
  assert.deepEqual(sorted(implRoots(lib, { visible: design })), ['a', 'e']);
  assert.deepEqual(implRoots(lib, { top: 'a', visible: design }), ['a', 'e']);
  assert.deepEqual(implRoots(lib, { top: 'e', visible: design }), ['e', 'a']);
  // (every module counted: the test bench's instance makes e no root, as topCandidates)
  assert.deepEqual(sorted(implRoots(lib)), sorted(topCandidates(lib)));
  assert.deepEqual(sorted(implRoots(lib)), ['a', 'tb']);
});

test('implRoots (#2877): an instantiated module set as the top is the first root, its former parent a root after it', () => {
  assert.deepEqual(implRoots(lib, { top: 'b', visible: design }), ['b', 'a', 'e']);
  assert.deepEqual(implRoots(lib, { top: 'd', visible: design }), ['d', 'a', 'e']);
  // the top's name in any case: the module's own name
  assert.deepEqual(implRoots(lib, { top: 'C', visible: design }), ['c', 'a', 'e']);
  // the top back on a: the tree as before
  assert.deepEqual(implRoots(lib, { top: 'a', visible: design }), ['a', 'e']);
  // the top elaborates on its own (its sub-tree: c, d), no error
  const el = elaborate(lib, 'b');
  assert.deepEqual(el.diags.filter(d => d.severity === 'error'), []);
  assert.ok(el.top);
});

test('implRoots (#2877): a top the project no longer has, or one outside the view, is not a root', () => {
  assert.deepEqual(sorted(implRoots(lib, { top: 'gone', visible: design })), ['a', 'e']);
  assert.deepEqual(sorted(implRoots(lib, { top: 'tb', visible: design })), ['a', 'e']);
  assert.deepEqual(implRoots({ modules: new Map() }, { top: 'a' }), []);
});

// Convert to Schematic (editable) of any HDL module (#225, core/hdl-to-sch.js): every module of every
// example (testbenches too) and a set of behavioural VHDL / Verilog modules become schematics whose
// generated HDL behaves as the module did (the same waveforms, the same testbench log, no new error
// or warning); what cannot be drawn stays as HDL blocks; a file with other design units keeps them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import * as V from '../core/values.js';
import { convertModuleToSchematic, designUnits, moduleUnitRanges } from '../core/hdl-to-sch.js';
import { schematicFromHdl, generateHdl, normalizeDoc, netlist, modulesFromLibrary, symbolBox, tokenize } from '../core/schdoc.js';
import { exportIseSch } from '../core/isesch-export.js';
import fs from 'node:fs';
import { example, runTestbench, EXAMPLES } from './examples-lib.mjs';
import { CASES } from './fixtures/hdl-to-sch-cases.js';

const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
const layout = g => elk.layout(g);

const srcList = files => Object.entries(files).map(([path, text]) => ({ path, text, role: path.startsWith('sim/') ? 'sim' : 'design' }));
// the sources with a conversion's files written (null: removed)
function applied(sources, r) {
  const out = [];
  for (const s of sources) if (!(s.path in r.writes)) out.push(s); else if (r.writes[s.path] != null) out.push({ ...s, text: r.writes[s.path] });
  for (const [p, role] of Object.entries(r.newFiles)) out.push({ path: p, text: r.writes[p], role });
  return out;
}
// the waveforms of the testbench's signals (deltas collapsed)
function waves(sources, top, until) {
  const r = simulate(sources, top, { until });
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), []);
  const out = {};
  const inst = r.design.top;
  for (const s of [...inst.signals, ...inst.ports.map(p => p.sig)]) {
    if (!s.wave) continue;
    const pts = [];
    for (let i = 0; i < s.wave.t.length; i++) {
      const t = s.wave.t[i], v = V.toBin(s.wave.v[i]);
      if (pts.length && pts[pts.length - 1][0] === t) pts[pts.length - 1][1] = v; else pts.push([t, v]);
    }
    out[s.name] = pts.filter((p, i) => i === 0 || p[1] !== pts[i - 1][1]).map(([t, v]) => `${t}:${v}`).join(' ');
  }
  return { waves: out, log: r.sim.log.map(l => `${l.kind}:${l.text}`) };
}
const kinds = doc => doc.symbols.reduce((a, s) => ({ ...a, [s.type]: (a[s.type] || 0) + 1 }), {});
// every compile / elaboration message of a module
const messages = (sources, module) => {
  const lib = compile(sources);
  const d = elaborate(lib, module);
  return [...lib.errors, ...d.diags].map(e => `${e.severity}: ${e.message}`).sort();
};

// ------------------------------------------------------------------ design units of a file
test('designUnits: VHDL units with their context clause and leading comment; Verilog modules, the directives outside', () => {
  const vhd = `-- the package
library ieee;
use ieee.std_logic_1164.all;
package p is
  constant K : integer := 3;
end package;

package body p is
end package body;

library ieee;
use ieee.std_logic_1164.all;
-- the entity
entity e is port (a : in std_logic; y : out std_logic); end e;
architecture rtl of e is
begin
  y <= not a;
end rtl; -- the end

configuration c of e is for rtl end for; end configuration;
`;
  const u = designUnits(vhd, 'vhdl');
  assert.deepEqual(u.map(x => [x.kind, x.name, x.of ?? null]), [['package', 'p', null], ['package body', 'p', null], ['entity', 'e', null], ['architecture', 'rtl', 'e'], ['configuration', 'c', 'e']]);
  assert.equal(vhd.slice(u[0].start, u[0].end), '-- the package\nlibrary ieee;\nuse ieee.std_logic_1164.all;\npackage p is\n  constant K : integer := 3;\nend package;\n');
  assert.equal(vhd.slice(u[2].start, u[2].end), 'library ieee;\nuse ieee.std_logic_1164.all;\n-- the entity\nentity e is port (a : in std_logic; y : out std_logic); end e;\n');
  assert.equal(vhd.slice(u[3].start, u[3].end), 'architecture rtl of e is\nbegin\n  y <= not a;\nend rtl; -- the end\n');

  const v = '`timescale 1ns / 1ps\n`define W 8\n// adder\nmodule add(input [`W-1:0] a, output [`W-1:0] y);\n  assign y = a + 1;\nendmodule\n\nmodule top(input [7:0] a, output [7:0] y); add u(a, y); endmodule : top\n';
  const w = designUnits(v, 'verilog');
  assert.deepEqual(w.map(x => [x.kind, x.name]), [['module', 'add'], ['module', 'top']]);
  assert.equal(v.slice(w[0].start, w[0].end), '// adder\nmodule add(input [`W-1:0] a, output [`W-1:0] y);\n  assign y = a + 1;\nendmodule\n');
  assert.equal(v.slice(w[1].start, w[1].end), 'module top(input [7:0] a, output [7:0] y); add u(a, y); endmodule : top\n');
});

test('#1716 a Verilog module with `ifdef / `else inside it (around an always block\'s header, an assign): its statements as the compiler reads them', async () => {
  const files = {
    'src/cfg.vh': '`define ASYNC\n',
    'src/cd.v': `\`include "cfg.vh"
module cd(input clk, input rst, input a, output reg [1:0] q, output y, output z);
\`ifdef ASYNC
always @(posedge clk or negedge rst)
\`else
always @(posedge clk)
\`endif
  if (!rst) q <= 0;   // reset
  else q <= q + a;
\`ifdef FAST
  assign y = a;
\`elsif ASYNC
  assign y = ~a;
\`else
  assign y = a ^ q[0];
\`endif
/* \`ifdef NOT_A_DIRECTIVE */
  assign z = q[1] &
\`ifndef ASYNC
    a &
\`endif
    q[0];
endmodule
`,
    'sim/tb_cd.v': `\`timescale 1ns / 1ps
module tb_cd;
  reg clk = 0, rst = 1, a = 0;
  wire [1:0] q;
  wire y, z;
  cd uut (.clk(clk), .rst(rst), .a(a), .q(q), .y(y), .z(z));
  always #5 clk = ~clk;
  initial begin
    #3 rst = 0; #4 rst = 1;
    repeat (12) #7 a = ~a;
    #2 rst = 0; #10 rst = 1; #20;
    $finish;
  end
endmodule
`,
  };
  const sources = srcList(files);
  const r = await convertModuleToSchematic({ sources, module: 'cd', layout });
  assert.deepEqual(r.warnings, []);
  // (y = ~a, the branch taken; z = q[1] & q[0] drawn)
  assert.deepEqual(kinds(r.doc), { hdlblock: 1, inv: 1, and2: 1, slice: 2 });
  assert.deepEqual(r.doc.symbols.filter(s => s.type === 'hdlblock').map(s => s.hdl), [
    'always @(posedge clk or negedge rst)\n  if (!rst) q <= 0;   // reset\n  else q <= q + a;',
  ]);
  assert.doesNotMatch(r.writes['src/cd.v'], /`(ifdef|ifndef|elsif|else|endif)/);
  const after = applied(sources, r);
  assert.deepEqual(messages(after, 'tb_cd'), messages(sources, 'tb_cd'));
  const a = waves(sources, 'tb_cd', 200e3), b = waves(after, 'tb_cd', 200e3);
  assert.ok(a.waves.q.split(' ').length > 4, 'the testbench makes activity');
  assert.deepEqual(b.waves, a.waves);
});

test('moduleUnitRanges: what a file keeps when a module is taken out of it', () => {
  const c = CASES.find(x => x.name === 'verilog-multi');
  const lib = compile(srcList(c.files));
  const r = moduleUnitRanges(c.files, lib.modules.get('proc'));
  assert.deepEqual(Object.keys(r), ['src/proc.v']);
  assert.equal(r['src/proc.v'].others, true);
  assert.equal(r['src/proc.v'].rest, '`timescale 1ns / 1ps\n`define WORD 8\nmodule adder #(parameter N = 4) (input [N-1:0] a, b, output [N:0] s);\n  assign s = a + b;\nendmodule\n');
  // a file with the module alone: nothing else in it
  const r2 = moduleUnitRanges(c.files, lib.modules.get('adder'));
  assert.equal(r2['src/proc.v'].others, true, 'proc is still there');
  const s = CASES.find(x => x.name === 'sv-enum');
  const r3 = moduleUnitRanges(s.files, compile(srcList(s.files)).modules.get('sv_fsm'));
  assert.equal(r3['src/sv_fsm.sv'].others, false);
  assert.equal(r3['src/sv_fsm.sv'].rest, '\n');
  // VHDL: the entity and its architecture in two files
  const a = CASES.find(x => x.name === 'vhdl-split-files');
  const r4 = moduleUnitRanges(a.files, compile(srcList(a.files)).modules.get('acc'));
  assert.deepEqual(Object.keys(r4).sort(), ['src/acc_arch.vhd', 'src/acc_ent.vhd']);
  assert.ok(Object.values(r4).every(x => !x.others));
});

test('#1697 a Verilog module with escaped names (\\opcode[0] ): kept escaped, its instances by name the same; its gates in VHDL as extended identifiers', async () => {
  const files = {
    'src/esc.v': `module esc (\\a[0] , \\a[1] , clk, \\y[0] , \\q[1] );
  input \\a[0] , \\a[1] , clk;
  output \\y[0] ;
  output reg \\q[1] ;
  wire \\t+n ;
  assign \\t+n  = \\a[0]  ^ \\a[1] ;
  assign \\y[0]  = \\t+n  & \\a[0] ;
  always @(posedge clk) \\q[1]  <= \\t+n ;
endmodule
`,
    'sim/tb_esc.v': `\`timescale 1ns / 1ps
module tb_esc;
  reg clk = 0;
  reg [1:0] a = 0;
  wire y, q;
  esc uut (.\\a[0] (a[0]), .\\a[1] (a[1]), .clk(clk), .\\y[0] (y), .\\q[1] (q));
  always #5 clk = ~clk;
  initial begin
    repeat (12) #7 a = a + 1;
    $finish;
  end
endmodule
`,
  };
  const sources = srcList(files);
  const r = await convertModuleToSchematic({ sources, module: 'esc', layout });
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.doc.ports.map(p => p.name), ['\\a[0]', '\\a[1]', 'clk', '\\y[0]', '\\q[1]']);
  assert.deepEqual(kinds(r.doc), { xor2: 1, and2: 1, hdlblock: 1 });
  const code = r.writes['src/esc.v'];
  assert.match(code, /^ {2}input wire \\a\[0\] ,$/m);
  assert.match(code, /^ {2}output reg \\q\[1\] $/m);
  assert.match(code, /^ {2}assign \\y\[0\] {2}= /m);
  const after = applied(sources, r);
  assert.deepEqual(messages(after, 'tb_esc'), messages(sources, 'tb_esc'));
  const a = waves(sources, 'tb_esc', 200e3), b = waves(after, 'tb_esc', 200e3);
  assert.ok(a.waves.q.split(' ').length > 4, 'the testbench makes activity');
  assert.deepEqual(b.waves, a.waves);
  // gates only (no HDL block): generated in VHDL too, the names as extended identifiers
  const g = await convertModuleToSchematic({ sources: srcList({ 'src/g.v': 'module g(\\a[0] , \\a[1] , \\y[0] );\n  input \\a[0] , \\a[1] ;\n  output \\y[0] ;\n  assign \\y[0]  = \\a[0]  & ~\\a[1] ;\nendmodule\n' }), module: 'g', layout });
  assert.deepEqual(kinds(g.doc), { and2b1: 1 });
  const vhd = generateHdl(g.doc, { lang: 'vhdl' });
  assert.deepEqual(vhd.diagnostics, []);
  assert.match(vhd.code, /^ {4}\\a\[0\]\\ : in std_logic;$/m);
  const lib = compile([{ path: 'g.vhd', text: vhd.code }]);
  assert.deepEqual(lib.errors, []);
  assert.deepEqual(elaborate(lib, 'g').top.ports.map(p => p.name), ['\\a[0]\\', '\\a[1]\\', '\\y[0]\\']);
  // a name that is not an identifier, without its backslash: still refused
  const bad = generateHdl({ ...g.doc, ports: [{ ...g.doc.ports[0], name: 'a[0]' }, ...g.doc.ports.slice(1)] }, { lang: 'verilog' });
  assert.deepEqual(bad.diagnostics.filter(d => d.severity === 'error').map(d => d.message), ["I/O marker name 'a[0]' is not a valid VERILOG identifier"]);
});

// #1809: an escaped internal wire (\t[0] ) is a net as any other: its assigns drawn as gates, a pin of the blocks
// that use it, in Verilog and (an extended identifier, \t[0]\) in VHDL
const ESC_V = String.raw`module esc (clk, \a[0] , \b[0] , \r[0] , \q[0] );
  input clk, \a[0] , \b[0] ;
  output \r[0] ;
  output reg \q[0] ;
  wire \t[0] ;
  assign \t[0]  = \a[0]  & ~\b[0] ;
  assign \r[0]  = \t[0]  | \b[0] ;
  always @(posedge clk) \q[0]  <= \t[0]  ^ \b[0] ;
endmodule
`;
const ESC_TB_V = String.raw`${'`'}timescale 1ns / 1ps
module tb_esc;
  reg clk = 0, a0 = 0, b0 = 0;
  wire r, q;
  esc uut (.clk(clk), .\a[0] (a0), .\b[0] (b0), .\r[0] (r), .\q[0] (q));
  always #5 clk = ~clk;
  initial begin
    repeat (12) begin #6 a0 = ~a0; #6 b0 = a0 ^ b0; end
    $finish;
  end
endmodule
`;
const ESC_VHD = String.raw`library ieee;
use ieee.std_logic_1164.all;
entity esc is
  port (clk, \a[0]\, \b[0]\ : in std_logic; \r[0]\, \q[0]\ : out std_logic);
end esc;
architecture rtl of esc is
  signal \t[0]\ : std_logic;
begin
  \t[0]\ <= \a[0]\ and not \b[0]\;
  \r[0]\ <= \t[0]\ or \b[0]\;
  process (clk) begin
    if rising_edge(clk) then \q[0]\ <= \t[0]\ xor \b[0]\; end if;
  end process;
end rtl;
`;
const ESC_TB_VHD = String.raw`library ieee;
use ieee.std_logic_1164.all;
entity tb_esc is end tb_esc;
architecture sim of tb_esc is
  signal clk, a0, b0 : std_logic := '0';
  signal r, q : std_logic;
begin
  uut : entity work.esc port map (clk => clk, \a[0]\ => a0, \b[0]\ => b0, \r[0]\ => r, \q[0]\ => q);
  clk <= not clk after 5 ns when now < 140 ns;
  process begin
    for k in 1 to 12 loop
      wait for 6 ns; a0 <= not a0; wait for 6 ns; b0 <= a0 xor b0;
    end loop;
    wait;
  end process;
end sim;
`;
// the waves of the testbench's signals at esc's ports, from the first clock edge on (before it: x in Verilog, U in VHDL;
// the inputs change at even times, off the rising edges at 5, 15, 25 ns…)
const escWaves = (sources, until = 140e3) => {
  const w = waves(sources, 'tb_esc', until).waves;
  return Object.fromEntries(['a0', 'b0', 'r', 'q'].map(n => [n, w[n].split(' ').filter(p => +p.split(':')[0] >= 5e3).join(' ')]));
};

test('#1809 an escaped internal wire (\\t[0] ) between blocks: its assigns drawn as gates, a pin of the always block; the same waves in Verilog and VHDL; exported to ISE the block reads it through a pin', async () => {
  const sources = srcList({ 'src/esc.v': ESC_V, 'sim/tb_esc.v': ESC_TB_V });
  const r = await convertModuleToSchematic({ sources, module: 'esc', layout });
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(kinds(r.doc), { and2b1: 1, or2: 1, hdlblock: 1 });
  const blk = r.doc.symbols.find(s => s.type === 'hdlblock');
  assert.deepEqual(blk.params.inputs.map(q => q.name), ['clk', '\\t[0]', '\\b[0]']);
  assert.deepEqual(blk.params.outputs.map(q => q.name), ['\\q[0]']);
  // the net \t[0] joins the AND2B1's output, the OR2's input and the block's pin
  const nl = netlist(r.doc);
  assert.deepEqual(nl.diagnostics, []);
  const t = nl.nets.find(n => n.name === '\\t[0]');
  assert.ok(t, 'a net \\t[0]');
  assert.deepEqual(t.endpoints.map(e => r.doc.symbols.find(s => s.id === e.sym)?.type || 'port').sort(), ['and2b1', 'hdlblock', 'or2']);
  const code = r.writes['src/esc.v'];
  assert.equal(code.match(/^ {2}wire \\t\[0\] ;$/gm)?.length, 1, 'declared once');
  assert.match(code, /^ {2}assign \\t\[0\] {2}= ~\\b\[0\] {2}& \\a\[0\] ;$/m);
  assert.match(code, /^ {2}assign \\r\[0\] {2}= \\t\[0\] {2}\| \\b\[0\] ;$/m);
  const after = applied(sources, r);
  assert.deepEqual(messages(after, 'tb_esc'), messages(sources, 'tb_esc'));
  const a = escWaves(sources);
  assert.ok(a.q.split(' ').length > 3 && a.r.split(' ').length > 3, 'the testbench makes activity');
  assert.deepEqual(escWaves(after), a);
  // the same design in VHDL (extended identifiers): converted, its schematic's HDL compiles, elaborates and behaves
  // the same under a VHDL testbench
  const g = await convertModuleToSchematic({ sources: srcList({ 'src/esc.vhd': ESC_VHD, 'sim/tb_esc.vhd': ESC_TB_VHD }), module: 'esc', layout });
  assert.deepEqual(g.warnings, []);
  assert.deepEqual(kinds(g.doc), { and2b1: 1, or2: 1, hdlblock: 1 });
  assert.deepEqual(g.doc.symbols.find(s => s.type === 'hdlblock').params.inputs.map(q => q.name), ['clk', '\\t[0]', '\\b[0]']);
  const gv = g.writes['src/esc.vhd'];
  assert.equal(gv.match(/^ {2}signal \\t\[0\]\\ : std_logic;$/gm)?.length, 1, 'declared once');
  assert.match(gv, /^ {2}\\t\[0\]\\ <= \(not \\b\[0\]\\\) and \\a\[0\]\\;$/m);
  const vsrc = srcList({ 'src/esc.vhd': ESC_VHD, 'sim/tb_esc.vhd': ESC_TB_VHD });
  const vafter = applied(vsrc, g);
  assert.deepEqual(messages(vafter, 'tb_esc'), messages(vsrc, 'tb_esc'));
  assert.deepEqual(escWaves(vafter), escWaves(vsrc));
  assert.deepEqual(escWaves(vsrc), a, 'the VHDL module behaves as the Verilog one');
  // exported to ISE: the block's own module reads \t[0] through a pin (t_0), not a wire of its own left undriven
  const x = exportIseSch(r.doc, { timestamp: 'T' });
  const bv = x.files.find(f => f.kind === 'hdl')?.text;
  assert.match(bv, /^ {2}input wire t_0,$/m);
  assert.match(bv, /^ {2}assign \\t\[0\] {2}= t_0;$/m);
  const blib = compile([{ path: 'b.v', text: bv }]);
  assert.deepEqual(blib.errors, []);
});

test('#1809 the schematic\'s VHDL tokens: an extended identifier is one identifier (a doubled backslash in it)', () => {
  assert.deepEqual(tokenize(String.raw`port (\a[0]\, \x\\y\ , B : in std_logic);`, 'vhdl').map(t => `${t.k}:${t.raw || t.v}`),
    ['id:port', 'op:(', 'id:\\a[0]\\', 'op:,', 'id:\\x\\\\y\\', 'op:,', 'id:B', 'op::', 'id:in', 'id:std_logic', 'op:)', 'op:;']);
});

// ------------------------------------------------------------------ every module of every example
for (const name of EXAMPLES) {
  test(`every module of the example ${name} (its testbench too) converts to a schematic that behaves the same`, async () => {
    const ex = example(name);
    const base = await runTestbench(name);
    assert.ok(base.passed, `${name}: the testbench passes as it is`);
    const all = [...primitiveSources(ex.sources), ...ex.sources];
    const w0 = waves(all, ex.project.simTop, base.now);
    const lib = compile(ex.sources);
    const files = new Map(ex.sources.map(s => [s.path, s]));
    const mods = [...lib.modules.values()].filter(m => files.has(m.archFile || m.file));
    assert.ok(mods.length >= 2);
    for (const m of mods) {
      const file = m.archFile || m.file;
      const r = await convertModuleToSchematic({ sources: ex.sources, module: m.name, layout });
      // (one module a file in the examples: the file becomes the schematic's HDL)
      assert.equal(r.moved, false, m.name);
      assert.equal(r.hdlPath, file);
      assert.deepEqual(Object.keys(r.writes), [file]);
      assert.equal(r.schPath, file.replace(/[^/]*$/, `${m.name}.sch.json`));
      assert.equal(r.doc.generatedFile, file);
      assert.deepEqual(r.warnings, [], `${name}/${m.name}: no warning`);
      assert.match(r.writes[file], new RegExp(`Generated by Silinx from ${m.name}\\.sch\\.json`, 'i'));
      // the schematic is a sound drawing: no error in it
      const modules = modulesFromLibrary(lib, { sources: Object.fromEntries(ex.sources.map(s => [s.path, s.text])) });
      assert.deepEqual(netlist(normalizeDoc(r.doc), { modules }).diagnostics.filter(d => d.severity === 'error'), [], m.name);
      // the same compile / elaboration messages, the same testbench log, the same waveforms
      const after = applied(ex.sources, r);
      assert.deepEqual(messages(after, ex.project.simTop), messages(ex.sources, ex.project.simTop), m.name);
      const tb = await runTestbench(name, { edit: r.writes });
      assert.ok(tb.passed, `${name}/${m.name}: ${tb.log.join(' | ')}`);
      assert.deepEqual(tb.log, base.log, m.name);
      assert.deepEqual(tb.warnings, base.warnings, m.name);
      const w1 = waves([...primitiveSources(after), ...after], ex.project.simTop, base.now);
      for (const [sig, w] of Object.entries(w0.waves)) assert.equal(w1.waves[sig], w, `${name}/${m.name}: waveform of ${sig}`);
      assert.deepEqual(w1.log, w0.log);
    }
  });
}

// what each behavioural module becomes: the symbols drawn (the rest HDL blocks), the files written
const EXPECT = {
  'vhdl-pkg-same-file': { kinds: { hdlblock: 10 }, moved: true, hdlPath: 'src/alu_mem.vhd', writes: ['src/alu.vhd', 'src/alu_mem.vhd'] },
  'vhdl-two-entities': { kinds: { module: 1, hdlblock: 4 }, moved: true, hdlPath: 'src/top2.vhd', writes: ['src/two.vhd', 'src/top2.vhd'] },
  'verilog-multi': { kinds: { slice: 1, hdlblock: 6, buf: 1 }, moved: true, hdlPath: 'src/proc.v', writes: ['src/proc.v', 'src/adder.v'] },
  'sv-enum': { kinds: { hdlblock: 3, buf: 1 }, moved: false, hdlPath: 'src/sv_fsm.sv', writes: ['src/sv_fsm.sv'] },
  'vhdl-split-files': { kinds: { hdlblock: 3 }, moved: false, hdlPath: 'src/acc_arch.vhd', writes: ['src/acc_ent.vhd', 'src/acc_arch.vhd'] },
  // (its net bus: a good Verilog name, a reserved word of VHDL, #679)
  'verilog-classic': { kinds: { hdlblock: 4, tbuf: 1, slice: 1, buf: 1 }, moved: false, hdlPath: 'src/dp.v', writes: ['src/dp.v'], warnings: ["'bus' is a reserved word of VHDL: rename it"] },
  'verilog-reg-init': { kinds: { hdlblock: 2, buf: 1 }, moved: false, hdlPath: 'src/ri.v', writes: ['src/ri.v'] },
  'verilog-generate-inst': { kinds: { hdlblock: 4 }, moved: false, hdlPath: 'src/bank.v', writes: ['src/bank.v'] },
  'vhdl-rom-gates': { kinds: { or2: 1, and2: 1, and2b1: 1, xor2: 1, and3b1: 1, slice: 2, hdlblock: 2 }, moved: false, hdlPath: 'src/romdec.vhd', writes: ['src/romdec.vhd'] },
};

for (const c of CASES) {
  test(`behavioural module ${c.name}: converted, its generated HDL simulates as the module`, async () => {
    const sources = srcList(c.files);
    const r = await convertModuleToSchematic({ sources, module: c.module, layout });
    const x = EXPECT[c.name];
    assert.deepEqual(kinds(r.doc), x.kinds);
    assert.equal(r.moved, x.moved);
    assert.equal(r.hdlPath, x.hdlPath);
    assert.deepEqual(Object.keys(r.writes).sort(), [...x.writes].sort());
    assert.deepEqual(r.warnings, x.warnings || []);
    const after = applied(sources, r);
    assert.deepEqual(messages(after, c.tb), messages(sources, c.tb));
    const a = waves(sources, c.tb, c.until), b = waves(after, c.tb, c.until);
    assert.ok(Object.values(a.waves).some(w => w.split(' ').length > 4), 'the testbench makes activity');
    for (const [sig, w] of Object.entries(a.waves)) assert.equal(b.waves[sig], w, `waveform of ${sig}\n${r.writes[r.hdlPath]}`);
    assert.deepEqual(b.log, a.log);
    // made again from its generated HDL (an edit of the HDL updates the schematic) and its HDL
    // generated again: the comments once (not the generated ones taken in), the same behaviour
    const lib2 = compile(after);
    const again = await schematicFromHdl(elaborate(lib2, c.module).top, { sources: Object.fromEntries(after.map(s => [s.path, s.text])), modules: modulesFromLibrary(lib2, {}), layout });
    assert.ok(again.symbols.every(s => !/HDL block/.test(s.hdl || '')));
    const code2 = generateHdl(again, { modules: modulesFromLibrary(lib2, {}) }).code;
    const comments = t => t.split('\n').map(l => l.trim()).filter(l => /^(--|\/\/)/.test(l) && !/HDL block|Generated by Silinx/.test(l)).sort();
    assert.deepEqual(comments(code2), comments(r.writes[r.hdlPath]));
    const after2 = after.map(s => (s.path === r.hdlPath ? { ...s, text: code2 } : s));
    const b2 = waves(after2, c.tb, c.until);
    for (const [sig, w] of Object.entries(a.waves)) assert.equal(b2.waves[sig], w, `generated again: waveform of ${sig}`);
  });
}

// ------------------------------------------------------------------ what the conversion keeps
test('a file with other design units keeps them; the module goes to a file of its own (VHDL package, Verilog modules)', async () => {
  const c = CASES.find(x => x.name === 'vhdl-pkg-same-file');
  const r = await convertModuleToSchematic({ sources: srcList(c.files), module: 'alu_mem', layout });
  assert.equal(r.writes['src/alu.vhd'], c.files['src/alu.vhd'].slice(0, c.files['src/alu.vhd'].indexOf('library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\nuse work.alu_pkg.all;')).replace(/\n+$/, '\n'));
  assert.match(r.writes['src/alu_mem.vhd'], /^use work\.alu_pkg\.all;$/m);
  assert.equal(r.schPath, 'src/alu_mem.sch.json');
  assert.deepEqual(r.newFiles, { 'src/alu_mem.vhd': 'design' });
  assert.deepEqual(r.kept, ['src/alu.vhd']);
  // a file named after the module (proc.v holds proc and adder): it stays proc's, adder goes to adder.v
  const v = CASES.find(x => x.name === 'verilog-multi');
  const r2 = await convertModuleToSchematic({ sources: srcList(v.files), module: 'proc', layout });
  assert.equal(r2.hdlPath, 'src/proc.v');
  assert.equal(r2.doc.generatedFile, 'src/proc.v');
  assert.deepEqual(r2.newFiles, { 'src/adder.v': 'design' });
  assert.equal(r2.writes['src/adder.v'], '`timescale 1ns / 1ps\n`define WORD 8\nmodule adder #(parameter N = 4) (input [N-1:0] a, b, output [N:0] s);\n  assign s = a + b;\nendmodule\n');
  assert.match(r2.writes['src/proc.v'], /^module proc #\(/m);
  // adder taken out of proc.v: adder.v (a name that exists in the project folder, not in the project, is taken too)
  const r3 = await convertModuleToSchematic({ sources: srcList(v.files), module: 'adder', layout, exists: p => p === 'src/adder.v' });
  assert.equal(r3.hdlPath, 'src/adder_2.v');
  assert.deepEqual(r3.newFiles, { 'src/adder_2.v': 'design' });
  assert.doesNotMatch(r3.writes['src/proc.v'], /module adder/);
  assert.match(r3.writes['src/proc.v'], /^module proc\(clk,/m);
  // a testbench's units keep its role
  const r4 = await convertModuleToSchematic({ sources: srcList({ ...v.files, 'sim/tb_proc.v': `${v.files['sim/tb_proc.v']}\nmodule helper(output reg x); initial x = 1; endmodule\n` }), module: 'tb_proc', layout });
  assert.deepEqual(r4.newFiles, { 'sim/helper.v': 'sim' });
  assert.equal(r4.hdlPath, 'sim/tb_proc.v');
});

test('#1715 a vector driven part by part in separate statements: one HDL block holding them, in Verilog and in VHDL', async () => {
  const V = {
    'src/pp.v': `module pp(input clk, input [7:0] a, input s, output [7:0] y, output z);
  reg [7:0] r = 0;
  assign y[3:0] = a[3:0];
  // the high half
  assign y[7:4] = s ? a[3:0] : a[7:4];
  always @(posedge clk) r[3:0] <= y[3:0] + 1;
  always @(posedge clk) r[7:4] <= r[3:0] ^ y[7:4];
  assign z = ^r;
endmodule
`,
    'sim/tb_pp.v': `\`timescale 1ns / 1ps
module tb_pp;
  reg clk = 0, s = 0;
  reg [7:0] a = 8'h35;
  wire [7:0] y;
  wire z;
  pp uut (.clk(clk), .a(a), .s(s), .y(y), .z(z));
  always #5 clk = ~clk;
  initial begin
    repeat (16) begin #7 a = a * 3 + 1; s = ~s; end
    $finish;
  end
endmodule
`,
  };
  const H = {
    'src/pp.vhd': `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity pp is port (clk : in std_logic; a : in std_logic_vector(7 downto 0); s : in std_logic; y : out std_logic_vector(7 downto 0); z : out std_logic); end pp;
architecture rtl of pp is
  signal r, t : std_logic_vector(7 downto 0) := (others => '0');
begin
  t(3 downto 0) <= a(3 downto 0);
  -- the high half
  t(7 downto 4) <= a(3 downto 0) when s = '1' else a(7 downto 4);
  y <= t;
  process (clk) begin if rising_edge(clk) then r(3 downto 0) <= std_logic_vector(unsigned(t(3 downto 0)) + 1); end if; end process;
  process (clk) begin if rising_edge(clk) then r(7 downto 4) <= r(3 downto 0) xor t(7 downto 4); end if; end process;
  z <= r(0) xor r(1) xor r(2) xor r(3) xor r(4) xor r(5) xor r(6) xor r(7);
end rtl;
`,
    'sim/tb_pp.vhd': `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb_pp is end tb_pp;
architecture sim of tb_pp is
  signal clk, s, z : std_logic := '0';
  signal a, y : std_logic_vector(7 downto 0) := x"35";
begin
  uut : entity work.pp port map (clk => clk, a => a, s => s, y => y, z => z);
  clk <= not clk after 5 ns;
  process begin
    for i in 0 to 15 loop wait for 7 ns; a <= std_logic_vector(unsigned(a) * 3 + 1)(7 downto 0); s <= not s; end loop;
    wait;
  end process;
end sim;
`,
  };
  for (const [files, blocks] of [
    [V, ['assign y[3:0] = a[3:0];\n// the high half\nassign y[7:4] = s ? a[3:0] : a[7:4];', 'always @(posedge clk) r[3:0] <= y[3:0] + 1;\nalways @(posedge clk) r[7:4] <= r[3:0] ^ y[7:4];', 'assign z = ^r;']],
    [H, ["t(3 downto 0) <= a(3 downto 0);\n-- the high half\nt(7 downto 4) <= a(3 downto 0) when s = '1' else a(7 downto 4);",
      'process (clk) begin if rising_edge(clk) then r(3 downto 0) <= std_logic_vector(unsigned(t(3 downto 0)) + 1); end if; end process;\nprocess (clk) begin if rising_edge(clk) then r(7 downto 4) <= r(3 downto 0) xor t(7 downto 4); end if; end process;']],
  ]) {
    const sources = srcList(files);
    const r = await convertModuleToSchematic({ sources, module: 'pp', layout });
    assert.deepEqual(r.warnings, []);
    const hb = r.doc.symbols.filter(s => s.type === 'hdlblock');
    assert.deepEqual(hb.map(s => s.hdl), blocks);
    // each block one net's driver: its outputs and inputs
    const t = files === V ? 'y' : 't';
    assert.deepEqual(hb.slice(0, 2).map(s => [s.params.inputs.map(q => q.name), s.params.outputs.map(q => q.name)]), [[['a', 's'], [t]], [['clk', t], ['r']]]);
    const after = applied(sources, r);
    assert.deepEqual(messages(after, 'tb_pp'), messages(sources, 'tb_pp'));
    const a = waves(sources, 'tb_pp', 200e3), b = waves(after, 'tb_pp', 200e3);
    assert.ok(a.waves.z.split(' ').length > 4, 'the testbench makes activity');
    assert.deepEqual(b.waves, a.waves);
  }
});

test('the HDL that is not drawn is kept: comments, attributes, compiler directives, port modes and defaults, initial values', async () => {
  const conv = async name => { const c = CASES.find(x => x.name === name); const r = await convertModuleToSchematic({ sources: srcList(c.files), module: c.module, layout }); return r.writes[r.hdlPath]; };
  // VHDL: a buffer port, the ports' default values, comments above and after the statements
  const acc = await conv('vhdl-split-files');
  assert.match(acc, /^ {4}mode : in mode_t := M_ADD;$/m);
  assert.match(acc, /^ {4}cfg : in cfg_t := DEF_CFG;$/m);
  assert.match(acc, /^ {4}level : in integer range 0 to 15 := 0;$/m);
  assert.match(acc, /^ {4}sum : buffer unsigned\(7 downto 0\);$/m);
  assert.match(acc, /-- LOGIC_1: HDL block \(assign\)\n {2}-- next value\n {2}nxt <= /);
  const rom = await conv('vhdl-rom-gates');
  assert.match(rom, /^ {2}T <= net_1 or net_2;$/m, 'gates drawn');
  const alu = await conv('vhdl-pkg-same-file');
  assert.match(alu, /-- COMB_1: HDL block \(with select\)\n {2}-- operation decode\n {2}with sel select/);
  assert.match(alu, /-- COMB_6: HDL block \(assert\)\n {2}assert DEPTH >= 8/);
  // Verilog: `include of the file defining a macro, `ifdef in the module, (* attributes *)
  const dp = await conv('verilog-classic');
  assert.match(dp, /^`include "defs\.vh"$/m);
  assert.match(dp, /^ {2}\(\* keep = "true" \*\) wire \[7:0\] s;$/m);
  assert.match(dp, /^ {2}assign #1 s = a \+ `INC;$/m);
  assert.doesNotMatch(dp, /`endif/);
  // an output port declared again with its initial value: an initial statement (not a second declaration)
  assert.match(dp, /^ {2}initial q = 8'b00000101;$/m);
  assert.doesNotMatch(dp, /reg \[7:0\] q = /);
  // initial values of an ANSI output reg and of variables; a variable read with its initial value only
  const ri = await conv('verilog-reg-init');
  assert.match(ri, /^ {2}initial q = 4'b0111;$/m);
  assert.match(ri, /^ {2}integer n = 3;$/m);
  assert.doesNotMatch(ri, /assign n =/, 'not tied to 0');
});

test('a module that does not elaborate is not converted (nothing written)', async () => {
  const files = { 'src/bad.vhd': 'library ieee; use ieee.std_logic_1164.all;\nentity bad is port (a : in std_logic; y : out std_logic); end bad;\narchitecture rtl of bad is begin y <= a and nosuch; end rtl;\n' };
  await assert.rejects(convertModuleToSchematic({ sources: srcList(files), module: 'bad', layout }), /^Error: 'bad' does not elaborate \(.*nosuch.*\): correct it first\.$/);
  await assert.rejects(convertModuleToSchematic({ sources: srcList(files), module: 'nothere' }), /^Error: No module 'nothere' in the project\.$/);
});

test('#1717 a port of width 0 with its generics\' defaults (a null range): a marker of width 1, as normalizeDoc keeps it, its type as the entity has it', async () => {
  const NULL = 'std_logic_vector(natural(ceil(log2(real(N))))-1 downto 0)';
  const files = {
    'src/nr.vhd': `library ieee; use ieee.std_logic_1164.all; use ieee.math_real.all;
entity nr is
  generic (N : natural := 1);
  port (clk, b : in std_logic; a : in ${NULL}; y : out std_logic; q : out ${NULL});
end nr;
architecture rtl of nr is
begin
  process (clk) begin
    if rising_edge(clk) then
      y <= b;
      if a'length > 0 then y <= not b; end if;
    end if;
  end process;
  q <= a;
end rtl;
`,
    'sim/tb_nr.vhd': `library ieee; use ieee.std_logic_1164.all;
entity tb_nr is end tb_nr;
architecture sim of tb_nr is
  signal clk, b, y : std_logic := '0';
  signal a, q : std_logic_vector(-1 downto 0);
begin
  uut : entity work.nr port map (clk => clk, b => b, a => a, y => y, q => q);
  clk <= not clk after 10 ns;
  process begin
    for i in 0 to 7 loop b <= not b; wait for 30 ns; end loop;
    wait;
  end process;
end sim;
`,
  };
  const sources = srcList(files);
  const r = await convertModuleToSchematic({ sources, module: 'nr', layout });
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.doc.ports.map(p => [p.name, p.width, p.type]), [['clk', 1, 'std_logic'], ['b', 1, 'std_logic'], ['a', 1, NULL], ['y', 1, 'std_logic'], ['q', 1, NULL]]);
  assert.deepEqual(kinds(r.doc), { hdlblock: 1, buf: 1 });
  // saved as it was made (it was width 0, made 1 the first time it was saved)
  assert.equal(JSON.stringify(normalizeDoc(r.doc)), JSON.stringify(r.doc));
  assert.match(r.writes['src/nr.vhd'], new RegExp(`^ {4}a : in ${NULL.replace(/[()]/g, '\\$&')};$`, 'm'));
  const after = applied(sources, r);
  assert.deepEqual(messages(after, 'tb_nr'), messages(sources, 'tb_nr'));
  const a = waves(sources, 'tb_nr', 300e3), b = waves(after, 'tb_nr', 300e3);
  assert.ok(a.waves.y.split(' ').length > 4, 'the testbench makes activity');
  assert.deepEqual(b.waves, a.waves);
});

// ------------------------------------------------------------------ the layout engine (elkjs, #351)
test('every ELK layout option Silinx sets is one the installed elkjs knows (schdoc-place.js, schematic-view.js)', async () => {
  const known = new Set((await elk.knownLayoutOptions()).map(o => o.id));
  // (the placement of a schematic made from HDL, in schdoc-place.js since #405)
  for (const f of ['core/schdoc-place.js', 'web/js/schematic-view.js']) {
    const used = new Set([...fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').matchAll(/'(elk\.[A-Za-z.]+)'/g)].map(m => m[1]).filter(o => !o.endsWith('.js')));
    assert.ok(used.size >= 15, `${f}: ${used.size} options`);
    for (const o of used) assert.ok(known.has(`org.eclipse.${o}`), `${f}: ${o} unknown to elkjs`);
  }
});

test('the schematics of the examples and of the test cases are readable: no symbols overlap, no wire runs along another net\'s', async () => {
  const all = [];
  for (const name of EXAMPLES) {
    const ex = example(name);
    const lib = compile(ex.sources);
    const files = new Set(ex.sources.map(s => s.path));
    for (const m of lib.modules.values()) if (files.has(m.archFile || m.file)) all.push([`${name}/${m.name}`, ex.sources, m.name]);
  }
  for (const c of CASES) all.push([c.name, srcList(c.files), c.module]);
  assert.ok(all.length >= 30, `${all.length} schematics`);
  for (const [what, sources, module] of all) {
    const { doc } = await convertModuleToSchematic({ sources, module, layout });
    const modules = modulesFromLibrary(compile(sources), { sources: Object.fromEntries(sources.map(s => [s.path, s.text])) });
    const boxes = doc.symbols.map(s => ({ id: s.id, ...symbolBox(s, modules) }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `${what}: ${a.id} overlaps ${b.id}`);
    }
    const nl = netlist(normalizeDoc(doc), { modules });
    const segs = doc.wires.flatMap(w => w.points.slice(1).map((q, i) => ({ p: w.points[i], q, net: nl.wireNet.get(w.id) })));
    const span = (a, b, c, d) => Math.min(Math.max(a, b), Math.max(c, d)) - Math.max(Math.min(a, b), Math.min(c, d));
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i], t = segs[j];
      if (s.net === t.net) continue;
      const along = s.p.y === s.q.y && t.p.y === t.q.y && s.p.y === t.p.y ? span(s.p.x, s.q.x, t.p.x, t.q.x) > 0
        : s.p.x === s.q.x && t.p.x === t.q.x && s.p.x === t.p.x && span(s.p.y, s.q.y, t.p.y, t.q.y) > 0;
      assert.ok(!along, `${what}: two nets' wires along each other at (${s.p.x},${s.p.y})-(${s.q.x},${s.q.y})`);
    }
  }
});

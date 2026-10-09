// web/js/templates.js (New Source Wizard skeletons) and the example projects (New Project ▸
// Start from): every template compiles, elaborates and — test benches, examples — simulates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from '../web/js/templates.js';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import { parseUcf, checkUcf } from '../core/ucf.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = { name: 'tpl', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' } };
const PORTS = [
  { name: 'clk', dir: 'in', bus: false }, { name: 'rst', dir: 'in', bus: false },
  { name: 'din', dir: 'in', bus: true, msb: '7', lsb: '0' }, { name: 'sel', dir: 'in', bus: true, msb: '0', lsb: '2' },
  { name: 'q', dir: 'out', bus: true, msb: '15', lsb: '0' }, { name: 'ready', dir: 'out', bus: false }, { name: 'io', dir: 'inout', bus: false },
];

function check(sources, top) {
  const lib = compile(sources.map((s) => ({ role: 'design', ...s })));
  const design = elaborate(lib, top);
  const errors = [...lib.errors, ...design.diags].filter((d) => d.severity === 'error');
  assert.deepEqual(errors.map((e) => `${e.file}:${e.line}: ${e.message}`), [], `${top} has no errors`);
  assert.ok(design.top, `${top} elaborates`);
  return design;
}
function simulate(design, until = 5_000_000, files) {
  const sim = new Simulator(design, { files });
  const st = sim.run(until);
  const bad = sim.log.filter((l) => l.kind === 'error' || l.kind === 'failure');
  assert.deepEqual(bad.map((l) => l.text), [], 'no simulation errors');
  return { sim, st };
}

test('VHDL module skeleton: ports, buses (downto / to), architecture name', () => {
  const text = T.vhdlModule('skel', 'rtl', PORTS, project);
  assert.match(text, /entity skel is/);
  assert.match(text, /din\s+: IN\s+STD_LOGIC_VECTOR \(7 downto 0\)/);
  assert.match(text, /sel\s+: IN\s+STD_LOGIC_VECTOR \(0 to 2\)/);
  assert.match(text, /architecture rtl of skel is/);
  assert.match(text, /Target Devices: xc3s250e-4-cp132/);
  const d = check([{ path: 'src/skel.vhd', lang: 'vhdl', text }], 'skel');
  assert.deepEqual(d.top.ports.map((p) => [p.name, p.dir, p.sig.t.w]), [['clk', 'in', 1], ['rst', 'in', 1], ['din', 'in', 8], ['sel', 'in', 3], ['q', 'out', 16], ['ready', 'out', 1], ['io', 'inout', 1]]);
  // no ports, default architecture
  check([{ path: 'src/empty.vhd', lang: 'vhdl', text: T.vhdlModule('empty', '', [], project) }], 'empty');
});

test('Verilog module skeleton', () => {
  const text = T.vlogModule('vskel', PORTS, project);
  assert.match(text, /^`timescale 1ns \/ 1ps/);
  const d = check([{ path: 'src/vskel.v', lang: 'verilog', text }], 'vskel');
  assert.deepEqual(d.top.ports.map((p) => [p.name, p.dir, p.sig.t.w]), [['clk', 'in', 1], ['rst', 'in', 1], ['din', 'in', 8], ['sel', 'in', 3], ['q', 'out', 16], ['ready', 'out', 1], ['io', 'inout', 1]]);
  check([{ path: 'src/vnone.v', lang: 'verilog', text: T.vlogModule('vnone', [], project) }], 'vnone');
});

test('VHDL package skeleton compiles and can be used', () => {
  const pkg = T.vhdlPackage('my_pkg', project);
  const user = 'library ieee; use ieee.std_logic_1164.all; use work.my_pkg.all;\nentity user is port (a : in std_logic; y : out std_logic); end user;\narchitecture a of user is begin y <= a; end a;\n';
  check([{ path: 'src/my_pkg.vhd', lang: 'vhdl', text: pkg }, { path: 'src/user.vhd', lang: 'vhdl', text: user }], 'user');
});

// the unit under test as the wizard describes it (wizards.js uutInfo)
const COUNTER_VHDL = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity counter is
  generic (WIDTH : integer := 8);
  port (clk : in std_logic; rst : in std_logic; en : in std_logic; q : out std_logic_vector(7 downto 0));
end counter;
architecture rtl of counter is
  signal c : unsigned(7 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0'); elsif en = '1' then c <= c + 1; end if;
    end if;
  end process;
  q <= std_logic_vector(c);
end rtl;
`;
const COUNTER_V = `module vcounter #(parameter WIDTH = 8) (input clk, input rst_n, input en, output reg [7:0] q);
  always @(posedge clk) if (!rst_n) q <= 0; else if (en) q <= q + 1;
endmodule
`;
const uut = (name, lang, rst = 'rst') => ({
  name, lang, params: [{ name: 'WIDTH', default: 8 }],
  ports: [
    { name: 'clk', dir: 'in', width: 1, msb: 0, lsb: 0, vhdlType: 'std_logic' },
    { name: rst, dir: 'in', width: 1, msb: 0, lsb: 0, vhdlType: 'std_logic' },
    { name: 'en', dir: 'in', width: 1, msb: 0, lsb: 0, vhdlType: 'std_logic' },
    { name: 'q', dir: 'out', width: 8, msb: 7, lsb: 0, vhdlType: 'std_logic_vector(7 downto 0)' },
  ],
});

test('VHDL test bench: clock process, reset, the UUT instance; it simulates to its end', () => {
  const tb = T.vhdlTestbench('tb_counter', uut('counter', 'vhdl'), project);
  assert.match(tb, /constant clk_period : time := 20 ns;/);
  assert.match(tb, /uut: entity work\.counter\s+GENERIC MAP \(\s+WIDTH => 8\s+\)/);
  assert.match(tb, /rst <= '1';/);
  const d = check([{ path: 'src/counter.vhd', lang: 'vhdl', text: COUNTER_VHDL }, { path: 'sim/tb_counter.vhd', lang: 'vhdl', text: tb, role: 'sim' }], 'tb_counter');
  const { sim } = simulate(d, 1_000_000);
  assert.ok(sim.log.some((l) => /Simulation finished/.test(l.text)), 'the stimulus process reports its end');
  const clk = d.signals.find((s) => s.path === 'tb_counter.clk' || s.name === 'clk');
  assert.ok(clk, 'clock signal');
});

test('Verilog test fixture: active-low reset, clock, $finish; also for a VHDL unit under test', () => {
  const tb = T.vlogTestbench('tb_vcounter', uut('vcounter', 'verilog', 'rst_n'), project);
  assert.match(tb, /always #10 clk = ~clk;/);
  assert.match(tb, /rst_n = 0;[\s\S]*rst_n = 1;/);
  assert.match(tb, /vcounter #\(\.WIDTH\(8\)\) uut \(/);
  const d = check([{ path: 'src/vcounter.v', lang: 'verilog', text: COUNTER_V }, { path: 'sim/tb_vcounter.v', lang: 'verilog', text: tb, role: 'sim' }], 'tb_vcounter');
  const { sim, st } = simulate(d, 10_000_000);
  assert.ok(st.finished, 'stops at $finish');
  assert.ok(sim.log.some((l) => /Simulation finished at/.test(l.text)));
  const q = d.signals.find((s) => s.path === 'tb_vcounter.q');
  // all inputs start at 0 (en = 0): the reset pulse leaves the counter at a known 0
  assert.ok(q && q.val.x === 0n && q.val.v === 0n, 'the reset of the fixture reached the unit under test');
  // mixed language: Verilog fixture around the VHDL counter (no generic map default on the VHDL side)
  const tb2 = T.vlogTestbench('tb_mixed', { ...uut('counter', 'vhdl'), params: [] }, project);
  simulate(check([{ path: 'src/counter.vhd', lang: 'vhdl', text: COUNTER_VHDL }, { path: 'sim/tb_mixed.v', lang: 'verilog', text: tb2, role: 'sim' }], 'tb_mixed'), 10_000_000);
});

test('test benches of modules without clock / reset', () => {
  const comb = { name: 'andgate', lang: 'vhdl', params: [], ports: [{ name: 'a', dir: 'in', width: 1, vhdlType: 'std_logic' }, { name: 'b', dir: 'in', width: 1, vhdlType: 'std_logic' }, { name: 'y', dir: 'out', width: 1, vhdlType: 'std_logic' }] };
  const src = 'library ieee; use ieee.std_logic_1164.all;\nentity andgate is port (a, b : in std_logic; y : out std_logic); end andgate;\narchitecture a of andgate is begin y <= a and b; end a;\n';
  const tb = T.vhdlTestbench('tb_and', comb, project);
  assert.doesNotMatch(tb, /_period/);
  simulate(check([{ path: 'src/andgate.vhd', lang: 'vhdl', text: src }, { path: 'sim/tb_and.vhd', lang: 'vhdl', text: tb, role: 'sim' }], 'tb_and'), 1_000_000);
});

test('UCF template: comments only, valid constraints file', () => {
  const ucf = T.ucfTemplate(project);
  assert.match(ucf, /# User Constraints File for tpl/);
  assert.deepEqual(Object.keys(parseUcf(ucf).assignments), []);
  assert.deepEqual(checkUcf(ucf, { top: 'top', ports: [], lang: 'vhdl' }).filter((d) => d.severity === 'error'), []);
});

test('example projects (New Project ▸ Start from): sources compile, top and test bench elaborate, the test bench simulates', () => {
  const dir = path.join(ROOT, 'examples');
  const examples = fs.readdirSync(dir).filter((e) => fs.existsSync(path.join(dir, e, 'silinx.json')));
  assert.ok(examples.length >= 1);
  for (const ex of examples) {
    const pj = JSON.parse(fs.readFileSync(path.join(dir, ex, 'silinx.json'), 'utf8'));
    const sources = pj.files.filter((f) => f.lang === 'vhdl' || f.lang === 'verilog').map((f) => ({ ...f, text: fs.readFileSync(path.join(dir, ex, f.path), 'utf8') }));
    assert.ok(sources.length, `${ex} has sources`);
    if (pj.top) check(sources.filter((s) => s.role !== 'sim'), pj.top);
    if (pj.simTop) simulate(check(sources, pj.simTop), 2_000_000);
    if (pj.constraints && fs.existsSync(path.join(dir, ex, pj.constraints))) {
      const ucf = fs.readFileSync(path.join(dir, ex, pj.constraints), 'utf8');
      const design = check(sources.filter((s) => s.role !== 'sim'), pj.top);
      const ports = design.top.ports.map((p) => ({ name: p.name, dir: p.dir, width: p.sig.t.w, msb: p.sig.t.w > 1 ? p.sig.t.left : null, lsb: p.sig.t.w > 1 ? p.sig.t.right : null }));
      assert.deepEqual(checkUcf(ucf, { top: pj.top, ports, lang: 'vhdl' }).filter((d) => d.severity === 'error'), [], `${ex}: ${pj.constraints}`);
    }
  }
});

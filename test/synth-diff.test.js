// Differential tests of the open synthesis (test/diff-synth.js): every example project and the
// synthesizable designs of the test fixtures are simulated as RTL by Silinx and as the netlist
// Yosys maps them to (synthesizeOpen, YoWASP), with the same seeded random stimulus, and their
// outputs must be equal at every cycle (X bits of the RTL excepted; see test/diff-synth.js for the
// power-up rule). A difference names the design, the cycle, the inputs and the outputs.
//
// The designs of test/fixtures/designs (block RAMs, DCM, multipliers, latches…) are in
// test/synth-diff-fixtures.test.js (a second file, so that both run in parallel).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffSynth, expectWarnings, stimulus, rng, isReset, activeLow, compareRuns, netlistClocks } from './diff-synth.js';
import { readYosysJson } from '../core/fpga/netlist.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const langOf = f => (/\.(vhd|vhdl)$/i.test(f) ? 'vhdl' : 'verilog');
const src = (...p) => ({ path: p[p.length - 1], lang: langOf(p[p.length - 1]), text: read(...p) });

const expectPass = r => assert.equal(r.status, 'pass', r.report || `${r.name}: ${r.status} at ${r.stage}: ${r.reason}`);

test('stimulus: resets asserted first (active low by name), seeded and reproducible', () => {
  assert.ok(isReset('rst') && isReset('rst_n') && isReset('nrst') && isReset('reset') && isReset('arst') && isReset('clr'));
  assert.ok(!isReset('first') && !isReset('restart') && !isReset('clear_all'));
  assert.ok(activeLow('rst_n') && activeLow('rstn') && activeLow('nreset') && activeLow('rst_b') && !activeLow('rst') && !activeLow('reset'));
  const ins = [{ name: 'rst_n', w: 1 }, { name: 'a', w: 40 }];
  const s1 = stimulus(rng(5), {}, ins, 50), s2 = stimulus(rng(5), {}, ins, 50);
  assert.deepEqual(s1, s2);
  assert.equal(s1[0].rst_n, 0n); assert.equal(s1[1].rst_n, 0n);
  assert.ok(s1.slice(2).filter(v => v.rst_n === 1n).length > 40, 'then mostly released');
  assert.ok(s1.every(v => v.a < 1n << 40n) && new Set(s1.map(v => v.a)).size > 30);
});

test('comparison: X bits of the RTL are not compared, every known bit is', () => {
  const W = [['q', 4]];
  const rtl = [{ q: { v: 0b0101n, x: 0b1000n } }, { q: { v: 0b0001n, x: 0n } }];
  assert.equal(compareRuns(rtl, [{ q: { v: 0b1101n, x: 0n } }, { q: { v: 1n, x: 0n } }], W), null);
  assert.deepEqual(compareRuns(rtl, [{ q: { v: 0b1100n, x: 0n } }, { q: { v: 1n, x: 0n } }], W), { cycle: 0, ports: ['q'] });
  assert.deepEqual(compareRuns(rtl, [{ q: { v: 0b0101n, x: 0n } }, { q: { v: 1n, x: 1n } }], W), { cycle: 1, ports: ['q'] }, 'an X in the netlist where the RTL is known');
  assert.equal(compareRuns(rtl, [{ q: { v: 0n, x: 0n } }, { q: { v: 1n, x: 0n } }], W, 1), null, 'skipped cycles');
});

test('clocks found in the netlist: inputs that reach a clock pin through buffers', () => {
  const json = { modules: { t: { attributes: { top: 1 }, ports: { ck: { direction: 'input', bits: [2] }, d: { direction: 'input', bits: [3] }, q: { direction: 'output', bits: [6] } },
    cells: { i: { type: 'IBUFG', port_directions: { I: 'input', O: 'output' }, connections: { I: [2], O: [4] } },
      b: { type: 'BUFG', port_directions: { I: 'input', O: 'output' }, connections: { I: [4], O: [5] } },
      f: { type: 'FDRE', port_directions: { C: 'input', D: 'input', CE: 'input', R: 'input', Q: 'output' }, connections: { C: [5], D: [3], CE: ['1'], R: ['0'], Q: [6] } } } } } };
  assert.deepEqual(netlistClocks(readYosysJson(json)), ['ck']);
});

test('scripts/fetch-yosys-tests.mjs: the tar reader (ustar names with a prefix, GNU long names, pax paths), a pinned commit', async () => {
  const { untar, YOSYS_TESTS_PIN } = await import('../scripts/fetch-yosys-tests.mjs');
  assert.match(YOSYS_TESTS_PIN.commit, /^[0-9a-f]{40}$/);
  const block = (name, type, data = '', prefix = '') => {
    const h = Buffer.alloc(512);
    h.write(name, 0); h.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124); h.write(type, 156); h.write(prefix, 345);
    const body = Buffer.alloc(Math.ceil(data.length / 512) * 512); body.write(data);
    return Buffer.concat([h, body]);
  };
  const long = `y/${'d'.repeat(120)}.v`;
  const tar = Buffer.concat([block('y/', '5'), block('a.v', '0', 'module a; endmodule', 'y/tests'), block('././@LongLink', 'L', long), block('short', '0', 'x'),
    block('pax', 'x', '20 path=y/tests/p.v\n'), block('ignored', '0', 'p'), Buffer.alloc(1024)]);
  const f = untar(tar);
  assert.deepEqual(f.map(x => [x.name, x.type, x.data.toString()]), [['y/', 'dir', ''], ['y/tests/a.v', 'file', 'module a; endmodule'], [long, 'file', 'x'], ['y/tests/p.v', 'file', 'p']]);
});

test('a mismatch is reported with the design, the cycle, the inputs and the outputs', { timeout: 120000 }, async () => {
  // a run() standing in for Yosys: it returns a netlist whose output is inverted
  const json = JSON.stringify({ modules: { inv: { attributes: { top: 1 }, ports: { a: { direction: 'input', bits: [2] }, y: { direction: 'output', bits: [3] } },
    cells: { b: { type: 'BUF', port_directions: { I: 'input', O: 'output' }, connections: { I: [2], O: [3] } } } } } });
  const run = async () => ({ 'inv.json': json, 'inv_yosys.v': '', 'inv_stat.txt': '' });
  const r = await diffSynth({ name: 'inv', sources: [{ path: 'inv.v', lang: 'verilog', text: 'module inv(input a, output y); assign y = ~a; endmodule' }], top: 'inv', run, sim: { cycles: 20 } });
  assert.equal(r.status, 'mismatch');
  assert.equal(r.mismatch.cycle, 0);
  assert.match(r.report, /^inv: the netlist differs from the RTL at cycle 0 \(engine cells, seed "inv"\)\n {2}inputs {2}a=[01]\n {2}RTL {5}y=[01]\n {2}netlist y=[01]$/);
});

test('a netlist with one wrong LUT is caught (the comparison sees the cells)', { timeout: 120000 }, async () => {
  const { yosysNode } = await import('../core/synth-open-node.js');
  // Yosys, then the INIT of the first 2-input LUT that feeds an output inverted
  const run = async (args, files, onLine) => {
    const out = await yosysNode(args, files, onLine);
    const k = Object.keys(out).find(f => f.endsWith('.json'));
    const json = JSON.parse(out[k]);
    const mod = Object.values(json.modules).find(m => m.attributes?.top);
    const lut = Object.values(mod.cells).find(c => c.type === 'LUT2');
    lut.parameters.INIT = [...lut.parameters.INIT].map(b => (b === '1' ? '0' : '1')).join('');
    out[k] = JSON.stringify(json);
    return out;
  };
  const sources = [{ path: 'm.v', lang: 'verilog', text: 'module m(input [3:0] a, b, output [3:0] y, output z); assign y = a ^ b; assign z = &a; endmodule' }];
  assert.equal((await diffSynth({ name: 'm', sources, top: 'm', sim: { cycles: 40 } })).status, 'pass');
  const r = await diffSynth({ name: 'm', sources, top: 'm', run, sim: { cycles: 40 } });
  assert.equal(r.status, 'mismatch', r.reason);
});

test('comparison with the run at X: a port differs only when it differs from both runs (#20)', () => {
  const W = [['y', 1], ['en', 1]];
  const at = (y, en) => ({ y, en });
  const b = (v, x = 0n) => ({ v, x });
  // run at 0: en known 0 (the netlist's latch is at 1); run at X: en at X, y taken from a case default
  const rtl = [at(b(1n), b(0n))], rtlX = [at(b(0n), b(0n, 1n))], net = [at(b(1n), b(1n))];
  assert.deepEqual(compareRuns(rtl, net, W), { cycle: 0, ports: ['en'] }, 'the run at 0 alone');
  assert.deepEqual(compareRuns(rtlX, net, W), { cycle: 0, ports: ['y'] }, 'the run at X alone');
  assert.equal(compareRuns(rtl, net, W, 0, rtlX), null, 'each port agrees with one of the runs');
  // the same value known in both runs, another in the netlist: still a difference
  assert.deepEqual(compareRuns([at(b(1n), b(1n))], [at(b(0n), b(1n))], W, 0, [at(b(1n), b(1n))]), { cycle: 0, ports: ['y'] });
  // a 2-bit port: its value must agree with one run, not bit 0 with one and bit 1 with the other
  const W2 = [['q', 2]];
  assert.deepEqual(compareRuns([{ q: b(1n) }], [{ q: b(3n) }], W2, 0, [{ q: b(2n) }]), { cycle: 0, ports: ['q'] }, 'not a value made of bits of both runs');
  assert.equal(compareRuns([{ q: b(1n) }], [{ q: b(3n) }], W2, 0, [{ q: b(1n, 2n) }]), null, 'bit 1 at X in the run at X, bit 0 equal');
  assert.deepEqual(compareRuns([{ q: b(1n) }], [{ q: b(1n, 1n) }], W2, 0, [{ q: b(0n, 2n) }]), { cycle: 0, ports: ['q'] }, 'an X of the netlist where both runs know the bit');
});

// #20 (found on the design corpus's vtr-ch-intrinsics): a state register without reset nor
// initial value. In the RTL run with X's, the case on the state takes its default (y = 0) where
// the netlist, from its defined power-up, does not; in the run at 0, the latch en (only ever set
// to 1) is 0 where Yosys made it a constant 1. Neither run agrees alone: each port agrees with one.
const XCASE = `module xcase(input clk, input [1:0] d, output reg y, output reg en);
  reg [1:0] st;
  always @(posedge clk) st <= st + d;
  always @* case (st) 2'b00: y = 1; 2'b01: y = 0; 2'b10: y = 1; default: y = 0; endcase
  always @* if (st == 2'b11) en = 1;
endmodule
`;
const XCASE_WARNINGS = ["Warning: Latch inferred for signal `\\xcase.\\en' from process `\\xcase.$proc$xcase_syn.v:31$4': $auto$proc_dlatch.cc:557:proc_dlatch$1113"];

test('a case taking its default on an X state at power-up is not a mismatch (#20)', { timeout: 120000 }, async () => {
  const sources = [{ path: 'xcase.v', lang: 'verilog', text: XCASE }];
  const r = await diffSynth({ name: 'xcase', sources, top: 'xcase', sim: { cycles: 60 } });
  expectPass(r);
  assert.equal(r.powerUp, 'x');
  assert.deepEqual(r.warnings, XCASE_WARNINGS);
  // each rule alone reports the false difference
  const r0 = await diffSynth({ name: 'xcase', sources, top: 'xcase', sim: { cycles: 60 }, powerUp: true });
  assert.equal(r0.status, 'mismatch'); assert.equal(r0.reason, 'cycle 0: en');
  assert.deepEqual(r0.warnings, XCASE_WARNINGS);
  const rx = await diffSynth({ name: 'xcase', sources, top: 'xcase', sim: { cycles: 60 }, powerUp: false });
  assert.equal(rx.status, 'mismatch'); assert.equal(rx.reason, 'cycle 1: y');
  assert.deepEqual(rx.warnings, XCASE_WARNINGS);
});

test('a real difference is still reported with both power-up runs (#20)', { timeout: 120000 }, async () => {
  const { yosysNode } = await import('../core/synth-open-node.js');
  // Yosys, then the cell that drives y's output buffer inverted (an INV made a BUF, a LUT's INIT)
  const run = async (args, files, onLine) => {
    const out = await yosysNode(args, files, onLine);
    const k = Object.keys(out).find(f => f.endsWith('.json'));
    const json = JSON.parse(out[k]);
    const mod = Object.values(json.modules).find(m => m.attributes?.top), cells = Object.values(mod.cells);
    const obuf = cells.find(c => c.type === 'OBUF' && c.connections.O.some(n => mod.ports.y.bits.includes(n)));
    const cell = cells.find(c => c.connections.O?.[0] === obuf.connections.I[0]);
    if (cell.type === 'INV') cell.type = 'BUF';
    else cell.parameters.INIT = [...cell.parameters.INIT].map(x => (x === '1' ? '0' : '1')).join('');
    out[k] = JSON.stringify(json);
    return out;
  };
  const r = await diffSynth({ name: 'xcase', sources: [{ path: 'xcase.v', lang: 'verilog', text: XCASE }], top: 'xcase', run, sim: { cycles: 60 } });
  assert.equal(r.status, 'mismatch', r.reason);
  assert.equal(r.reason, 'cycle 0: y');
  assert.deepEqual(r.warnings, XCASE_WARNINGS);
  assert.ok(r.mismatch.rtlX, 'the run at X was made');
  // both runs have y = 0 at cycle 0 (st = 1; at X: the default), the netlist 1 (a line 'RTL (X)'
  // shows the run at X only where it differs from the run at 0)
  assert.equal(r.report, 'xcase: the netlist differs from the RTL at cycle 0 (engine cells, seed "xcase")\n  inputs  d=1 (clocks clk)\n  RTL     y=0\n  netlist y=1');
  assert.deepEqual(r.mismatch.rtlX.y, { v: 0n, x: 0n });
});

// Regressions of core/synth-verilog.js found on Yosys's test designs (asicworld gray_counter,
// simple/signedexpr.v, simple/partsel.v, simple/defvalue.sv): Yosys 0.68 sized an xor of size
// casts inside a concatenation at the casts' operand width; {a + b} of signed operands is
// unsigned; a part-select starting below bit 0 keeps its bits in range; an unconnected input with a
// default value and an output variable with an initializer.
test('synthesis front end: concatenations of casts, {signed}, negative part-select bases, port defaults', { timeout: 120000 }, async () => {
  const text = `module sub(input clk, input [3:0] d = 10, output logic [3:0] q = 2); always @(posedge clk) q <= q + d; endmodule
module top(input clk, input rst, input en, input signed [1:0] a, input signed [2:0] b, input [31:0] din, input signed [4:0] n,
    output [7:0] gray, output [3:0] ys, output reg [31:0] dout, output [3:0] q);
  reg [7:0] count;
  always @(posedge clk) if (rst) count <= 0; else if (en) count <= count + 1;
  assign gray = {count[7], count[7] ^ count[6], count[6] ^ count[5], count[5] ^ count[4], count[4] ^ count[3], count[3] ^ count[2], count[2] ^ count[1], count[1] ^ count[0]};
  assign ys = {a + b} + 3'sd0;
  always @* begin dout = 0; dout[n + 1 +: 2] = din[n +: 2]; end
  sub s(.clk(clk), .q(q));
endmodule`;
  const r = await diffSynth({ name: 'syn', sources: [{ path: 'syn.v', lang: 'verilog', text }], top: 'top', sim: { cycles: 120 }, powerUp: true });
  expectPass(r);
  expectWarnings('synth-diff: synthesis front end', r.warnings);
});

// Regression (#9, found on the design corpus's spi-fpga-master): a VHDL state machine whose state
// signal has no initial value and no reset powers up in its first state (T'left) in the RTL; the
// netlist started in another state (Yosys re-encoded the state register freely)
test('VHDL enumeration state machine without a reset: the netlist powers up in the first state (#9)', { timeout: 120000 }, async () => {
  const text = `library ieee; use ieee.std_logic_1164.all;
entity fsm_pu is port (clk, go : in std_logic; busy, done : out std_logic; st : out std_logic_vector(1 downto 0)); end;
architecture rtl of fsm_pu is
  type state_t is (idle, load, run, finish);
  signal s : state_t;
begin
  process (clk) begin
    if rising_edge(clk) then
      case s is
        when idle => if go = '1' then s <= load; end if;
        when load => s <= run;
        when run => if go = '0' then s <= finish; end if;
        when finish => s <= idle;
      end case;
    end if;
  end process;
  busy <= '1' when s = load or s = run else '0';
  done <= '1' when s = finish else '0';
  st <= "00" when s = idle else "01" when s = load else "10" when s = run else "11";
end;`;
  const r = await diffSynth({ name: 'fsm_pu', sources: [{ path: 'fsm_pu.vhd', lang: 'vhdl', text }], top: 'fsm_pu', sim: { cycles: 100 }, powerUp: true });
  expectPass(r);
  assert.ok(r.states > 1, `the outputs change (${r.states} states)`);
  expectWarnings('synth-diff: VHDL enumeration state machine without a reset', r.warnings);
});

// Regression (#15): a generic design with an optional port of N = 0 bits (a null range)
test('VHDL null ranges: a generic design with ports and signals of N = 0 bits (#15)', { timeout: 120000 }, async () => {
  const text = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity opt is
  generic (N : natural := 0);
  port (clk : in std_logic; a : in std_logic_vector(3 downto 0); x : in std_logic_vector(N - 1 downto 0);
        y : out std_logic_vector(N + 3 downto 0); n_out : out std_logic_vector(N - 1 downto 0); cnt : out unsigned(3 downto 0));
end;
architecture rtl of opt is
  signal r : std_logic_vector(N - 1 downto 0);
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  y <= x & a;
  n_out <= r;
  process (clk) begin
    if rising_edge(clk) then
      r <= x;
      for i in 0 to N - 1 loop c <= c + 1; end loop;
      if N = 0 then c <= c + 3; end if;
    end if;
  end process;
  cnt <= c;
end;
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity top is port (clk : in std_logic; a : in std_logic_vector(3 downto 0); y : out std_logic_vector(3 downto 0); cnt : out unsigned(3 downto 0)); end;
architecture rtl of top is
  signal none : std_logic_vector(-1 downto 0);
begin
  u : entity work.opt generic map (N => 0) port map (clk => clk, a => a, x => none, y => y, n_out => open, cnt => cnt);
end;`;
  const r = await diffSynth({ name: 'null_range', sources: [{ path: 'opt.vhd', lang: 'vhdl', text }], top: 'top', sim: { cycles: 100 }, powerUp: true });
  expectPass(r);
  assert.ok(r.states > 1, `the outputs change (${r.states} states)`);
  expectWarnings('synth-diff: VHDL null ranges', r.warnings);
});

test('example projects: RTL and Yosys netlist agree',{ timeout: 600000 }, async (t) => {
  for (const name of fs.readdirSync(path.join(ROOT, 'examples')).sort()) {
    const pj = path.join('examples', name, 'silinx.json');
    if (!fs.existsSync(path.join(ROOT, pj))) continue;
    const proj = JSON.parse(read(pj));
    await t.test(name, async () => {
      const sources = proj.files.filter(f => f.role !== 'sim').map(f => ({ path: f.path, lang: f.lang, text: read('examples', name, f.path) }));
      const r = await diffSynth({ name, sources, top: proj.top, sim: { cycles: 300 } });
      expectPass(r);
      expectWarnings(`examples/${name}`, r.warnings);
    });
  }
});

test('test fixtures: VHDL and Verilog designs agree with their netlists', { timeout: 600000 }, async (t) => {
  const vhd = ['util_pkg.vhd', 'counter.vhd', 'reg_n.vhd', 'fsm.vhd', 'seg7.vhd', 'top.vhd'].map(f => src('test', 'fixtures', 'vhdl', f));
  const cases = [
    ['vhdl/top (generate, package, hierarchy)', vhd, 'top'],
    ['vhdl/seq_detect', vhd, 'seq_detect'],
    ['vhdl/seg7', vhd, 'seg7'],
    ['vhdl/counter', vhd, 'counter'],
    ['verilog/counter_top', [src('test', 'fixtures', 'verilog', 'counter_top.v')], 'top'],
  ];
  for (const [name, sources, top] of cases) {
    await t.test(name, async () => {
      const r = await diffSynth({ name, sources, top, sim: { cycles: 300 } });
      expectPass(r);
      assert.ok(r.states > 1, `${name}: the outputs change (${r.states} states)`);
      expectWarnings(`fixtures/${name}`, r.warnings);
    });
  }
});

// Regression (#69, #10): records packed into vectors, arrays of records, record ports on array
// elements, through Yosys: the netlist behaves as the RTL
test('VHDL records and arrays of records through Yosys: the netlist behaves as the RTL (#69, #10)', { timeout: 300000 }, async () => {
  const text = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'vhdl-records.vhd'), 'utf8');
  const r = await diffSynth({ name: 'rtop', sources: [{ path: 'vhdl-records.vhd', lang: 'vhdl', text }], top: 'rtop', sim: { cycles: 200 }, powerUp: true });
  expectPass(r);
  assert.ok(r.states > 10, `the outputs change (${r.states} states)`);
  expectWarnings('synth-diff: VHDL records and arrays of records', r.warnings);
});

// Regression (#60): a VHDL integer signal with no initial value starts at T'left in simulation (1 for
// range 1 to 10); an output port with a default value connected straight to its actual starts at
// it. The netlist started both at 0
test('VHDL integers start at T\'left and output ports at their default value in the netlist too (#60)', { timeout: 120000 }, async () => {
  const text = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tgl is port (clk, en : in std_logic; q : buffer std_logic := '1'); end;
architecture a of tgl is begin
  process (clk) begin if rising_edge(clk) then if en = '1' then q <= not q; end if; end if; end process;
end;
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity ints is port (clk, en : in std_logic; q : out std_logic; c : out unsigned(3 downto 0); d : out unsigned(2 downto 0)); end;
architecture a of ints is
  signal k : integer range 1 to 10;
  signal m : integer range -3 to 3;
begin
  u : entity work.tgl port map (clk => clk, en => en, q => q);
  process (clk) begin
    if rising_edge(clk) then
      if en = '1' then
        if k = 10 then k <= 1; else k <= k + 1; end if;
        if m = 3 then m <= -3; else m <= m + 1; end if;
      end if;
    end if;
  end process;
  c <= to_unsigned(k, 4);
  d <= unsigned(to_signed(m, 3));
end;`;
  const r = await diffSynth({ name: 'ints', sources: [{ path: 'ints.vhd', lang: 'vhdl', text }], top: 'ints', sim: { cycles: 80, prob: { en: 0.3 } }, powerUp: true });
  expectPass(r);
  assert.ok(r.states > 5, `the outputs change (${r.states} states)`);
  expectWarnings('synth-diff: VHDL integers and port defaults start values', r.warnings);
});

// #229: a conversion that changes the sign and the width (to_unsigned(8389, 14) of an integer) was written
// 14'($signed(i)), which a size cast keeps signed: sign-extended in a wider product, the stopwatch's
// thousands were wrong (7 shown as 15 1 0 7); the stopwatch's to_decimal over all its values
test('open synthesis: the stopwatch\'s to_decimal (to_unsigned of an integer in a product) over 0 .. 9999, netlist = RTL (#229)', { timeout: 300000 }, async () => {
  const fs = await import('node:fs');
  const text = fs.readFileSync(new URL('../examples/stopwatch/src/to_decimal.vhd', import.meta.url), 'utf8');
  const { compile, elaborate } = await import('../core/compile.js');
  const { synthesizeOpen } = await import('../core/synth-open.js');
  const { yosysNode } = await import('../core/synth-open-node.js');
  const { compareNetlist } = await import('./diff-synth.js');
  const design = elaborate(compile([{ path: 'to_decimal.vhd', lang: 'vhdl', text }]), 'to_decimal');
  const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
  const d = compareNetlist(design, r, { name: 'to_decimal', sim: { cycles: 400, ranges: { value: [0, 9999] } } });
  assert.equal(d.status, 'pass', d.report || d.reason);
});

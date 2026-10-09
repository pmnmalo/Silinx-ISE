// Netlist simulation: UNISIM / SIMPRIM primitive models, native evaluation, regrouping, scalarizing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { primitiveSources, usesUnisim, usesSimprim } from '../core/unisim.js';
import { regroupNetlist, scalarizeNetlist, parseNetgenVhdl } from '../core/netlist-hier.js';

// a netgen-style post-synthesis netlist: 2-bit counter (LUTs + FDC) with an enable, IBUF/OBUF/BUFGP
const NET = `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;
use UNISIM.VPKG.ALL;

entity top is
  port (
    clk : in STD_LOGIC := 'X';
    rst : in STD_LOGIC := 'X';
    en : in STD_LOGIC := 'X';
    q : out STD_LOGIC_VECTOR ( 1 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal clk_BUFGP : STD_LOGIC;
  signal rst_IBUF : STD_LOGIC;
  signal en_IBUF : STD_LOGIC;
  signal cnt_cnt_q : STD_LOGIC_VECTOR ( 1 downto 0 );
  signal cnt_cnt_d : STD_LOGIC_VECTOR ( 1 downto 0 );
begin
  clk_BUFGP_0 : BUFGP
    port map (
      I => clk,
      O => clk_BUFGP
    );
  rst_IBUF_1 : IBUF
    port map (
      I => rst,
      O => rst_IBUF
    );
  en_IBUF_2 : IBUF
    port map (
      I => en,
      O => en_IBUF
    );
  cnt_lut0 : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => cnt_cnt_q(0),
      I1 => en_IBUF,
      O => cnt_cnt_d(0)
    );
  cnt_lut1 : LUT3
    generic map(
      INIT => X"78"
    )
    port map (
      I0 => cnt_cnt_q(0),
      I1 => en_IBUF,
      I2 => cnt_cnt_q(1),
      O => cnt_cnt_d(1)
    );
  cnt_ff0 : FDC
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP,
      CLR => rst_IBUF,
      D => cnt_cnt_d(0),
      Q => cnt_cnt_q(0)
    );
  cnt_ff1 : FDC
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP,
      CLR => rst_IBUF,
      D => cnt_cnt_d(1),
      Q => cnt_cnt_q(1)
    );
  q_0_OBUF : OBUF
    port map (
      I => cnt_cnt_q(0),
      O => q(0)
    );
  q_1_OBUF : OBUF
    port map (
      I => cnt_cnt_q(1),
      O => q(1)
    );

end STRUCTURE;
`;

function counts(text) {
  const srcs = [{ path: 'n.vhd', lang: 'vhdl', text }];
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  assert.deepEqual(lib.errors.filter((e) => e.severity !== 'warning'), []);
  const d = elaborate(lib, 'top');
  assert.deepEqual(d.diags, []);
  const sim = new Simulator(d);
  const port = (n) => d.top.ports.find((p) => p.name === n).sig;
  sim.force(port('rst'), V.ONE); sim.force(port('en'), V.ONE);
  sim.addClock(port('clk'), { period: 10000 });
  sim.run(15000);
  sim.force(port('rst'), V.ZERO);
  const out = [];
  for (let i = 0; i < 6; i++) { sim.run(sim.now + 10000); out.push(Number(port('q').val.v)); }
  sim.force(port('en'), V.ZERO);
  sim.run(sim.now + 30000); out.push(Number(port('q').val.v));
  return { out, procs: d.procs };
}

test('netgen netlist: UNISIM primitives (native) count like the RTL would', () => {
  assert.ok(usesUnisim(NET) && !usesSimprim(NET));
  const { out, procs } = counts(NET);
  assert.deepEqual(out, [1, 2, 3, 0, 1, 2, 2]);
  assert.ok(procs.some((p) => p.mode === 'native'), 'primitives run as native processes');
});

test('scalarizeNetlist and regroupNetlist keep the behaviour', () => {
  const sc = scalarizeNetlist(NET);
  assert.match(sc, /signal cnt_cnt_q_0 : STD_LOGIC;/);
  assert.doesNotMatch(sc, /cnt_cnt_q\(0\)/);
  assert.deepEqual(counts(sc).out, [1, 2, 3, 0, 1, 2, 2]);
  const r = regroupNetlist(NET, ['cnt']);
  assert.deepEqual(r.groups, { cnt: 4 });
  assert.equal(r.topPrimitives, 5);
  assert.match(r.text, /entity cnt is/);
  assert.deepEqual(counts(r.text).out, [1, 2, 3, 0, 1, 2, 2]);
  assert.equal(parseNetgenVhdl(NET).instances.length, 9);
});

test('SIMPRIM netlist (post-place & route style) with X_LUT / X_FF / ROC', () => {
  const t = NET.replace('library UNISIM;\nuse UNISIM.VCOMPONENTS.ALL;\nuse UNISIM.VPKG.ALL;', 'library SIMPRIM;\nuse SIMPRIM.VCOMPONENTS.ALL;\nuse SIMPRIM.VPACKAGE.ALL;')
    .replace(/cnt_lut0 : LUT2[\s\S]*?\);\n/, `cnt_lut0 : X_LUT2
    generic map(
      INIT => X"6",
      LOC => "SLICE_X1Y1"
    )
    port map (
      ADR0 => cnt_cnt_q(0),
      ADR1 => en_IBUF,
      O => cnt_cnt_d(0)
    );
  NlwBlockROC : X_ROC
    port map (O => GSR);
`);
  assert.ok(usesSimprim(t));
  assert.deepEqual(counts(t).out, [1, 2, 3, 0, 1, 2, 2]);
});

// ---------------------------------------------------------------------------------------------
// a netgen-style netlist `main` around `body`; `ports` / `signals`: declarations
const LIBS = { UNISIM: 'library UNISIM;\nuse UNISIM.VCOMPONENTS.ALL;', SIMPRIM: 'library SIMPRIM;\nuse SIMPRIM.VCOMPONENTS.ALL;\nuse SIMPRIM.VPACKAGE.ALL;' };
const netlist = (ports, body, signals = [], lib = 'UNISIM') => `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
${LIBS[lib]}

entity main is
  port (
${ports.map((p) => `    ${p}`).join(';\n')}
  );
end main;

architecture STRUCTURE of main is
${signals.map((s) => `  signal ${s};`).join('\n')}
begin
${body}
end STRUCTURE;
`;
/** Compile + elaborate (native primitives, or their VHDL models with native = false); the design must be clean. */
function build(text, { native = true, scalarize = true } = {}) {
  const net = { path: 'n.vhd', lang: 'vhdl', text: scalarize ? scalarizeNetlist(text) : text };
  const prims = primitiveSources([net]).map((p) => (native ? p : { ...p, path: p.path.replace('<silinx>/', 'models/') }));
  const lib = compile([...prims, net]);
  assert.deepEqual(lib.errors.filter((e) => e.severity !== 'warning').map((e) => e.message), []);
  const d = elaborate(lib, 'main');
  assert.deepEqual(d.diags.map((e) => e.message), []);
  const sim = new Simulator(d);
  const port = (n) => d.top.ports.find((p) => p.name === n).sig;
  const val = (n) => { const v = port(n).val; return v.x ? V.toBin(v).toLowerCase() : Number(v.v); };
  const set = (n, v) => sim.force(port(n), typeof v === 'object' ? v : V.fromInt(v, port(n).t.w));
  return { d, sim, port, val, set, step: (ps = 10000) => sim.run(sim.now + ps) };
}

test('latches: INIT honoured, LDP / LDPE start at 1', () => {
  const t = netlist(['g : in STD_LOGIC', 'd : in STD_LOGIC', 'q1 : out STD_LOGIC', 'q2 : out STD_LOGIC', 'q3 : out STD_LOGIC', 'q4 : out STD_LOGIC'], `
  l1 : LDP
    port map (D => d, G => g, PRE => z, Q => q1);
  l2 : LD
    generic map(
      INIT => '1'
    )
    port map (D => d, G => g, Q => q2);
  l3 : LDCE
    port map (D => d, G => g, GE => g, CLR => z, Q => q3);
  l4 : LD_1
    port map (D => d, G => g, Q => q4);
  zz : GND
    port map (G => z);`, ['z : STD_LOGIC']);
  for (const native of [true, false]) {
    const b = build(t, { native });
    b.set('g', 0); b.set('d', 0);
    b.sim.run(0); b.step();
    assert.deepEqual(['q1', 'q2', 'q3'].map(b.val), [1, 1, 0]);
    assert.equal(b.val('q4'), 0);            // gate active low: transparent at G = 0
    b.set('g', 1); b.set('d', 0); b.step();
    assert.deepEqual(['q1', 'q2', 'q3', 'q4'].map(b.val), [0, 0, 0, 0]);
  }
});

test('mux primitives agree between the native and the VHDL models when the select is X', () => {
  const t = netlist(['s : in STD_LOGIC', 'a : in STD_LOGIC', 'b : in STD_LOGIC', 'o1 : out STD_LOGIC', 'o2 : out STD_LOGIC'], `
  m1 : MUXCY
    port map (CI => a, DI => b, S => s, O => o1);
  m2 : MUXF5
    port map (I0 => a, I1 => b, S => s, O => o2);`);
  const tx = netlist(['s : in STD_LOGIC', 'a : in STD_LOGIC', 'b : in STD_LOGIC', 'o1 : out STD_LOGIC', 'o2 : out STD_LOGIC'], `
  m1 : X_MUX2
    port map (IA => a, IB => b, SEL => s, O => o1);
  m2 : X_BUFGMUX
    port map (I0 => a, I1 => b, S => s, O => o2);`, [], 'SIMPRIM');
  for (const text of [t, tx]) {
    const res = [true, false].map((native) => {
      const b = build(text, { native });
      const out = [];
      for (const [s, a, c] of [[V.X1, 0, 1], [V.X1, 1, 1], [V.X1, 0, 0], [V.ZERO, 0, 1], [V.ONE, 0, 1]]) {
        b.set('s', s); b.set('a', a); b.set('b', c); b.step();
        out.push(`${b.val('o1')}${b.val('o2')}`);
      }
      return out;
    });
    assert.deepEqual(res[0], res[1]);
    assert.deepEqual(res[0].slice(0, 3), ['xx', '11', '00']);
  }
});

test('parseNetgenVhdl / regroupNetlist: top entity of a multi-entity netlist, generic clause, other entities kept', () => {
  const sub = `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity sub is
  port (
    a : in STD_LOGIC := 'X';
    y : out STD_LOGIC
  );
end sub;

architecture STRUCTURE of sub is
begin
  u_inv : INV
    port map (
      I => a,
      O => y
    );
end STRUCTURE;
`;
  const top = netlist(['a : in STD_LOGIC := \'X\'', 'y : out STD_LOGIC'], `
  u : sub
    port map (
      a => a,
      y => n1
    );
  g_inv : INV
    port map (
      I => n1,
      O => y
    );`, ['n1 : STD_LOGIC']).replace('entity main is\n', 'entity main is\n  generic (\n    W : integer := 4\n  );\n');
  const text = `${sub}\n${top}`;
  const p = parseNetgenVhdl(text);
  assert.equal(p.entity, 'main');
  assert.equal(p.generics, 'W : integer := 4');
  assert.deepEqual(p.instances.map((i) => i.name), ['u', 'g_inv']);
  assert.match(p.others, /entity sub is/);
  assert.equal(parseNetgenVhdl(text, 'sub').entity, 'sub');
  const r = regroupNetlist(text, ['g']);
  assert.match(r.text, /entity sub is/);
  assert.match(r.text, /entity main is\n {2}generic \(/);
  assert.deepEqual(r.groups, { g: 1 });
  assert.match(r.text, /entity g is\n {2}port \(\n {4}n1 : in STD_LOGIC;\n {4}y : out STD_LOGIC/);   // `u : sub` drives n1
  const b = build(r.text, { scalarize: false });
  b.set('a', 1); b.step(); assert.equal(b.val('y'), 1);
  b.set('a', 0); b.step(); assert.equal(b.val('y'), 0);
});

test('regroupNetlist: pin directions per primitive (latch gate is an input, inout pads stay inout)', () => {
  const t = netlist(['clk : in STD_LOGIC := \'X\'', 'd : in STD_LOGIC := \'X\'', 't : in STD_LOGIC := \'X\'', 'q : out STD_LOGIC', 'pad : inout STD_LOGIC'], `
  ga_ff : FD
    port map (C => clk, D => d, Q => ga_g);
  gb_lat : LD
    port map (D => d, G => ga_g, Q => q_i);
  q_OBUF : OBUF
    port map (I => q_i, O => q);
  io_pad_IOBUF : IOBUF
    port map (I => d, T => t, O => open_o, IO => pad);`, ['ga_g : STD_LOGIC', 'q_i : STD_LOGIC', 'open_o : STD_LOGIC']);
  const r = regroupNetlist(t, ['ga', 'gb', 'io']);
  const ports = (e) => r.text.match(new RegExp(`entity ${e} is\\n {2}port \\(([\\s\\S]*?)\\);`))[1].trim().split(/;\s*/);
  assert.deepEqual(ports('gb'), ['d : in STD_LOGIC', 'ga_g : in STD_LOGIC', 'q_i : out STD_LOGIC']);
  assert.deepEqual(ports('ga'), ['clk : in STD_LOGIC', 'd : in STD_LOGIC', 'ga_g : out STD_LOGIC']);
  assert.ok(ports('io').includes('pad : inout STD_LOGIC'));
  const b = build(r.text, { scalarize: false });
  b.set('t', 0); b.set('d', 1); b.step();
  assert.equal(b.val('pad'), 1);
  b.set('t', 1); b.step();
  assert.equal(b.val('pad'), 'z');
});

test('UNISIM models: SRLC16E, RAM16X1D, BUFGMUX / BUFGCE / BUFGCE_1, DCM_SP', () => {
  const t = netlist(['clk : in STD_LOGIC', 'd : in STD_LOGIC', 'we : in STD_LOGIC', 'ce : in STD_LOGIC', 's : in STD_LOGIC',
    'a : in STD_LOGIC_VECTOR ( 3 downto 0 )', 'b : in STD_LOGIC_VECTOR ( 3 downto 0 )',
    'q : out STD_LOGIC', 'q15 : out STD_LOGIC', 'spo : out STD_LOGIC', 'dpo : out STD_LOGIC', 'o1 : out STD_LOGIC', 'o2 : out STD_LOGIC', 'o3 : out STD_LOGIC',
    'c0 : out STD_LOGIC', 'c180 : out STD_LOGIC', 'locked : out STD_LOGIC'], `
  sr : SRLC16E
    generic map(
      INIT => X"8001"
    )
    port map (A0 => a(0), A1 => a(1), A2 => a(2), A3 => a(3), CE => ce, CLK => clk, D => d, Q => q, Q15 => q15);
  rm : RAM16X1D
    generic map(
      INIT => X"0004"
    )
    port map (A0 => a(0), A1 => a(1), A2 => a(2), A3 => a(3), DPRA0 => b(0), DPRA1 => b(1), DPRA2 => b(2), DPRA3 => b(3), D => d, WE => we, WCLK => clk, SPO => spo, DPO => dpo);
  mx : BUFGMUX
    port map (I0 => gnd, I1 => vcc, S => s, O => o1);
  ce1 : BUFGCE
    port map (I => vcc, CE => ce, O => o2);
  ce2 : BUFGCE_1
    port map (I => gnd, CE => ce, O => o3);
  dcm : DCM_SP
    generic map(
      CLKDV_DIVIDE => 2.0,
      CLKFX_MULTIPLY => 4,
      CLKIN_PERIOD => 20.0,
      CLK_FEEDBACK => "1X",
      FACTORY_JF => X"C080",
      STARTUP_WAIT => FALSE
    )
    port map (CLKIN => clk, CLKFB => c0_i, RST => gnd, CLK0 => c0_i, CLK180 => c180, LOCKED => locked);
  c0 <= c0_i;
  g0 : GND
    port map (G => gnd);
  v0 : VCC
    port map (P => vcc);`, ['gnd : STD_LOGIC', 'vcc : STD_LOGIC', 'c0_i : STD_LOGIC']);
  const b = build(t);
  b.set('clk', 0); b.set('ce', 0); b.set('s', 0); b.set('a', 0); b.set('b', 2); b.set('we', 0); b.set('d', 1);
  b.sim.run(0); b.step();
  assert.deepEqual(['q', 'q15', 'spo', 'dpo', 'o1', 'o2', 'o3', 'c0', 'c180', 'locked'].map(b.val), [1, 1, 0, 1, 0, 0, 1, 0, 0, 0]);   // the DCM is not locked yet
  // clock: shift in d = 1 (CE), write 1 at address 0
  b.set('ce', 1); b.set('we', 1); b.set('s', 1);
  b.set('clk', 1); b.step(); b.set('clk', 0); b.step();
  b.set('a', 1); b.set('b', 0); b.step();
  assert.deepEqual(['q', 'q15', 'spo', 'dpo', 'o1', 'o2', 'o3', 'c0'].map(b.val), [1, 0, 0, 1, 1, 1, 0, 0]);   // r = 0x0003; RAM(1) = 0; RAM(0) = 1
});

test('UNISIM models: MULT18X18SIO and RAMB16 connected bit by bit (as netgen writes them)', () => {
  const bits = (formal, n, net) => Array.from({ length: n }, (_, i) => `      ${formal}(${n - 1 - i}) => ${net}(${n - 1 - i})`).join(',\n');
  const t = netlist(['clk : in STD_LOGIC', 'we : in STD_LOGIC', 'a : in STD_LOGIC_VECTOR ( 17 downto 0 )', 'b : in STD_LOGIC_VECTOR ( 17 downto 0 )',
    'p : out STD_LOGIC_VECTOR ( 35 downto 0 )', 'addr : in STD_LOGIC_VECTOR ( 10 downto 0 )', 'di : in STD_LOGIC_VECTOR ( 7 downto 0 )',
    'do : out STD_LOGIC_VECTOR ( 7 downto 0 )', 'dop : out STD_LOGIC', 'dob : out STD_LOGIC_VECTOR ( 31 downto 0 )'], `
  m : MULT18X18SIO
    generic map(
      AREG => 0,
      BREG => 0,
      B_INPUT => "DIRECT",
      PREG => 1
    )
    port map (
      CEA => gnd,
      CEB => gnd,
      CEP => vcc,
      CLK => clk,
      RSTA => gnd,
      RSTB => gnd,
      RSTP => gnd,
${bits('A', 18, 'a')},
${bits('B', 18, 'b')},
${bits('BCIN', 18, 'zero18')},
${bits('P', 36, 'p')},
${bits('BCOUT', 18, 'NLW_m_BCOUT')}
    );
  r : RAMB16_S9_S36
    generic map(
      INIT_A => X"155",
      WRITE_MODE_A => "READ_FIRST",
      INIT_00 => X"00000000000000000000000000000000000000000000000000000000BEEF1234",
      INITP_00 => X"0000000000000000000000000000000000000000000000000000000000000002"
    )
    port map (
      CLKA => clk,
      ENA => vcc,
      SSRA => gnd,
      WEA => we,
      CLKB => clk,
      ENB => vcc,
      SSRB => gnd,
      WEB => gnd,
${bits('ADDRA', 11, 'addr')},
${bits('DIA', 8, 'di')},
      DIPA(0) => gnd,
${bits('DOA', 8, 'do')},
      DOPA(0) => dop,
${bits('ADDRB', 9, 'zero18')},
${bits('DIB', 32, 'zero32')},
${bits('DIPB', 4, 'zero18')},
${bits('DOB', 32, 'dob')}
    );
  g0 : GND
    port map (G => gnd);
  v0 : VCC
    port map (P => vcc);
  zero18 <= (others => '0');
  zero32 <= (others => '0');`, ['gnd : STD_LOGIC', 'vcc : STD_LOGIC', 'zero18 : STD_LOGIC_VECTOR ( 17 downto 0 )', 'zero32 : STD_LOGIC_VECTOR ( 31 downto 0 )',
    'NLW_m_BCOUT : STD_LOGIC_VECTOR ( 17 downto 0 )']);
  const b = build(t);
  b.set('clk', 0); b.set('we', 0); b.set('a', 7); b.set('b', (1 << 18) - 3); b.set('addr', 1); b.set('di', 0x42);
  b.sim.run(0); b.step();
  assert.equal(b.val('do'), 0x55);           // INIT_A
  assert.equal(b.val('dop'), 1);
  b.set('clk', 1); b.step(); b.set('clk', 0); b.step();
  assert.equal(BigInt(b.val('p')), (1n << 36n) - 21n);   // 7 * -3
  assert.equal(b.val('do'), 0x12);           // byte 1 of INIT_00
  assert.equal(b.val('dop'), 1);             // parity bit 1 of INITP_00
  assert.equal(b.val('dob'), 0xBEEF1234);    // port B: 32-bit word 0
  b.set('we', 1); b.set('clk', 1); b.step(); b.set('clk', 0); b.step();
  assert.equal(b.val('do'), 0x12);           // READ_FIRST
  b.set('we', 0); b.set('clk', 1); b.step(); b.set('clk', 0); b.step();
  assert.equal(b.val('do'), 0x42);
  assert.equal(b.val('dop'), 0);
  assert.equal(b.val('dob'), 0xBEEF4234);
});

test('SIMPRIM models: X_LATCHE, X_OBUFT on an inout pad, X_SRLC16E, X_RAMD16; a cell without a model is an error', () => {
  const t = netlist(['clk : in STD_LOGIC', 't : in STD_LOGIC', 'pad : inout STD_LOGIC', 'padin : out STD_LOGIC', 'q : out STD_LOGIC', 'r : out STD_LOGIC', 'm : out STD_LOGIC'], `
  ob : X_OBUFT
    port map (I => vcc, CTL => t, O => pad);
  ib : X_BUF
    port map (I => pad, O => padin);
  la : X_LATCHE
    generic map(
      INIT => '1'
    )
    port map (I => gnd, GE => t, CLK => clk, SET => gnd, RST => gnd, O => q);
  sr : X_SRLC16E
    generic map(
      INIT => X"0002"
    )
    port map (A0 => vcc, A1 => gnd, A2 => gnd, A3 => gnd, CE => gnd, CLK => clk, D => gnd, Q => r, Q15 => open);
  rm : X_RAMD16
    generic map(
      INIT => X"0002"
    )
    port map (RADR0 => vcc, RADR1 => gnd, RADR2 => gnd, RADR3 => gnd, WADR0 => gnd, WADR1 => gnd, WADR2 => gnd, WADR3 => gnd, I => gnd, WE => gnd, CLK => clk, O => m);
  g0 : X_ZERO
    port map (O => gnd);
  v0 : X_ONE
    port map (O => vcc);`, ['gnd : STD_LOGIC', 'vcc : STD_LOGIC'], 'SIMPRIM');
  const b = build(t);
  b.set('clk', 0); b.set('t', 0);
  b.sim.run(0); b.step();
  assert.deepEqual(['pad', 'padin', 'q', 'r', 'm'].map(b.val), [1, 1, 1, 1, 1]);
  b.set('t', 1); b.set('clk', 1); b.step();
  assert.deepEqual(['pad', 'q'].map(b.val), ['z', 0]);
  const bad = netlist(['a : in STD_LOGIC', 'y : out STD_LOGIC'], '  u : X_NO_SUCH_CELL\n    port map (I => a, O => y);', [], 'SIMPRIM');
  const srcs = [{ path: 'n.vhd', lang: 'vhdl', text: bad }];
  const d = elaborate(compile([...primitiveSources(srcs), ...srcs]), 'main');
  assert.ok(d.top && d.diags.some((e) => e.severity === 'error' && /x_no_such_cell/i.test(e.message)));
});

// `formal(i) => net` for i = lo + n - 1 down to lo, '#' in `net` replaced by i - lo
const pinBits = (formal, n, net, lo = 0) => Array.from({ length: n }, (_, k) => `      ${formal}(${lo + n - 1 - k}) => ${net.replace('#', String(n - 1 - k))}`).join(',\n');

test('SIMPRIM models: X_RAMB16 written and read through both ports, connected bit by bit (as netgen writes them)', () => {
  const t = netlist(['clk : in STD_LOGIC', 'we : in STD_LOGIC', 'web : in STD_LOGIC', 'addra : in STD_LOGIC_VECTOR ( 10 downto 0 )',
    'addrb : in STD_LOGIC_VECTOR ( 8 downto 0 )', 'di : in STD_LOGIC_VECTOR ( 7 downto 0 )', 'dib : in STD_LOGIC_VECTOR ( 31 downto 0 )',
    'do : out STD_LOGIC_VECTOR ( 7 downto 0 )', 'dop : out STD_LOGIC', 'dob : out STD_LOGIC_VECTOR ( 31 downto 0 )', 'dopb : out STD_LOGIC_VECTOR ( 3 downto 0 )'], `
  r : X_RAMB16
    generic map(
      LOC => "RAMB16_X0Y1",
      DOA_REG => 0,
      DOB_REG => 0,
      INIT_A => X"000000155",
      INIT_B => X"000000000",
      INVERT_CLK_DOA_REG => FALSE,
      INVERT_CLK_DOB_REG => FALSE,
      RAM_EXTENSION_A => "NONE",
      RAM_EXTENSION_B => "NONE",
      READ_WIDTH_A => 9,
      READ_WIDTH_B => 36,
      SIM_COLLISION_CHECK => "ALL",
      SRVAL_A => X"000000000",
      SRVAL_B => X"000000000",
      WRITE_MODE_A => "READ_FIRST",
      WRITE_MODE_B => "WRITE_FIRST",
      WRITE_WIDTH_A => 9,
      WRITE_WIDTH_B => 36,
      SETUP_ALL => 266 ps,
      SETUP_READ_FIRST => 266 ps,
      INIT_00 => X"00000000000000000000000000000000000000000000000000000000BEEF1234",
      INITP_00 => X"0000000000000000000000000000000000000000000000000000000000000002"
    )
    port map (
      CLKA => clk,
      CLKB => clk,
      ENA => vcc,
      ENB => vcc,
      REGCEA => gnd,
      REGCEB => gnd,
      SSRA => gnd,
      SSRB => gnd,
      CASCADEINA => gnd,
      CASCADEINB => gnd,
      CASCADEOUTA => NLW_r_CASCADEOUTA_UNCONNECTED,
      CASCADEOUTB => NLW_r_CASCADEOUTB_UNCONNECTED,
      ADDRA(14) => gnd,
${pinBits('ADDRA', 11, 'addra(#)', 3)},
${pinBits('ADDRA', 3, 'gnd')},
      ADDRB(14) => gnd,
${pinBits('ADDRB', 9, 'addrb(#)', 5)},
${pinBits('ADDRB', 5, 'gnd')},
${pinBits('DIA', 24, 'gnd', 8)},
${pinBits('DIA', 8, 'di(#)')},
${pinBits('DIPA', 4, 'gnd')},
${pinBits('DIB', 32, 'dib(#)')},
${pinBits('DIPB', 4, 'gnd')},
${pinBits('WEA', 4, 'we')},
${pinBits('WEB', 4, 'web')},
${pinBits('DOA', 24, 'NLW_r_DOA_UNCONNECTED(#)', 8)},
${pinBits('DOA', 8, 'do(#)')},
      DOPA(3) => NLW_r_DOPA_UNCONNECTED(3),
      DOPA(2) => NLW_r_DOPA_UNCONNECTED(2),
      DOPA(1) => NLW_r_DOPA_UNCONNECTED(1),
      DOPA(0) => dop,
${pinBits('DOB', 32, 'dob(#)')},
${pinBits('DOPB', 4, 'dopb(#)')}
    );
  g0 : X_ZERO
    port map (O => gnd);
  v0 : X_ONE
    port map (O => vcc);`, ['gnd : STD_LOGIC', 'vcc : STD_LOGIC', 'NLW_r_CASCADEOUTA_UNCONNECTED : STD_LOGIC', 'NLW_r_CASCADEOUTB_UNCONNECTED : STD_LOGIC',
    'NLW_r_DOA_UNCONNECTED : STD_LOGIC_VECTOR ( 23 downto 0 )', 'NLW_r_DOPA_UNCONNECTED : STD_LOGIC_VECTOR ( 3 downto 1 )'], 'SIMPRIM');
  const b = build(t);
  // inputs settle (bit-by-bit glue) before the edge
  const clock = () => { b.step(); b.set('clk', 1); b.step(); b.set('clk', 0); b.step(); };
  b.set('clk', 0); b.set('we', 0); b.set('web', 0); b.set('addra', 1); b.set('addrb', 0); b.set('di', 0x42); b.set('dib', 0xCAFE0077);
  b.sim.run(0); b.step();
  assert.deepEqual(['do', 'dop', 'dob'].map(b.val), [0x55, 1, 0]);      // INIT_A / INIT_B
  clock();
  assert.deepEqual(['do', 'dop', 'dob', 'dopb'].map(b.val), [0x12, 1, 0xBEEF1234, 2]);   // A: byte 1 + parity bit 1; B: word 0
  b.set('we', 1); clock();
  assert.equal(b.val('do'), 0x12);           // READ_FIRST
  b.set('we', 0); clock();
  assert.deepEqual(['do', 'dop', 'dob', 'dopb'].map(b.val), [0x42, 0, 0xBEEF4234, 0]);   // written through A, read through B
  b.set('web', 1); clock();
  assert.equal(b.val('dob'), 0xCAFE0077);    // WRITE_FIRST
  b.set('web', 0); clock();
  assert.equal(b.val('do'), 0x00);           // written through B, read through A
  b.set('addra', 3); clock();
  assert.equal(b.val('do'), 0xCA);
});

test('SIMPRIM models: X_DCM_SP clocks a counter, LOCKED after a few cycles', () => {
  const t = netlist(['clk : in STD_LOGIC', 'rst : in STD_LOGIC', 'q : out STD_LOGIC_VECTOR ( 1 downto 0 )', 'locked : out STD_LOGIC'], `
  clk_ibuf : X_CKBUF
    port map (I => clk, O => clkin);
  dcm : X_DCM_SP
    generic map(
      LOC => "DCM_X0Y0",
      CLKDV_DIVIDE => 2.0,
      CLKFX_DIVIDE => 1,
      CLKFX_MULTIPLY => 4,
      CLKIN_DIVIDE_BY_2 => FALSE,
      CLKIN_PERIOD => 20.0,
      CLKOUT_PHASE_SHIFT => "NONE",
      CLK_FEEDBACK => "1X",
      DESKEW_ADJUST => "SYSTEM_SYNCHRONOUS",
      DFS_FREQUENCY_MODE => "LOW",
      DLL_FREQUENCY_MODE => "LOW",
      DSS_MODE => "NONE",
      DUTY_CYCLE_CORRECTION => TRUE,
      FACTORY_JF => X"C080",
      PHASE_SHIFT => 0,
      STARTUP_WAIT => FALSE
    )
    port map (
      CLKIN => clkin,
      CLKFB => clk0_g,
      RST => rst,
      DSSEN => gnd,
      PSCLK => gnd,
      PSEN => gnd,
      PSINCDEC => gnd,
      CLK0 => clk0,
      CLK90 => NLW_dcm_CLK90_UNCONNECTED,
      CLK180 => NLW_dcm_CLK180_UNCONNECTED,
      CLKFX => NLW_dcm_CLKFX_UNCONNECTED,
      LOCKED => lk,
      PSDONE => NLW_dcm_PSDONE_UNCONNECTED,
${pinBits('STATUS', 8, 'NLW_dcm_STATUS_UNCONNECTED(#)')}
    );
  clk0_bufg : X_CKBUF
    port map (I => clk0, O => clk0_g);
  lut0 : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (ADR0 => q0, ADR1 => lk, O => d0);
  lut1 : X_LUT3
    generic map(
      INIT => X"78"
    )
    port map (ADR0 => q0, ADR1 => lk, ADR2 => q1, O => d1);
  ff0 : X_FF
    port map (I => d0, CE => vcc, CLK => clk0_g, SET => gnd, RST => gnd, O => q0);
  ff1 : X_FF
    port map (I => d1, CE => vcc, CLK => clk0_g, SET => gnd, RST => gnd, O => q1);
  q(0) <= q0;
  q(1) <= q1;
  locked <= lk;
  g0 : X_ZERO
    port map (O => gnd);
  v0 : X_ONE
    port map (O => vcc);`, ['gnd : STD_LOGIC', 'vcc : STD_LOGIC', 'clkin : STD_LOGIC', 'clk0 : STD_LOGIC', 'clk0_g : STD_LOGIC', 'lk : STD_LOGIC',
    'q0 : STD_LOGIC', 'q1 : STD_LOGIC', 'd0 : STD_LOGIC', 'd1 : STD_LOGIC', 'NLW_dcm_CLK90_UNCONNECTED : STD_LOGIC', 'NLW_dcm_CLK180_UNCONNECTED : STD_LOGIC',
    'NLW_dcm_CLKFX_UNCONNECTED : STD_LOGIC', 'NLW_dcm_PSDONE_UNCONNECTED : STD_LOGIC', 'NLW_dcm_STATUS_UNCONNECTED : STD_LOGIC_VECTOR ( 7 downto 0 )'], 'SIMPRIM');
  const b = build(t);
  b.set('rst', 0);
  b.sim.addClock(b.port('clk'), { period: 10000 });
  b.sim.run(1000);
  assert.deepEqual(['locked', 'q'].map(b.val), [0, 0]);
  b.sim.run(50000);
  assert.equal(b.val('locked'), 1);
  const out = [];
  for (let i = 0; i < 5; i++) { b.step(); out.push(b.val('q')); }
  assert.deepEqual(out.slice(1).map((v, i) => (v - out[i] + 4) % 4), [1, 1, 1, 1]);   // counts on every CLKIN cycle
  b.set('rst', 1); b.step();
  assert.equal(b.val('locked'), 0);
  const q = b.val('q'); b.step(); b.step();
  assert.equal(b.val('q'), q);              // not locked: the counter holds
});

test('DCM: CLK0/90/180/270, CLK2X, CLKDV and CLKFX frequencies and phases (UNISIM and SIMPRIM, CLKIN_DIVIDE_BY_2)', () => {
  const run = (prim, gens) => {
    const lib = prim.startsWith('X_') ? 'library simprim; use simprim.vcomponents.all;' : 'library unisim; use unisim.vcomponents.all;';
    const src = [{ path: 't.vhd', lang: 'vhdl', text: `library ieee; use ieee.std_logic_1164.all; ${lib}
entity t is end t;
architecture s of t is
  signal clk : std_logic := '0';
  signal c0, c90, c180, c270, c2x, cdv, cfx, lk : std_logic;
begin
  clk <= not clk after 10 ns;
  u : ${prim} generic map (${gens})
    port map (CLKIN => clk, CLKFB => c0, RST => '0', CLK0 => c0, CLK90 => c90, CLK180 => c180, CLK270 => c270, CLK2X => c2x, CLKDV => cdv, CLKFX => cfx, LOCKED => lk);
end s;` }];
    const lb = compile([...primitiveSources(src), ...src]);
    assert.deepEqual(lb.errors.filter((e) => e.severity !== 'warning').map((e) => e.message), []);
    const d = elaborate(lb, 't');
    assert.deepEqual(d.diags.filter((x) => x.severity === 'error').map((x) => x.message), []);
    const sim = new Simulator(d);
    const names = ['c0', 'c90', 'c180', 'c270', 'c2x', 'cdv', 'cfx', 'lk'];
    const sig = Object.fromEntries(names.map((n) => [n, d.signals.find((x) => x.name.endsWith(`.${n}`) || x.name === n)]));
    const rise = Object.fromEntries(names.map((n) => [n, []])), prev = {};
    for (let t = 0; t <= 1000000; t += 250) {      // ps
      sim.run(t);
      for (const n of names) { const v = sig[n].val.x ? 2 : Number(sig[n].val.v & 1n); if (prev[n] === 0 && v === 1) rise[n].push(t / 1000); prev[n] = v; }
    }
    const period = (n) => { const r = rise[n].slice(-4); return Math.round(((r[3] - r[0]) / 3) * 10) / 10; };
    const phase = (n) => { const r = rise[n].at(-1); const c = rise.c0.filter((x) => x <= r).at(-1); return Math.round((r - c) * 10) / 10; };
    return { period, phase, rise };
  };
  let r = run('DCM_SP', 'CLKFX_MULTIPLY => 5, CLKFX_DIVIDE => 2, CLKDV_DIVIDE => 2.5');
  assert.equal(r.rise.lk.length, 1);
  assert.ok(r.rise.lk[0] > 20 && r.rise.lk[0] < 100, 'LOCKED after a few CLKIN cycles');
  assert.deepEqual(['c0', 'c90', 'c180', 'c270', 'c2x', 'cdv', 'cfx'].map(r.period), [20, 20, 20, 20, 10, 50, 8]);
  assert.deepEqual(['c90', 'c180', 'c270'].map(r.phase), [5, 10, 15]);
  r = run('X_DCM_SP', 'CLKFX_MULTIPLY => 2, CLKFX_DIVIDE => 1, CLKDV_DIVIDE => 4.0');
  assert.deepEqual(['c0', 'c2x', 'cdv', 'cfx'].map(r.period), [20, 10, 80, 10]);
  r = run('DCM_SP', 'CLKIN_DIVIDE_BY_2 => TRUE, CLKFX_MULTIPLY => 3, CLKFX_DIVIDE => 1');
  assert.deepEqual(['c0', 'c90', 'cdv'].map(r.period), [40, 40, 80]);
  assert.ok(Math.abs(r.period('cfx') - 13.3) < 0.2);
});

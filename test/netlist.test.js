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

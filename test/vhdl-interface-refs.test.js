// A default of a VHDL interface list that uses an earlier object of the same list (#3744, packages/silinx-hdl/src/vhdl/
// interface-refs.js): VHDL-93 (LRM 4.3.2.1) and XST refuse it, in a generic list (an entity's, a component's), a port
// list and a subprogram's parameter list; Check Syntax reports it at the use, with the object it is the default of and
// the one it uses. A package's constant, a selected name, a generic in a port's default (another list) and the generics
// of another entity stay accepted, with no warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diags, sim } from './lang-util.js';
import { parse } from '../core/vhdl/parser.js';
import { interfaceRefMethods } from '../core/vhdl/interface-refs.js';

const H = 'library ieee; use ieee.std_logic_1164.all;\n';
const all = (src, top) => diags(src, top, { lang: 'vhdl' }).map(d => `${d.severity} ${d.line}:${d.col} ${d.message}`);
const MSG = (what, name, uses, line) => `Initializing expression of ${what} '${name}' is not valid in this context as it ` +
  `contains reference to other interface objects (LRM 4.3.2.1): it uses ${uses} (line ${line}).`;

test('#3744 the parser method of the part', () => {
  assert.equal(typeof interfaceRefMethods.parseInterfaceDefault, 'function');
});

test("#3744 a generic's default that uses an earlier generic of its entity: an error at the use (the issue's case)", () => {
  const src = H + `entity g is
    Generic ( CLK_HZ : integer := 50_000_000;
              TICK   : integer := CLK_HZ );
    Port ( q : out integer );
end g;
architecture rtl of g is begin q <= TICK; end rtl;
`;
  assert.deepEqual(all(src, 'g'), [`error 4:35 ${MSG('generic', 'tick', "generic 'clk_hz'", 3)}`]);
  // in an expression, after other names; the first earlier generic it uses; several names of one declaration
  assert.deepEqual(all(H + `entity g is
  generic ( A, B : integer := 2;
            C : natural := 1 + (B * A) );
end g;
architecture rtl of g is begin end rtl;
`, 'g'), [`error 4:33 ${MSG('generic', 'c', "generic 'b'", 3)}`]);
  // one error per declaration; the parse goes on (an error further down still reported)
  assert.deepEqual(all(H + `entity g is
  generic ( N : integer := 4;
            M, K : integer := N + N );
end g;
architecture rtl of g is
  signal s : std_logic
begin end rtl;
`, 'g'), [`error 4:31 ${MSG('generic', 'm', "generic 'n'", 3)}`, "error 7:23 expected ';' after 'std_logic'"]);
});

test("#3744 a component's generics, a port's default, a function's and a procedure's parameters", () => {
  assert.deepEqual(all(H + `entity top is end top;
architecture rtl of top is
  component sub
    generic ( W : integer := 8; D : integer := 2 ** W );
    port ( a : in integer := 0; b : in integer := a );
  end component;
  function f (x : integer; y : integer := x + 1) return integer is begin return x + y; end f;
  procedure p (signal s : out integer; v : in integer := 0; u : in integer := v) is begin s <= u; end p;
begin
end rtl;
`, 'top'), [
    `error 5:53 ${MSG('generic', 'd', "generic 'w'", 5)}`,
    `error 6:51 ${MSG('port', 'b', "port 'a'", 6)}`,
    `error 8:43 ${MSG('parameter', 'y', "parameter 'x'", 8)}`,
    `error 9:79 ${MSG('parameter', 'u', "parameter 'v'", 9)}`,
  ]);
});

test("#3744 accepted, with no warning: a package's constant, a selected name, a generic in a port's default, another entity's generic, a type's bounds", () => {
  const src = H + `package p is
  constant W : integer := 4;
  constant DEPTH : integer := W * 2;
end package p;
use work.p.all;
entity leaf is
  generic ( W : integer := 3 );
  port ( q : out integer );
end leaf;
architecture rtl of leaf is begin q <= W; end rtl;
library ieee; use ieee.std_logic_1164.all;
use work.p.all;
entity g is
  generic ( N : integer := DEPTH;
            W : integer := work.p.W + 1;
            M : integer := p.DEPTH );
  port ( d : in std_logic_vector(N - 1 downto 0) := (others => '0');
         k : in integer := M + N;
         q : out integer );
end g;
architecture rtl of g is
  function f (x : integer; y : integer := W) return integer is begin return x + y; end f;
  signal l : integer;
begin
  u : entity work.leaf generic map (W => N) port map (q => l);
  q <= f(k) + l;
end rtl;
library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture sim of tb is
  signal q : integer;
begin
  u : entity work.g port map (q => q);
  process begin wait for 1 ns; report "q = " & integer'image(q); wait; end process;
end sim;
`;
  assert.deepEqual(all(src, 'tb'), []);
  // the values: N = 8, W = 5, M = 8, k = 16, f(16) = 21, l = N = 8
  assert.deepEqual(sim(src, 'tb').out.filter(l => /q = /.test(l)).map(l => l.replace(/^.*q = /, 'q = ')), ['q = 29']);
  assert.deepEqual(parse(src, 't.vhd').errors, []);
});

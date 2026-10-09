// VHDL diagnostics: syntax errors, elaboration errors and run-time errors for common mistakes,
// with the line / column they are reported at and their message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diags, sim, vhd } from './lang-util.js';

const H = 'library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;\n';
const errs = (src, top = 'tb') => diags(src, top, { lang: 'vhdl' }).filter(d => d.severity === 'error').map(d => `${d.line}:${d.col} ${d.message}`);
const warns = (src, top = 'tb') => diags(src, top, { lang: 'vhdl' }).filter(d => d.severity === 'warning').map(d => `${d.line}:${d.col} ${d.message}`);

test('a missing semicolon at the end of a line is reported there, without follow-on errors', () => {
  assert.deepEqual(errs(H + 'entity tb is end;\narchitecture a of tb is\n  signal s : std_logic\nbegin\nend;'),
    ["4:23 expected ';' after 'std_logic'"]);
  assert.deepEqual(errs(H + 'entity tb is end;\narchitecture a of tb is\nbegin\n  process begin wait; end process\nend;'),
    ["5:34 expected ';' after 'process'"]);
  assert.deepEqual(errs(H + "entity tb is end;\narchitecture a of tb is\n  signal s : std_logic;\nbegin\n  s <= '1'\n  s <= '0';\nend;"),
    ["6:11 expected ';' after '1'"]);
});

test('syntax errors inside a line point at the offending token', () => {
  assert.deepEqual(errs(H + "entity tb is end;\narchitecture a of tb is\n  signal s : std_logic;\nbegin\n  s <= a +* ;\nend;"),
    ["6:11 expected expression but found '*'"]);
  const e = errs(H + 'entity tb is end;\narchitecture a of tb is\nbegin\n  proces begin wait; end process;\nend;');
  assert.equal(e[0], "5:10 expected '<=' but found 'begin'");
  const u = errs(H + 'entity tb is end;\narchitecture a of tb is\nbegin\n  process begin report "abc; wait; end process;\nend;');
  assert.equal(u[0], '5:24 unterminated string literal');
});

test('undeclared names, unknown types, unknown entities, ports and architectures', () => {
  assert.deepEqual(errs(H + "entity tb is end;\narchitecture a of tb is\nbegin\n  process begin\n    x <= '1';\n    wait;\n  end process;\nend;"),
    ["6:5 'x' is not declared"]);
  assert.deepEqual(errs(H + 'entity tb is end;\narchitecture a of tb is\n  signal a : my_type;\nbegin\nend;'),
    ["4:3 unknown type 'my_type'"]);
  assert.deepEqual(errs(H + 'entity tb is end;\narchitecture a of tb is\nbegin\n  u1 : entity work.nothere port map (a => open);\nend;'),
    ["5:3 module/entity 'nothere' not found (instance 'u1')"]);
  assert.deepEqual(errs(H + 'architecture a of nobody is begin end;'), ["2:1 architecture 'a' of unknown entity 'nobody'"]);
  assert.deepEqual(errs(H + 'entity x is end; architecture a of x is begin end;'), ["1:1 top module 'tb' not found"]);
  const sub = H + 'entity sub is port (a : in std_logic); end;\narchitecture r of sub is begin end;\n';
  const src = sub + H + 'entity tb is end;\narchitecture a of tb is signal s : std_logic; begin\n  u1 : entity work.sub port map (b => s);\nend;';
  assert.deepEqual(errs(src), ["7:3 module 'sub' has no port 'b'"]);
  assert.deepEqual(warns(src), ["7:3 input port 'a' of 'u1' is not connected"]);
});

test('width mismatches of vector assignments are warnings', () => {
  assert.deepEqual(warns(H + 'entity tb is end;\narchitecture a of tb is\n  signal a : std_logic_vector(3 downto 0);\n  signal b : std_logic_vector(7 downto 0);\nbegin\n  a <= b;\nend;'),
    ['7:3 width mismatch: target is 4 bits, value is 8 bits']);
});

test('calls with a wrong parameter, a missing argument, a procedure used as a function', () => {
  const pre = H + 'entity tb is end;\narchitecture a of tb is\n  function f(x : integer) return integer is begin return x; end function;\n  procedure p(x : integer) is begin end procedure;\nbegin\n  process\n    variable v : integer;\n  begin\n';
  assert.deepEqual(errs(pre + '    v := f(y => 1);\n    wait;\n  end process;\nend;'), ["10:5 'f' has no parameter 'y'"]);
  assert.deepEqual(errs(pre + '    v := f;\n    wait;\n  end process;\nend;'), ["10:5 missing argument 'x' in call to 'f'"]);
  assert.deepEqual(errs(pre + '    v := p(1);\n    wait;\n  end process;\nend;'), ["10:5 'p' is a procedure/task, not a function"]);
  assert.deepEqual(errs(pre + '    q(1);\n    wait;\n  end process;\nend;'), ["10:5 task/procedure 'q' is not declared"]);
});

test('run-time errors: a process without a wait, a combinational loop, a function without return', () => {
  let r = sim(vhd(`process begin n <= n + 1; end process;`, 'signal n : integer := 0;'), 'tb', { allowErrors: true });
  assert.match(r.log.find(l => l.kind === 'error').text, /loops forever without waiting/);
  r = sim(vhd(`a <= not a;`, "signal a : std_logic := '0';"), 'tb', { allowErrors: true });
  assert.match(r.log.find(l => l.kind === 'error').text, /^delta cycle limit \(10000\) exceeded at 0 ns: combinational loop\?/);
  r = sim(vhd(`process begin report integer'image(f(1)); wait; end process;`,
    'function f(x : integer) return integer is begin if x > 5 then return 1; end if; end function;'), 'tb', { allowErrors: true });
  assert.match(r.log.find(l => l.kind === 'error').text, /function f ended without return/);
});

test('run-time errors: integer division by zero, an index out of range, a value outside an integer subtype', () => {
  const err = (body, decls = '') => sim(vhd(body, decls), 'tb', { allowErrors: true }).log.find(l => l.kind === 'error').text;
  assert.match(err(`process variable z : integer := 0; begin report integer'image(10 / z); wait; end process;`), /^division by zero/);
  assert.match(err(`process variable z : integer := 0; begin report integer'image(10 mod z); wait; end process;`), /^division by zero/);
  assert.match(err(`process variable i : integer := 9; variable m : arr; begin m(i) := 1; wait; end process;`, 'type arr is array (0 to 3) of integer;'),
    /^index 9 out of range 0 to 3/);
  assert.match(err(`process variable i : integer := 4; variable m : arr; begin report integer'image(m(i)); wait; end process;`, 'type arr is array (0 to 3) of integer;'),
    /^index 4 out of range 0 to 3/);
  assert.match(err(`process variable i : integer := 8; variable v : std_logic_vector(7 downto 0); begin v(i) := '1'; wait; end process;`),
    /^index 8 out of range 7 downto 0/);
  assert.match(err(`process variable n : natural := 0; begin n := n - 1; wait; end process;`), /^value -1 out of range 0 to 2147483647/);
  assert.match(err(`process begin s <= 11; wait; end process;`, 'signal s : integer range 0 to 10;'), /^value 11 out of range 0 to 10/);
});

test('diagnostics carry the file they come from', () => {
  const d = diags({ 'a.vhd': H + 'entity tb is end;\narchitecture a of tb is begin\n  x <= 1;\nend;' }, 'tb');
  assert.deepEqual(d.map(x => [x.file, x.line]), [['a.vhd', 4]]);
});

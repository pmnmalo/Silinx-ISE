// VHDL conformance: sequential and concurrent statements and their timing — if / case / loops,
// conditional and selected signal assignments, wait forms, assert / report, delay mechanisms,
// delta cycles, signal vs variable semantics and resolved (multiply driven) signals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out, sim, vproc, vhd } from './lang-util.js';

test('if / elsif / else; nested ifs', () => {
  const r = out(vproc(`
    for i in 0 to 5 loop
      if i = 0 then s := s & "z";
      elsif i < 3 then s := s & "s";
      elsif i = 3 then if s(1) = 'z' then s := s & "t"; end if;
      else s := s & "e";
      end if;
    end loop;
    report s;`, `variable s : string(1 to 0);`));
  assert.deepEqual(r, ['zsstee']);
});

test('case: single choices, choice lists, ranges, others; case on vectors and enumerations', () => {
  const r = out(vproc(`
    for i in 0 to 12 loop
      case i is
        when 0 => s := s & "a";
        when 1 | 3 | 5 => s := s & "b";
        when 6 to 8 => s := s & "c";
        when 11 downto 10 => s := s & "d";
        when others => s := s & "-";
      end case;
    end loop;
    report s;
    case v is when "00" => report "00"; when "01" | "10" => report "01|10"; when others => report "11"; end case;
    case e is when red => report "r"; when others => report "not red"; end case;`,
  `variable s : string(1 to 0); variable v : std_logic_vector(1 downto 0) := "10"; variable e : color := green;`,
  `type color is (red, green, blue);`));
  assert.deepEqual(r, ['ab-b-bccc-dd-', '01|10', 'not red']);
});

test('case? (VHDL-2008 matching case) with don\'t-care choices', () => {
  const r = out(vproc(`
    for i in 0 to 3 loop
      v := std_logic_vector(to_unsigned(i, 2));
      case? v is
        when "1-" => report "1-";
        when "01" => report "01";
        when others => report "other";
      end case?;
    end loop;`, `variable v : std_logic_vector(1 downto 0);`));
  assert.deepEqual(r, ['other', '01', '1-', '1-']);
});

test('loops: for (to / downto / over a range attribute), while, plain loop with exit, next, exit when, labelled exit of an outer loop', () => {
  const r = out(vproc(`
    for i in 3 downto 1 loop s := s & integer'image(i); end loop;
    s := s & ",";
    i := 0; while i < 3 loop i := i + 1; s := s & integer'image(i); end loop;
    s := s & ",";
    i := 0;
    loop
      i := i + 1;
      next when i = 2;
      exit when i > 4;
      s := s & integer'image(i);
    end loop;
    s := s & ",";
    outer : for a in 1 to 3 loop
      inner : for b in 1 to 3 loop
        if b > a then next outer; end if;
        if a = 3 then exit outer; end if;
        s := s & integer'image(a) & integer'image(b);
      end loop inner;
    end loop outer;
    report s;
    for k in 5 to 1 loop report "never"; end loop;`,
  `variable s : string(1 to 0); variable i : integer;`));
  // a null range (5 to 1) executes no iteration
  assert.deepEqual(r, ['321,123,134,112122']);
});

test('the for-loop parameter is a constant local to the loop and hides an outer object of the same name', () => {
  const r = out(vproc(`
    for i in 1 to 2 loop s := s + i; end loop;
    report integer'image(i) & " " & integer'image(s);`,
  `variable i : integer := 7; variable s : integer := 0;`));
  assert.deepEqual(r, ['7 3']);
});

test('conditional (when / else) and selected (with / select) assignments of CHARACTER and integer values', () => {
  const r = out(vhd(`
  y <= "00" when sel = 0 else "01" when sel = 1 else "10" when sel = 2 else "11";
  with sel select z <= 'a' when 0, 'b' when 1 | 2, 'c' when others;
  with sel select w <= 10 when 0 to 1, 20 when others;
  process begin
    for i in 0 to 3 loop
      sel <= i; wait for 1 ns;
      report to_string(y) & " " & character'image(z) & " " & integer'image(w);
    end loop;
    wait;
  end process;`,
  `signal sel : integer := 0; signal y : std_logic_vector(1 downto 0); signal z : character; signal w : integer;`));
  assert.deepEqual(r, ["00 'a' 10", "01 'b' 10", "10 'b' 20", "11 'c' 20"]);
});

test('conditional and selected assignments without character type', () => {
  const r = out(vhd(`
  y <= "00" when sel = 0 else "01" when sel = 1 else "10" when sel = 2 else "11";
  with sel select z <= "001" when 0, "010" when 1 | 2, "100" when others;
  with sel select w <= 10 when 0 to 1, 20 when others;
  process begin
    for i in 0 to 3 loop
      sel <= i; wait for 1 ns;
      report to_string(y) & " " & to_string(z) & " " & integer'image(w);
    end loop;
    wait;
  end process;`,
  `signal sel : integer := 0; signal y : std_logic_vector(1 downto 0); signal z : std_logic_vector(2 downto 0); signal w : integer;`));
  assert.deepEqual(r, ['00 001 10', '01 010 10', '10 010 20', '11 100 20']);
});

test('sequential conditional / selected signal and variable assignments (VHDL-2008)', () => {
  const r = out(vhd(`
  process
    variable v : integer;
  begin
    v := 1 when b else 2;
    s <= "11" when b else "00";
    with b select t <= '1' when true, '0' when false;
    wait for 1 ns;
    report integer'image(v) & " " & to_string(s) & " " & std_logic'image(t);
    wait;
  end process;`,
  `signal b : boolean := true; signal s : std_logic_vector(1 downto 0); signal t : std_logic;`));
  assert.deepEqual(r, ["1 11 '1'"]);
});

test('wait forms: wait for, wait on, wait until, wait until with a timeout, wait on ... until, wait (forever)', () => {
  const r = sim(vhd(`
  clk <= not clk after 5 ns when now < 100 ns;
  process begin
    wait for 12 ns; report "a";              -- 12 ns
    wait on clk; report "b";                 -- 15 ns (clk falls)
    wait until clk = '1'; report "c";        -- 25 ns
    wait until go = '1' for 10 ns; report "d";   -- timeout at 35 ns
    wait on clk until clk = '0'; report "e";     -- 40 ns (the event at 35 ns came before the wait)
    wait until rising_edge(clk); report "f";  -- 45 ns
    wait;
  end process;`,
  `signal clk : std_logic := '0'; signal go : std_logic := '0';`));
  assert.deepEqual(r.lines.filter(l => / note /.test(l)).map(l => l.replace(' note ', ' ')),
    ['12000 a', '15000 b', '25000 c', '35000 d', '40000 e', '45000 f']);
});

test('a process with a sensitivity list runs once at time 0, then on each event of the listed signals', () => {
  const r = out(vhd(`
  process(a) begin n <= n + 1; end process;
  process begin
    a <= '1'; wait for 1 ns; a <= '1'; wait for 1 ns; a <= '0'; wait for 1 ns;
    report integer'image(n); wait;
  end process;`, `signal a : std_logic := '0'; signal n : integer := 0;`));
  // runs at 0 (initialisation), on 0->1 and on 1->0; assigning the same value is not an event
  assert.deepEqual(r, ['3']);
});

test('process(all) (VHDL-2008) is sensitive to every signal it reads', () => {
  const r = out(vhd(`
  process(all) begin y <= a and b; end process;
  process begin a <= '1'; b <= '1'; wait for 1 ns; report std_logic'image(y); b <= '0'; wait for 1 ns; report std_logic'image(y); wait; end process;`,
  `signal a, b, y : std_logic := '0';`));
  assert.deepEqual(r, ["'1'", "'0'"]);
});

test('signals update after a delta; variables immediately; the last assignment in a process wins', () => {
  const r = out(vhd(`
  process
    variable v : integer := 0;
  begin
    s <= 1; v := 1;
    report integer'image(s) & " " & integer'image(v);
    s <= 2; s <= 3;
    wait for 0 ns;
    report integer'image(s);
    wait;
  end process;`, `signal s : integer := 0;`));
  assert.deepEqual(r, ['0 1', '3']);
});

test('delta cycles: a chain of concurrent assignments settles within one time step', () => {
  const r = sim(vhd(`
  b <= a; c <= b; d <= c;
  process begin a <= '1'; wait on d; report "d=" & std_logic'image(d) & " at " & integer'image(now / 1 ps); wait; end process;`,
  `signal a, b, c, d : std_logic := '0';`)).out;
  assert.deepEqual(r, ["d='1' at 0"]);
});

test('assert / report: severities note, warning, error, failure; failure stops the simulation; default severities', () => {
  const r = sim(vhd(`
  process begin
    report "n";
    report "w" severity warning;
    assert false report "EXP e" severity error;
    assert 1 = 1 report "never";
    assert false report "EXP default";
    wait for 1 ns;
    report "EXP f" severity failure;
    report "after failure";
    wait;
  end process;
  process begin wait for 2 ns; report "other process"; wait; end process;`), 'tb', { allowErrors: true });
  // report defaults to note, assert to error (§10.3, §10.4); failure ends the simulation
  assert.deepEqual(r.lines.filter(l => !/simulation/.test(l)), ['0 note n', '0 warning w', '0 error EXP e', '0 error EXP default', '1000 failure EXP f']);
  assert.equal(r.r.status.finished, 'failure');
});

test('transport delay keeps every transaction; inertial delay filters pulses shorter than the delay', () => {
  const r = sim(vhd(`
  ti <= a after 3 ns;
  tt <= transport a after 3 ns;
  process begin
    a <= '1'; wait for 2 ns; a <= '0'; wait for 10 ns;      -- 2 ns pulse
    a <= '1'; wait for 5 ns; a <= '0'; wait for 10 ns;      -- 5 ns pulse
    wait;
  end process;`, `signal a, ti, tt : std_logic := '0';`));
  const ev = name => { const s = r.design.signals.find(x => x.name === name); return s.wave.t.map((t, i) => `${t}:${s.wave.v[i].v}`).join(' '); };
  assert.equal(ev('tt'), '0:0 3000:1 5000:0 15000:1 20000:0');
  assert.equal(ev('ti'), '0:0 15000:1 20000:0');
});

test('reject ... inertial: pulses shorter than the reject limit are removed, longer ones pass', () => {
  const r = sim(vhd(`
  y <= reject 1 ns inertial a after 4 ns;
  process begin
    a <= '1'; wait for 500 ps; a <= '0'; wait for 10 ns;    -- 0.5 ns pulse: rejected
    a <= '1'; wait for 2 ns; a <= '0'; wait for 10 ns;      -- 2 ns pulse: passes
    wait;
  end process;`, `signal a, y : std_logic := '0';`));
  const s = r.design.signals.find(x => x.name === 'y');
  assert.deepEqual(s.wave.t, [0, 14500, 16500]);
});

test('waveforms with several elements; after with a time expression; unaffected', () => {
  const r = sim(vhd(`
  s <= '1', '0' after 2 ns, '1' after d * 2, 'Z' after 7 ns;
  process begin wait for 3 ns; report std_logic'image(s); wait for 5 ns; report std_logic'image(s); wait; end process;`,
  `constant d : time := 2 ns; signal s : std_logic := '0';`));
  assert.deepEqual(r.out, ["'0'", "'Z'"]);
  const s = r.design.signals.find(x => x.name === 's');
  assert.deepEqual(s.wave.t, [0, 2000, 4000, 7000]);
});

test('resolved std_logic: two drivers, Z yields to the other driver, 0 vs 1 is X, weak values', () => {
  const r = out(vhd(`
  s <= a; s <= b;
  process begin
    a <= 'Z'; b <= '1'; wait for 1 ns; report std_logic'image(s);
    a <= '0'; wait for 1 ns; report std_logic'image(s);
    b <= 'Z'; wait for 1 ns; report std_logic'image(s);
    a <= 'Z'; wait for 1 ns; report std_logic'image(s);
    wait;
  end process;`, `signal a, b, s : std_logic;`));
  assert.deepEqual(r, ["'1'", "'X'", "'0'", "'Z'"]);
});

test('resolution of weak values: H and L against Z and strong values (IEEE 1164 resolution table)', { todo: "std_logic is 4-valued here: 'H' / 'L' / 'W' / 'U' / '-' are folded into '1' / '0' / 'X'" }, () => {
  const r = out(vhd(`
  s <= a; s <= b;
  process begin
    a <= 'H'; b <= 'Z'; wait for 1 ns; report std_logic'image(s);
    b <= '0'; wait for 1 ns; report std_logic'image(s);
    a <= 'L'; b <= 'H'; wait for 1 ns; report std_logic'image(s);
    wait;
  end process;`, `signal a, b, s : std_logic;`));
  assert.deepEqual(r, ["'H'", "'0'", "'W'"]);
});

test("std_logic signals start at 'U' (std_ulogic'left)", { todo: "std_logic is 4-valued here: 'U' is represented as 'X'" }, () => {
  assert.deepEqual(out(vproc(`report std_logic'image(s);`, '', 'signal s : std_logic;')), ["'U'"]);
});

test('tri-state bus: several processes drive a vector with Z when disabled', () => {
  const r = out(vhd(`
  bus_s <= d0 when en = 0 else (others => 'Z');
  bus_s <= d1 when en = 1 else (others => 'Z');
  process begin
    for i in 0 to 2 loop en <= i; wait for 1 ns; report to_string(bus_s); end loop;
    wait;
  end process;`,
  `signal en : integer := 0; signal d0 : std_logic_vector(3 downto 0) := "0101"; signal d1 : std_logic_vector(3 downto 0) := "0011";
   signal bus_s : std_logic_vector(3 downto 0);`));
  assert.deepEqual(r, ['0101', '0011', 'ZZZZ']);
});

test('concurrent procedure call and concurrent assertion', () => {
  const r = sim(vhd(`
  chk(a);
  assert a /= 3 report "EXP a is 3" severity error;
  process begin for i in 1 to 3 loop a <= i; wait for 1 ns; end loop; wait; end process;`,
  `signal a : integer := 0;
   procedure chk(signal x : in integer) is begin report "a=" & integer'image(x); end procedure;`), 'tb', { allowErrors: true });
  assert.deepEqual(r.out, ['a=0', 'a=1', 'a=2', 'a=3', 'EXP a is 3']);
});

test('clocked process with asynchronous reset; registers update on rising_edge only', () => {
  const r = out(vhd(`
  clk <= not clk after 5 ns when now < 60 ns;
  process(clk, rst) begin
    if rst = '1' then q <= (others => '0');
    elsif rising_edge(clk) then q <= q + 1;
    end if;
  end process;
  process begin
    wait for 22 ns; rst <= '0';
    wait for 30 ns; report integer'image(to_integer(q));
    rst <= '1'; wait for 1 ns; report integer'image(to_integer(q));
    wait;
  end process;`,
  `signal clk : std_logic := '0'; signal rst : std_logic := '1'; signal q : unsigned(3 downto 0);`));
  // rising edges at 25, 35, 45 ns after reset release
  assert.deepEqual(r, ['3', '0']);
});

test('std.env.finish and stop end the simulation', () => {
  const r = sim(vhd(`
  process begin wait for 3 ns; report "x"; std.env.finish; report "never"; wait; end process;
  process begin wait for 10 ns; report "never 2"; wait; end process;`, '', { ctx: 'use std.env.all;' }));
  assert.deepEqual(r.out, ['x']);
  assert.equal(r.r.status.now, 3000);
});

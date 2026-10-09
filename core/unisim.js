// Silinx - UNISIM primitives for simulating the netlists written by Xilinx netgen
// (post-synthesis models: `library UNISIM; use UNISIM.VCOMPONENTS.ALL;`).
//
// These are Silinx's own functional models, written from the documented behaviour of each
// primitive (Xilinx Libraries Guide): LUTs with their INIT truth table, carry-chain and wide-mux
// cells, flip-flops / latches with INIT, I/O and clock buffers, shift-register LUTs and
// distributed RAM. No timing. The Xilinx UNISIM sources are not used (nor redistributed).

/** True if a VHDL source uses the UNISIM library (e.g. a netgen netlist). */
export const usesUnisim = (text) => /\blibrary\s+unisim\b/i.test(String(text || ''));

const lut = (n, name, outs) => {
  const ins = Array.from({ length: n }, (_, i) => `I${i}`);
  const ports = [...ins.map((i) => `${i} : in std_ulogic`), ...outs.map((o) => `${o} : out std_ulogic`)].join('; ');
  const bits = ins.map((x, i) => `      if ${x} = '1' then k := k + ${2 ** i}; elsif ${x} /= '0' then bad := true; end if;`).join('\n');
  return `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity ${name} is
  generic (INIT : bit_vector(${2 ** n - 1} downto 0) := (others => '0'));
  port (${ports});
end ${name};
architecture silinx of ${name} is
begin
  process (${ins.join(', ')})
    variable k : integer;
    variable bad : boolean;
    variable r : std_ulogic;
  begin
    k := 0; bad := false;
${bits}
    if bad then r := 'X';
    elsif INIT(k) = '1' then r := '1';
    else r := '0';
    end if;
${outs.map((o) => `    ${o} <= r;`).join('\n')}
  end process;
end silinx;`;
};

// flip-flops: name, ports (beyond C, D, Q), edge, async clear/preset, sync reset/set, enable
const FFS = [
  ['FD', ''], ['FDC', 'CLR'], ['FDCE', 'CE CLR'], ['FDE', 'CE'], ['FDP', 'PRE'], ['FDPE', 'CE PRE'],
  ['FDR', 'R'], ['FDRE', 'CE R'], ['FDS', 'S'], ['FDSE', 'CE S'], ['FDRS', 'R S'], ['FDRSE', 'CE R S'],
  ['FDCP', 'CLR PRE'], ['FDCPE', 'CE CLR PRE'],
];
const ff = (base, pins, falling) => {
  const name = falling ? `${base}_1` : base;
  const has = (p) => pins.split(' ').includes(p);
  const ports = ['C : in std_ulogic', ...pins.split(' ').filter(Boolean).map((p) => `${p} : in std_ulogic`), 'D : in std_ulogic', 'Q : out std_ulogic'].join('; ');
  const sens = ['C', ...(has('CLR') ? ['CLR'] : []), ...(has('PRE') ? ['PRE'] : [])].join(', ');
  const edge = falling ? "falling_edge(C)" : "rising_edge(C)";
  let body = '';
  if (has('CLR')) body += `    if CLR = '1' then q_i <= '0';\n`;
  if (has('PRE')) body += `    ${has('CLR') ? 'elsif' : 'if'} PRE = '1' then q_i <= '1';\n`;
  body += `    ${has('CLR') || has('PRE') ? 'elsif' : 'if'} ${edge} then\n`;
  const sync = [];
  if (has('R')) sync.push(`if R = '1' then q_i <= '0';`);
  if (has('S')) sync.push(`${sync.length ? 'elsif' : 'if'} S = '1' then q_i <= '1';`);
  const load = has('CE') ? `if CE = '1' then q_i <= D; end if;` : 'q_i <= D;';
  if (sync.length) body += `      ${sync.join('\n      ')}\n      else ${load}\n      end if;\n`;
  else body += `      ${load}\n`;
  body += '    end if;\n';
  return `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity ${name} is
  generic (INIT : bit := '${['FDP', 'FDPE', 'FDS', 'FDSE'].includes(base) ? '1' : '0'}');
  port (${ports});
end ${name};
architecture silinx of ${name} is
  signal q_i : std_ulogic := '0';
  signal started : boolean := false;
begin
  Q <= q_i;
  process (${sens})
  begin
    if not started then
      started <= true;
      if INIT = '1' then q_i <= '1'; else q_i <= '0'; end if;
    end if;
${body}  end process;
end silinx;`;
};

// transparent latches (LD: G = gate, LDC/LDCE/LDP/LDPE)
const LATCHES = [['LD', ''], ['LDC', 'CLR'], ['LDCE', 'CLR GE'], ['LDE', 'GE'], ['LDP', 'PRE'], ['LDPE', 'PRE GE']];
const latch = (name, pins) => {
  const has = (p) => pins.split(' ').includes(p);
  const ports = ['G : in std_ulogic', ...pins.split(' ').filter(Boolean).map((p) => `${p} : in std_ulogic`), 'D : in std_ulogic', 'Q : out std_ulogic'].join('; ');
  const sens = ['G', 'D', ...pins.split(' ').filter(Boolean)].join(', ');
  const en = has('GE') ? "G = '1' and GE = '1'" : "G = '1'";
  let body = '';
  if (has('CLR')) body += `    if CLR = '1' then q_i <= '0';\n    elsif`;
  else if (has('PRE')) body += `    if PRE = '1' then q_i <= '1';\n    elsif`;
  else body += '    if';
  body += ` ${en} then q_i <= D;\n    end if;\n`;
  return `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity ${name} is
  generic (INIT : bit := '0');
  port (${ports});
end ${name};
architecture silinx of ${name} is
  signal q_i : std_ulogic := '0';
begin
  Q <= q_i;
  process (${sens})
  begin
${body}  end process;
end silinx;`;
};

const simple = (name, ports, body) => `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity ${name} is
  port (${ports});
end ${name};
architecture silinx of ${name} is
begin
${body}
end silinx;`;

const buffers = ['IBUF', 'IBUFG', 'OBUF', 'BUF', 'BUFG', 'BUFGP', 'BUFGCE_1', 'IBUFG_LVCMOS33', 'IBUF_LVCMOS33', 'OBUF_LVCMOS33']
  .map((b) => simple(b, 'I : in std_ulogic; O : out std_ulogic', '  O <= I;'));

const muxf = (n) => ['', '_L', '_D'].map((v) => simple(`MUXF${n}${v}`,
  `I0 : in std_ulogic; I1 : in std_ulogic; S : in std_ulogic; ${v === '_L' ? 'LO' : 'O'} : out std_ulogic${v === '_D' ? '; LO : out std_ulogic' : ''}`,
  `  ${v === '_L' ? 'LO' : 'O'} <= I1 when S = '1' else I0 when S = '0' else (I0 and I1);${v === '_D' ? `\n  LO <= I1 when S = '1' else I0 when S = '0' else (I0 and I1);` : ''}`)).join('\n');

const SRL = `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity SRL16E is
  generic (INIT : bit_vector(15 downto 0) := X"0000");
  port (A0, A1, A2, A3, CE, CLK, D : in std_ulogic; Q : out std_ulogic);
end SRL16E;
architecture silinx of SRL16E is
  signal r : std_logic_vector(15 downto 0) := (others => '0');
  signal started : boolean := false;
begin
  process (CLK)
  begin
    if not started then
      started <= true;
      for i in 0 to 15 loop if INIT(i) = '1' then r(i) <= '1'; else r(i) <= '0'; end if; end loop;
    end if;
    if rising_edge(CLK) and CE = '1' then r <= r(14 downto 0) & D; end if;
  end process;
  process (r, A0, A1, A2, A3)
    variable k : integer;
  begin
    k := 0;
    if A0 = '1' then k := k + 1; end if;
    if A1 = '1' then k := k + 2; end if;
    if A2 = '1' then k := k + 4; end if;
    if A3 = '1' then k := k + 8; end if;
    Q <= r(k);
  end process;
end silinx;
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity SRL16 is
  generic (INIT : bit_vector(15 downto 0) := X"0000");
  port (A0, A1, A2, A3, CLK, D : in std_ulogic; Q : out std_ulogic);
end SRL16;
architecture silinx of SRL16 is
begin
  u : entity work.SRL16E generic map (INIT => INIT) port map (A0 => A0, A1 => A1, A2 => A2, A3 => A3, CE => '1', CLK => CLK, D => D, Q => Q);
end silinx;
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity RAM16X1S is
  generic (INIT : bit_vector(15 downto 0) := X"0000");
  port (A0, A1, A2, A3, D, WCLK, WE : in std_ulogic; O : out std_ulogic);
end RAM16X1S;
architecture silinx of RAM16X1S is
  signal m : std_logic_vector(15 downto 0) := (others => '0');
  signal started : boolean := false;
  signal k : integer range 0 to 15 := 0;
begin
  process (A0, A1, A2, A3)
    variable a : integer;
  begin
    a := 0;
    if A0 = '1' then a := a + 1; end if;
    if A1 = '1' then a := a + 2; end if;
    if A2 = '1' then a := a + 4; end if;
    if A3 = '1' then a := a + 8; end if;
    k <= a;
  end process;
  process (WCLK)
  begin
    if not started then
      started <= true;
      for i in 0 to 15 loop if INIT(i) = '1' then m(i) <= '1'; else m(i) <= '0'; end if; end loop;
    end if;
    if rising_edge(WCLK) and WE = '1' then m(k) <= D; end if;
  end process;
  O <= m(k);
end silinx;`;

// ---------------------------------------------------------------------------------------------
// SIMPRIM: primitives of the post-translate / post-map / post-place & route netlists (netgen on
// the .ngd / .ncd). Functional only: the delays of the .sdf are not applied.
// ---------------------------------------------------------------------------------------------
const xs = (name, gens, ports, body) => `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity ${name} is
  generic (LOC : string := "UNPLACED"${gens ? `; ${gens}` : ''});
  port (${ports});
end ${name};
architecture silinx of ${name} is
begin
${body}
end silinx;`;
const PP = 'PATHPULSE : time := 0 ps';
const xff = (name, sync) => `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity ${name} is
  generic (LOC : string := "UNPLACED"; INIT : bit := '0');
  port (I : in std_ulogic; CE : in std_ulogic; CLK : in std_ulogic; SET : in std_ulogic; RST : in std_ulogic;${sync ? ' SSET : in std_ulogic; SRST : in std_ulogic;' : ''} O : out std_ulogic);
end ${name};
architecture silinx of ${name} is
  signal q_i : std_ulogic := '0';
  signal started : boolean := false;
begin
  O <= q_i;
  process (CLK, SET, RST)
  begin
    if not started then
      started <= true;
      if INIT = '1' then q_i <= '1'; else q_i <= '0'; end if;
    end if;
    if RST = '1' then q_i <= '0';
    elsif SET = '1' then q_i <= '1';
    elsif rising_edge(CLK) then
      ${sync ? `if SRST = '1' then q_i <= '0';
      elsif SSET = '1' then q_i <= '1';
      elsif CE = '1' then q_i <= I;
      end if;` : `if CE = '1' then q_i <= I; end if;`}
    end if;
  end process;
end silinx;`;

/** VHDL source of the SIMPRIM primitives (netlists with `library SIMPRIM`). */
export const SIMPRIM_VHDL = [
  `-- Silinx SIMPRIM primitives (functional models; see core/unisim.js)
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
package VPACKAGE is
  signal GSR : std_logic := '0';
  signal GTS : std_logic := '0';
end VPACKAGE;`,
  ...['X_BUF', 'X_CKBUF', 'X_OBUF', 'X_IPAD', 'X_OPAD', 'X_BUFGP'].map((n) => xs(n, PP, 'I : in std_ulogic; O : out std_ulogic', '  O <= I;')),
  xs('X_INV', PP, 'I : in std_ulogic; O : out std_ulogic', '  O <= not I;'),
  xs('X_ZERO', '', 'O : out std_ulogic', "  O <= '0';"),
  xs('X_ONE', '', 'O : out std_ulogic', "  O <= '1';"),
  xs('X_AND2', PP, 'I0 : in std_ulogic; I1 : in std_ulogic; O : out std_ulogic', '  O <= I0 and I1;'),
  xs('X_OR2', PP, 'I0 : in std_ulogic; I1 : in std_ulogic; O : out std_ulogic', '  O <= I0 or I1;'),
  xs('X_XOR2', PP, 'I0 : in std_ulogic; I1 : in std_ulogic; O : out std_ulogic', '  O <= I0 xor I1;'),
  xs('X_MUX2', PP, 'IA : in std_ulogic; IB : in std_ulogic; SEL : in std_ulogic; O : out std_ulogic', "  O <= IB when SEL = '1' else IA when SEL = '0' else (IA and IB);"),
  xs('X_BUFGMUX', '', 'I0 : in std_ulogic; I1 : in std_ulogic; S : in std_ulogic; O : out std_ulogic', "  O <= I1 when S = '1' else I0;"),
  xs('X_TRI', PP, 'I : in std_ulogic; CTL : in std_ulogic; O : out std_ulogic', "  O <= I when CTL = '1' else 'Z';"),
  xs('X_ROC', 'ROC_WIDTH : time := 100 ns', 'O : out std_ulogic', "  O <= '0';"),
  xs('X_TOC', '', 'O : out std_ulogic', "  O <= '0';"),
  ...[1, 2, 3, 4, 5, 6].map((n) => `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity X_LUT${n} is
  generic (LOC : string := "UNPLACED"; INIT : bit_vector(${2 ** n - 1} downto 0) := (others => '0'));
  port (${Array.from({ length: n }, (_, i) => `ADR${i} : in std_ulogic`).join('; ')}; O : out std_ulogic);
end X_LUT${n};
architecture silinx of X_LUT${n} is
begin
  u : entity work.LUT${n} generic map (INIT => INIT) port map (${Array.from({ length: n }, (_, i) => `I${i} => ADR${i}`).join(', ')}, O => O);
end silinx;`),
  xff('X_FF', false), xff('X_SFF', true),
].join('\n');

/** VHDL source of the UNISIM primitives (compiled with a netlist that uses `library UNISIM`). */
export const UNISIM_VHDL = [
  `-- Silinx UNISIM primitives (functional models; see core/unisim.js)
package VPKG is
end VPKG;`,
  simple('GND', 'G : out std_ulogic', "  G <= '0';"),
  simple('VCC', 'P : out std_ulogic', "  P <= '1';"),
  simple('INV', 'I : in std_ulogic; O : out std_ulogic', '  O <= not I;'),
  ...buffers,
  simple('OBUFT', 'I : in std_ulogic; T : in std_ulogic; O : out std_ulogic', "  O <= I when T = '0' else 'Z';"),
  simple('IOBUF', 'I : in std_ulogic; T : in std_ulogic; O : out std_ulogic; IO : inout std_logic', "  IO <= I when T = '0' else 'Z';\n  O <= IO;"),
  simple('MUXCY', 'CI : in std_ulogic; DI : in std_ulogic; S : in std_ulogic; O : out std_ulogic', "  O <= CI when S = '1' else DI;"),
  simple('MUXCY_L', 'CI : in std_ulogic; DI : in std_ulogic; S : in std_ulogic; LO : out std_ulogic', "  LO <= CI when S = '1' else DI;"),
  simple('MUXCY_D', 'CI : in std_ulogic; DI : in std_ulogic; S : in std_ulogic; O : out std_ulogic; LO : out std_ulogic', "  O <= CI when S = '1' else DI;\n  LO <= CI when S = '1' else DI;"),
  simple('XORCY', 'CI : in std_ulogic; LI : in std_ulogic; O : out std_ulogic', '  O <= CI xor LI;'),
  simple('XORCY_L', 'CI : in std_ulogic; LI : in std_ulogic; LO : out std_ulogic', '  LO <= CI xor LI;'),
  simple('XORCY_D', 'CI : in std_ulogic; LI : in std_ulogic; O : out std_ulogic; LO : out std_ulogic', '  O <= CI xor LI;\n  LO <= CI xor LI;'),
  simple('MULT_AND', 'I0 : in std_ulogic; I1 : in std_ulogic; LO : out std_ulogic', '  LO <= I0 and I1;'),
  muxf(5), muxf(6), muxf(7), muxf(8),
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [lut(n, `LUT${n}`, ['O']), lut(n, `LUT${n}_L`, ['LO']), lut(n, `LUT${n}_D`, ['O', 'LO'])]),
  ...FFS.flatMap(([b, p]) => [ff(b, p, false), ff(b, p, true)]),
  ...LATCHES.map(([n, p]) => latch(n, p)),
  SRL,
].join('\n');

const VCOMPONENTS = 'package VCOMPONENTS is\nend VCOMPONENTS;';

/** The source entry to add to a compilation whose sources use UNISIM / SIMPRIM. */
export const UNISIM_SOURCE = { path: '<silinx>/unisim.vhd', lang: 'vhdl', text: `${VCOMPONENTS}\n${UNISIM_VHDL}` };
export const SIMPRIM_SOURCE = { path: '<silinx>/simprim.vhd', lang: 'vhdl', text: SIMPRIM_VHDL };   // needs UNISIM_SOURCE (LUT4)
export const usesSimprim = (text) => /\blibrary\s+simprim\b/i.test(String(text || ''));

/** Library sources to compile with `sources` (netlists written by netgen). */
export function primitiveSources(sources) {
  const texts = (sources || []).map((s) => s.text);
  const sim = texts.some(usesSimprim);
  return sim || texts.some(usesUnisim) ? [UNISIM_SOURCE, ...(sim ? [SIMPRIM_SOURCE] : [])] : [];
}

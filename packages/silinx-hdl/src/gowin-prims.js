// Silinx - the Gowin primitives (#2299, the GW1N of the Tang Nano 9K, #2303): Silinx's own functional models of the cells
// Yosys's synth_gowin maps a design onto and a user's HDL may instantiate, so that both simulate (the post-synthesis
// netlist, Yosys's write_verilog, in place of the design). Written from Yosys's techlibs/gowin/cells_sim.v (its
// behavioural models; its BSRAMs and oscillators are black boxes there) and Gowin's user guides (UG286, clocks; UG285,
// BSRAM), as core/unisim.js's from Xilinx's. No timing. The names, pins and generics are Gowin's (its VHDL library:
// `library gw1n; use gw1n.components.all;`); some are UNISIM's too (LUT4, IBUF, OBUF, IOBUF, BUFG, INV, GND, VCC), so
// a compilation has the one library or the other (unisim.js primitiveSources).
//   - LUT1-4 (INIT, F the bit {I3 I2 I1 I0} of it), MUX2 and MUX2_LUT5-8 (O = S0 ? I1 : I0), INV;
//   - the flip-flops DFF, DFFE, DFFS / DFFSE and DFFR / DFFRE (a synchronous set / reset, before the enable), DFFP /
//     DFFPE and DFFC / DFFCE (an asynchronous preset / clear), each with its falling-edge DFFN… twin; INIT their value
//     at start (1 for the set and preset ones);
//   - the latches DL, DLE, DLC, DLCE, DLP, DLPE and their DLN… twins (open while CLK is low), CE their enable;
//   - ALU (ALU_MODE: 0 ADD, 1 SUB, 2 ADDSUB, I3 = 1 adds, 3 NE, 4 GE, 5 LE, 6 CUP, 7 CDN, 8 CUPCDN, 9 MULT): SUM = S xor
//     CIN, COUT = S ? CIN : C, S and C of the mode, as cells_sim.v's;
//   - the distributed RAMs RAM16S1 / 2 / 4 (one port) and RAM16SDP1 / 2 / 4 (a write port and a read port): read at once
//     at AD / RAD, written on CLK's rising edge when WRE, INIT_0 … the bits' contents;
//   - the I/O buffers IBUF, OBUF, TBUF and IOBUF (OEN = 1 releases the pad), the LVDS ones' ELVDS_OBUF / TLVDS_OBUF (OB
//     the complement), BUFG, VCC, GND, GSR (no effect);
//   - rPLL and PLLVR: CLKOUT at CLKIN × (FBDIV_SEL + 1) / (IDIV_SEL + 1), CLKOUTP the same shifted by PSDA_SEL × 22.5°,
//     high DUTYDA_SEL sixteenths of its period (PSDA and DUTYDA with DYN_DA_EN), CLKOUTD the one of CLKOUTD_SRC divided by
//     DYN_SDIV_SEL, CLKOUTD3 by 3, the bypasses CLKIN itself; as unisim-s6.js's PLL_BASE, each re-aligned to CLKIN's
//     rising edges and LOCK after 3 of them (RESET and RESET_P restart it, the outputs low until then). The VCO (ODIV_SEL)
//     sets no output's frequency; the dynamic dividers (DYN_*DIV_SEL "true", FBDSEL / IDSEL / ODSEL), CLKFB and the fine
//     delays are not modelled (a dynamic divider is a warning). packages/silinx-fpga/src/gowin-clocks.js pllFrequencies
//     computes the same frequencies from the parameters;
//   - the oscillators OSC (250 MHz, the GW1N(R)-4s' 210 MHz, DEVICE: gowin-clocks.js oscFrequency), OSCZ (250 MHz, OSCEN)
//     and OSCH (240 MHz): OSCOUT at that frequency / FREQ_DIV;
//   - the block RAMs (BSRAM: SP, SPX9, SDPB, SDPX9B, DPB, DPX9B, pROM, pROMX9): gowin-bsram.js; the multipliers (MULT9X9,
//     MULT18X18, MULT36X36): gowin-dsp.js.
//
// Isomorphic ES module (browser + Node), no DOM.

import { GOWIN_BSRAM_VHDL } from './gowin-bsram.js';
import { GOWIN_DSP_VHDL } from './gowin-dsp.js';

const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';

const entity = (name, ports, body, { gens = '', decls = '' } = {}) => `
${IEEE}
entity ${name} is
${gens ? `  generic (${gens});\n` : ''}  port (${ports});
end ${name};
architecture silinx of ${name} is
${decls}begin
${body}
end silinx;`;

// 2:1 multiplexer, an unknown select known only when both inputs agree (core/unisim.js's)
const mux2 = (out, a, b, s) => `  ${out} <= ${b} when ${s} = '1' else ${a} when ${s} = '0' else ${a} when (${a} = '0' and ${b} = '0') or (${a} = '1' and ${b} = '1') else 'X';`;
// buffers pass 0 / 1 (and the weak H / L as 1 / 0); anything else (Z, X) gives X (core/unisim.js's)
const BUF_X01 = (o, i) => `  ${o} <= '1' when ${i} = '1' or ${i} = 'H' else '0' when ${i} = '0' or ${i} = 'L' else 'X';`;
// a vector's bits hi … 0 as the integer `adr`, `bad` when one of them is not 0 / 1
const addrOf = (v, hi, ind = '    ') => `${ind}adr := 0; bad := false;\n${ind}for i in ${hi} downto 0 loop\n${ind}  adr := adr * 2;\n`
  + `${ind}  if ${v}(i) = '1' then adr := adr + 1; elsif ${v}(i) /= '0' then bad := true; end if;\n${ind}end loop;`;

const lut = (n) => {
  const ins = Array.from({ length: n }, (_, i) => `I${i}`);
  const bits = ins.map((x, i) => `    if ${x} = '1' then k := k + ${2 ** i}; elsif ${x} /= '0' then bad := true; end if;`).join('\n');
  return entity(`LUT${n}`, `F : out std_ulogic; ${ins.join(', ')} : in std_ulogic`, `  process (${ins.join(', ')})
    variable k : integer;
    variable bad : boolean;
  begin
    k := 0; bad := false;
${bits}
    if bad then F <= 'X'; elsif INIT(k) = '1' then F <= '1'; else F <= '0'; end if;
  end process;`, { gens: `INIT : bit_vector(${2 ** n - 1} downto 0) := (others => '0')` });
};

// flip-flops: [name, its pins beyond D, CLK and Q]; N… on the falling edge
const FFS = [['DFF', ''], ['DFFE', 'CE'], ['DFFS', 'SET'], ['DFFSE', 'CE SET'], ['DFFR', 'RESET'], ['DFFRE', 'CE RESET'],
  ['DFFP', 'PRESET'], ['DFFPE', 'CE PRESET'], ['DFFC', 'CLEAR'], ['DFFCE', 'CE CLEAR']];
const ff = ([base, pins], falling) => {
  const name = falling ? base.replace(/^DFF/, 'DFFN') : base;
  const has = (p) => pins.split(' ').includes(p);
  const asyn = has('PRESET') ? 'PRESET' : has('CLEAR') ? 'CLEAR' : null;
  const load = has('CE') ? "if CE = '1' then q_i <= D; end if;" : 'q_i <= D;';
  const sync = has('SET') ? `if SET = '1' then q_i <= '1'; else ${load} end if;` : has('RESET') ? `if RESET = '1' then q_i <= '0'; else ${load} end if;` : load;
  const edge = falling ? 'falling_edge(CLK)' : 'rising_edge(CLK)';
  return entity(name, `Q : out std_ulogic; D, CLK${pins ? `, ${pins.split(' ').join(', ')}` : ''} : in std_ulogic`, `  Q <= q_i;
  process (CLK${asyn ? `, ${asyn}` : ''})
  begin
    if not started then
      started <= true;
      if INIT = '1' then q_i <= '1'; else q_i <= '0'; end if;
    end if;
    ${asyn ? `if ${asyn} = '1' then q_i <= '${asyn === 'PRESET' ? 1 : 0}';\n    els` : ''}if ${edge} then
      ${sync}
    end if;
  end process;`, { gens: `INIT : bit := '${has('SET') || has('PRESET') ? 1 : 0}'`, decls: "  signal q_i : std_ulogic := '0';\n  signal started : boolean := false;\n" });
};

// latches: [name, its pins beyond D, CLK (the gate) and Q]; N… open while CLK is low
const LATCHES = [['DL', ''], ['DLE', 'CE'], ['DLC', 'CLEAR'], ['DLCE', 'CE CLEAR'], ['DLP', 'PRESET'], ['DLPE', 'CE PRESET']];
const latch = ([base, pins], inverted) => {
  const name = inverted ? base.replace(/^DL/, 'DLN') : base;
  const has = (p) => pins.split(' ').includes(p);
  const open = `CLK = '${inverted ? 0 : 1}'${has('CE') ? " and CE = '1'" : ''}`;
  const pre = has('CLEAR') ? "if CLEAR = '1' then q_i <= '0';\n    els" : has('PRESET') ? "if PRESET = '1' then q_i <= '1';\n    els" : '';
  const all = ['D', 'CLK', ...pins.split(' ').filter(Boolean)];
  return entity(name, `Q : out std_ulogic; ${all.join(', ')} : in std_ulogic`, `  Q <= q_i;
  process (${all.join(', ')})
    variable started : boolean := false;
  begin
    if not started then
      started := true;
      if INIT = '1' then q_i <= '1'; else q_i <= '0'; end if;
    end if;
    ${pre}if ${open} then q_i <= D;
    end if;
  end process;`, { gens: "INIT : bit := '0'", decls: "  signal q_i : std_ulogic := '0';\n" });
};

// ALU: S and C of each mode (cells_sim.v's), SUM = S xor CIN, COUT = S ? CIN : C
const ALU = entity('ALU', 'SUM, COUT : out std_ulogic; I0, I1, I3, CIN : in std_ulogic', `  process (I0, I1, I3)
  begin
    case ALU_MODE is
      when 0 => s <= I0 xor I1; c <= I0;
      when 1 => s <= I0 xor not I1; c <= I0;
      when 2 => if I3 = '1' then s <= I0 xor I1; elsif I3 = '0' then s <= I0 xor not I1; else s <= 'X'; end if; c <= I0;
      when 3 => s <= I0 xor not I1; c <= '1';
      when 4 => s <= I0 xor not I1; c <= I0;
      when 5 => s <= not I0 xor I1; c <= I1;
      when 6 => s <= I0; c <= '0';
      when 7 => s <= not I0; c <= '1';
      when 8 => if I3 = '1' then s <= I0; elsif I3 = '0' then s <= not I0; else s <= 'X'; end if; c <= I0;
      when 9 => s <= (I0 and I1) xor I3; c <= I0 and I1;
      when others => s <= 'X'; c <= 'X';
    end case;
  end process;
  SUM <= s xor CIN;
${mux2('COUT', 'c', 'CIN', 's')}`, { gens: 'ALU_MODE : integer := 0', decls: '  signal s, c : std_ulogic;\n' });

// distributed RAM of 16 words: w bits (INIT_0 … the contents of bit 0 …), one port (AD) or a write and a read port (WAD, RAD)
const ram16 = (w, dual) => {
  const vec = () => (w === 1 ? 'std_ulogic' : `std_logic_vector(${w - 1} downto 0)`);
  const bit = (v, i) => (w === 1 ? v : `${v}(${i})`);
  const wa = dual ? 'WAD' : 'AD', ra = dual ? 'RAD' : 'AD';
  return entity(`RAM16S${dual ? 'DP' : ''}${w}`, `DO : out ${vec()}; DI : in ${vec()}; ${dual ? 'WAD, RAD' : 'AD'} : in std_logic_vector(3 downto 0); WRE, CLK : in std_ulogic`,
    `  process (CLK, ${dual ? 'RAD' : 'AD'})
    variable mem : bit_vector(${16 * w - 1} downto 0) := ${Array.from({ length: w }, (_, i) => `INIT_${w - 1 - i}`).join(' & ')};
    variable adr : integer;
    variable bad : boolean;
  begin
    if rising_edge(CLK) and WRE = '1' then
${addrOf(wa, 3, '      ')}
      if not bad then
${Array.from({ length: w }, (_, i) => `        mem(${16 * i} + adr) := to_bit(${bit('DI', i)});`).join('\n')}
      end if;
    end if;
${addrOf(ra, 3)}
${Array.from({ length: w }, (_, i) => `    if bad then ${bit('DO', i)} <= 'X'; elsif mem(${16 * i} + adr) = '1' then ${bit('DO', i)} <= '1'; else ${bit('DO', i)} <= '0'; end if;`).join('\n')}
  end process;`, { gens: Array.from({ length: w }, (_, i) => `INIT_${i} : bit_vector(15 downto 0) := X"0000"`).join('; ') });
};

const BUFS = [
  ...['IBUF', 'OBUF', 'BUFG'].map((n) => entity(n, 'O : out std_ulogic; I : in std_ulogic', BUF_X01('O', 'I'))),
  entity('TBUF', 'O : out std_logic; I, OEN : in std_ulogic', "  O <= I when OEN = '0' else 'Z' when OEN = '1' else 'X';"),
  entity('IOBUF', 'O : out std_ulogic; IO : inout std_logic; I, OEN : in std_ulogic', `  IO <= I when OEN = '0' else 'Z' when OEN = '1' else 'X';\n${BUF_X01('O', 'IO')}`),
  ...['ELVDS_OBUF', 'TLVDS_OBUF'].map((n) => entity(n, 'O, OB : out std_ulogic; I : in std_ulogic', `${BUF_X01('O', 'I')}\n  OB <= not I;`)),
  entity('INV', 'O : out std_ulogic; I : in std_ulogic', '  O <= not I;'),
  entity('VCC', 'V : out std_ulogic', "  V <= '1';"),
  entity('GND', 'G : out std_ulogic', "  G <= '0';"),
  entity('GSR', "GSRI : in std_ulogic := '1'", '  -- (the global set / reset: the flip-flops start at their INIT)'),
];
const MUXES = ['MUX2', 'MUX2_LUT5', 'MUX2_LUT6', 'MUX2_LUT7', 'MUX2_LUT8'].map((n) => entity(n, 'O : out std_ulogic; I0, I1, S0 : in std_ulogic', mux2('O', 'I0', 'I1', 'S0')));

// ---------------------------------------------------------------- rPLL, PLLVR and the oscillators
// a string generic read: "true" in any case; a binary number ("0101")
const STR_FUNCS = `  function yes(s : string) return boolean is
  begin
    return s = "true" or s = "TRUE" or s = "True";
  end function;
  function bin(s : string) return integer is
    variable r : integer := 0;
  begin
    for i in 1 to s'length loop
      if s(i) = '1' then r := r * 2 + 1; elsif s(i) = '0' then r := r * 2; end if;
    end loop;
    return r;
  end function;
`;
const PLL_LOCK_CYCLES = 3;
// an output of m periods every d of CLKIN's (its period p), from the first of them on: shifted by ph thousandths of a
// degree of its own period, high du thousandths of it (ph and du variables of the process, read at each burst)
const pllOut = (sig, m, d, du, ph) => `
  process (CLKIN, rst)
    variable k : integer := 0;
    variable t, sh : time;
    variable vdu, vph : integer;
  begin
    if rst then k := 0; ${sig} <= transport '0';
    elsif rising_edge(CLKIN) and lk then
      if k = 0 then
        vdu := ${du}; vph := ${ph};
        t := (p * (${d})) / (${m});
        sh := (t * vph) / 360000;
        for i in 0 to (${m}) - 1 loop
          ${sig} <= transport '1' after sh + t * i;
          ${sig} <= transport '0' after sh + t * i + (t * vdu) / 1000;
        end loop;
      end if;
      k := k + 1;
      if k >= ${d} then k := 0; end if;
    end if;
  end process;`;
const PLL_GENS = ['FCLKIN : string := "100.0"', 'DYN_IDIV_SEL : string := "false"', 'IDIV_SEL : integer := 0', 'DYN_FBDIV_SEL : string := "false"',
  'FBDIV_SEL : integer := 0', 'DYN_ODIV_SEL : string := "false"', 'ODIV_SEL : integer := 8', 'PSDA_SEL : string := "0000"', 'DYN_DA_EN : string := "false"',
  'DUTYDA_SEL : string := "1000"', "CLKOUT_FT_DIR : bit := '1'", "CLKOUTP_FT_DIR : bit := '1'", 'CLKOUT_DLY_STEP : integer := 0', 'CLKOUTP_DLY_STEP : integer := 0',
  'CLKFB_SEL : string := "internal"', 'CLKOUT_BYPASS : string := "false"', 'CLKOUTP_BYPASS : string := "false"', 'CLKOUTD_BYPASS : string := "false"',
  'DYN_SDIV_SEL : integer := 2', 'CLKOUTD_SRC : string := "CLKOUT"', 'CLKOUTD3_SRC : string := "CLKOUT"', 'DEVICE : string := "GW1N-1"'];
const pll = (name, vren) => entity(name, `CLKOUT, LOCK, CLKOUTP, CLKOUTD, CLKOUTD3 : out std_ulogic;
        CLKIN : in std_ulogic; CLKFB, RESET, RESET_P : in std_ulogic := '0';${vren ? " VREN : in std_ulogic := '1';" : ''}
        FBDSEL, IDSEL, ODSEL : in std_logic_vector(5 downto 0) := (others => '0');
        PSDA, FDLY, DUTYDA : in std_logic_vector(3 downto 0) := (others => '0')`, `  rst <= RESET = '1' or RESET_P = '1';
  process
  begin
    if yes(DYN_IDIV_SEL) or yes(DYN_FBDIV_SEL) or yes(DYN_ODIV_SEL) then
      report "${name}: its dynamic dividers (DYN_IDIV_SEL, DYN_FBDIV_SEL, DYN_ODIV_SEL) are not modelled: IDIV_SEL, FBDIV_SEL and ODIV_SEL are" severity warning;
    end if;
    wait;
  end process;
  process (CLKIN, rst)
    variable last : time := 0 ns;
    variable n : integer := 0;
  begin
    if rst then n := 0; lk <= false;
    elsif rising_edge(CLKIN) then
      if n > 0 then p <= now - last; end if;
      last := now;
      if n < ${PLL_LOCK_CYCLES} then n := n + 1; end if;
      lk <= n >= ${PLL_LOCK_CYCLES};
    end if;
  end process;
${pllOut('co', 'FDIV', 'IDIV', '500', '0')}
${pllOut('cp', 'FDIV', 'IDIV', 'duty', 'phase')}
${pllOut('cd', 'FDIV', 'IDIV * SDIV', '500', 'dph / SDIV')}
${pllOut('cd3', 'FDIV', 'IDIV * 3', '500', 'd3ph / 3')}
  -- (the phase and duty of CLKOUTP: the parameters', or the pins' with DYN_DA_EN; CLKOUTD's and CLKOUTD3's phase: their source's)
  process (PSDA, DUTYDA)
    variable adr : integer;
    variable bad : boolean;
  begin
    if yes(DYN_DA_EN) then
${addrOf('PSDA', 3, '      ')}
      phase <= adr * 22500;
${addrOf('DUTYDA', 3, '      ')}
      duty <= (adr * 1000) / 16;
    else
      phase <= (bin(PSDA_SEL) mod 16) * 22500; duty <= (bin(DUTYDA_SEL) * 1000) / 16;
    end if;
  end process;
  dph <= phase when CLKOUTD_SRC = "CLKOUTP" else 0;
  d3ph <= phase when CLKOUTD3_SRC = "CLKOUTP" else 0;
  CLKOUT <= CLKIN when yes(CLKOUT_BYPASS) else co;
  CLKOUTP <= CLKIN when yes(CLKOUTP_BYPASS) else cp;
  CLKOUTD <= CLKIN when yes(CLKOUTD_BYPASS) else cd;
  CLKOUTD3 <= cd3;
  LOCK <= '1' when lk else '0';`, {
  gens: PLL_GENS.join(';\n           '),
  decls: `${STR_FUNCS}  constant IDIV : integer := IDIV_SEL + 1;
  constant FDIV : integer := FBDIV_SEL + 1;
  constant SDIV : integer := DYN_SDIV_SEL;
  signal p : time := 0 ns;               -- CLKIN's period
  signal lk, rst : boolean := false;
  signal phase, dph, d3ph : integer := 0;  -- thousandths of a degree
  signal duty : integer := 500;            -- thousandths of the period
  signal co, cp, cd, cd3 : std_ulogic := '0';
`,
});

// an oscillator: OSCOUT at mhz / FREQ_DIV, low for its first half period (`en`: OSCEN, low stops it)
const osc = (name, mhz, en, dev = '') => entity(name, `OSCOUT : out std_ulogic${en ? "; OSCEN : in std_ulogic := '1'" : ''}`, `  process
  begin
    o <= '0';
    wait for half;
    o <= '1';
    wait for half;
  end process;
  OSCOUT <= ${en ? "o when OSCEN = '1' else '0'" : 'o'};`, {
  gens: `FREQ_DIV : integer := ${name === 'OSCH' ? 96 : 100}${dev ? `; DEVICE : string := "${dev}"` : ''}`,
  decls: `${dev ? `  function base(d : string) return integer is
  begin
    -- (the GW1N(R)-4s' oscillator: 210 MHz; a DEVICE with "-4", as packages/silinx-fpga/src/gowin-clocks.js reads it)
    for i in 1 to d'length - 1 loop
      if d(i) = '-' and d(i + 1) = '4' then return 210; end if;
    end loop;
    return ${mhz};
  end function;
` : ''}  constant half : time := (1000000 ps * FREQ_DIV) / (2 * ${dev ? 'base(DEVICE)' : mhz});
  signal o : std_ulogic := '0';
`,
});

/** VHDL source of the Gowin primitives (compiled with a design that instantiates them, in place of UNISIM's). */
export const GOWIN_VHDL = [
  `-- Silinx Gowin primitives (functional models; see packages/silinx-hdl/src/gowin-prims.js)
package COMPONENTS is
end COMPONENTS;`,
  ...[1, 2, 3, 4].map(lut), ...MUXES,
  ...FFS.flatMap((f) => [ff(f, false), ff(f, true)]),
  ...LATCHES.flatMap((l) => [latch(l, false), latch(l, true)]),
  ALU, ...[1, 2, 4].flatMap((w) => [ram16(w, false), ram16(w, true)]),
  ...BUFS, pll('rPLL', false), pll('PLLVR', true),
  osc('OSC', 250, false, 'GW1N-4'), osc('OSCZ', 250, true), osc('OSCH', 240, false),
  GOWIN_BSRAM_VHDL, GOWIN_DSP_VHDL,
].join('\n');

/** The source entry to add to a compilation whose sources use the Gowin primitives. */
export const GOWIN_SOURCE = { path: '<silinx>/gowin.vhd', lang: 'vhdl', text: GOWIN_VHDL };

/** The Gowin primitives Silinx simulates, their names as Gowin writes them (rPLL, pROM). */
export const GOWIN_CELLS = new Set([...GOWIN_VHDL.matchAll(/^entity\s+(\w+)\s+is\b/gim)].map((m) => m[1]));

/** True if a VHDL source uses Gowin's primitives' library (`library gw1n;`, gw1ns, gw2a…). */
export const usesGowin = (text) => /\blibrary\s+gw\d\w*\s*;/i.test(String(text || ''));

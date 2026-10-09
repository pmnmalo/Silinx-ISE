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

// transparent latches (LD: G = gate, LDC/LDCE/LDP/LDPE; _1: gate active low). INIT is the value
// after configuration ('1' by default for LDP/LDPE).
const LATCHES = [['LD', ''], ['LDC', 'CLR'], ['LDCE', 'CLR GE'], ['LDE', 'GE'], ['LDP', 'PRE'], ['LDPE', 'PRE GE']];
const latch = (base, pins, inverted) => {
  const name = inverted ? `${base}_1` : base;
  const has = (p) => pins.split(' ').includes(p);
  const ports = ['G : in std_ulogic', ...pins.split(' ').filter(Boolean).map((p) => `${p} : in std_ulogic`), 'D : in std_ulogic', 'Q : out std_ulogic'].join('; ');
  const sens = ['G', 'D', ...pins.split(' ').filter(Boolean)].join(', ');
  const en = `G = '${inverted ? 0 : 1}'${has('GE') ? " and GE = '1'" : ''}`;
  let body = '';
  if (has('CLR')) body += `    if CLR = '1' then q_i <= '0';\n    elsif`;
  else if (has('PRE')) body += `    if PRE = '1' then q_i <= '1';\n    elsif`;
  else body += '    if';
  body += ` ${en} then q_i <= D;\n    end if;\n`;
  return `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity ${name} is
  generic (INIT : bit := '${base.startsWith('LDP') ? 1 : 0}');
  port (${ports});
end ${name};
architecture silinx of ${name} is
  signal q_i : std_ulogic := '0';
begin
  Q <= q_i;
  process (${sens})
    variable started : boolean := false;
  begin
    if not started then
      started := true;
      if INIT = '1' then q_i <= '1'; else q_i <= '0'; end if;
    end if;
${body}  end process;
end silinx;`;
};

const simple = (name, ports, body, gens = '') => `
library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;
entity ${name} is
${gens ? `  generic (${gens});\n` : ''}  port (${ports});
end ${name};
architecture silinx of ${name} is
begin
${body}
end silinx;`;

// attributes of the I/O buffers that netgen may write in their generic maps (no effect here)
const IO_GENS = 'IOSTANDARD : string := "DEFAULT"; CAPACITANCE : string := "DONT_CARE"; DRIVE : integer := 12; SLEW : string := "SLOW"; '
  + 'IBUF_DELAY_VALUE : string := "0"; IFD_DELAY_VALUE : string := "AUTO"; IBUF_LOW_PWR : boolean := TRUE';
const buffers = [
  ...['IBUF', 'IBUFG', 'OBUF', 'IBUFG_LVCMOS33', 'IBUF_LVCMOS33', 'OBUF_LVCMOS33'].map((b) => simple(b, 'I : in std_ulogic; O : out std_ulogic', '  O <= I;', IO_GENS)),
  ...['BUF', 'BUFG', 'BUFGP'].map((b) => simple(b, 'I : in std_ulogic; O : out std_ulogic', '  O <= I;')),
  simple('OBUFT', 'I : in std_ulogic; T : in std_ulogic; O : out std_ulogic', "  O <= I when T = '0' else 'Z' when T = '1' else 'X';", IO_GENS),
  simple('IOBUF', 'I : in std_ulogic; T : in std_ulogic; O : out std_ulogic; IO : inout std_logic', "  IO <= I when T = '0' else 'Z' when T = '1' else 'X';\n  O <= IO;", IO_GENS),
  simple('PULLUP', 'O : out std_logic', "  O <= 'H';"),
  simple('PULLDOWN', 'O : out std_logic', "  O <= 'L';"),
  // global clock buffers: clock enable (the output stays low; high for BUFGCE_1) and clock mux
  simple('BUFGCE', 'I : in std_ulogic; CE : in std_ulogic; O : out std_ulogic', "  O <= I when CE = '1' else '0' when CE = '0' else 'X';"),
  simple('BUFGCE_1', 'I : in std_ulogic; CE : in std_ulogic; O : out std_ulogic', "  O <= I when CE = '1' else '1' when CE = '0' else 'X';"),
  ...['BUFGMUX', 'BUFGMUX_1'].map((b) => simple(b, 'I0 : in std_ulogic; I1 : in std_ulogic; S : in std_ulogic; O : out std_ulogic',
    "  O <= I1 when S = '1' else I0 when S = '0' else I0 when (I0 = '0' and I1 = '0') or (I0 = '1' and I1 = '1') else 'X';")),
];

// 2:1 multiplexer `out` <= b when s = '1' else a; with an unknown select the output is known only
// when both inputs agree (the native models in core/native.js do the same)
const mux2 = (out, a, b, s) => `  ${out} <= ${b} when ${s} = '1' else ${a} when ${s} = '0' else ${a} when (${a} = '0' and ${b} = '0') or (${a} = '1' and ${b} = '1') else 'X';`;

const muxf = (n) => ['', '_L', '_D'].map((v) => simple(`MUXF${n}${v}`,
  `I0 : in std_ulogic; I1 : in std_ulogic; S : in std_ulogic; ${v === '_L' ? 'LO' : 'O'} : out std_ulogic${v === '_D' ? '; LO : out std_ulogic' : ''}`,
  [mux2(v === '_L' ? 'LO' : 'O', 'I0', 'I1', 'S'), ...(v === '_D' ? [mux2('LO', 'I0', 'I1', 'S')] : [])].join('\n'))).join('\n');

const muxcy = (v) => simple(`MUXCY${v}`, `CI : in std_ulogic; DI : in std_ulogic; S : in std_ulogic; ${v === '_L' ? 'LO' : 'O'} : out std_ulogic${v === '_D' ? '; LO : out std_ulogic' : ''}`,
  [mux2(v === '_L' ? 'LO' : 'O', 'DI', 'CI', 'S'), ...(v === '_D' ? [mux2('LO', 'DI', 'CI', 'S')] : [])].join('\n'));

// address from single-bit pins (bit 0 first) into variable `a`; `bad` when one of them is not 0/1
const addrOf = (pins, ind = '    ') => `${ind}a := 0; bad := false;\n${pins.map((x, i) => `${ind}if ${x} = '1' then a := a + ${2 ** i}; elsif ${x} /= '0' then bad := true; end if;`).join('\n')}`;

// shift-register LUTs: SRL16 (E: clock enable, C: cascade output Q15, _1: falling edge); SIMPRIM
// X_SRL16E / X_SRLC16E
const srl = (name, { ce = false, q15 = false, falling = false, simprim = false } = {}) => `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity ${name} is
  generic (${simprim ? 'LOC : string := "UNPLACED"; ' : ''}INIT : bit_vector(15 downto 0) := X"0000");
  port (A0, A1, A2, A3${ce ? ', CE' : ''}, CLK, D : in std_ulogic; Q${q15 ? ', Q15' : ''} : out std_ulogic);
end ${name};
architecture silinx of ${name} is
  signal r : std_logic_vector(15 downto 0) := (others => '0');
begin
  process (CLK)
    variable started : boolean := false;
  begin
    if not started then
      started := true;
      for i in 0 to 15 loop if INIT(i) = '1' then r(i) <= '1'; else r(i) <= '0'; end if; end loop;
    end if;
    if ${falling ? 'falling_edge' : 'rising_edge'}(CLK)${ce ? " and CE = '1'" : ''} then r <= r(14 downto 0) & D; end if;
  end process;
  process (r, A0, A1, A2, A3)
    variable a : integer;
    variable bad : boolean;
  begin
${addrOf(['A0', 'A1', 'A2', 'A3'])}
    if bad then Q <= 'X'; else Q <= r(a); end if;
  end process;${q15 ? '\n  Q15 <= r(15);' : ''}
end silinx;`;
const SRLS = [
  ...['', '_1'].flatMap((f) => [
    srl(`SRL16${f}`, { falling: !!f }), srl(`SRL16E${f}`, { ce: true, falling: !!f }),
    srl(`SRLC16${f}`, { q15: true, falling: !!f }), srl(`SRLC16E${f}`, { ce: true, q15: true, falling: !!f }),
  ]),
].join('\n');

// distributed RAM, 1 bit wide, 2^n words: single port (RAMnX1S: A, D, WCLK, WE, O) or dual port
// (RAMnX1D: + DPRA, SPO / DPO); SIMPRIM X_RAMSn (ADR, I, CLK, WE, O) / X_RAMDn (WADR, RADR)
const dram = (name, n, { dual = false, simprim = false, falling = false } = {}) => {
  const A = (p) => Array.from({ length: n }, (_, i) => `${p}${i}`);
  let wa, reads, din, clk;
  if (simprim) { din = 'I'; clk = 'CLK'; wa = A(dual ? 'WADR' : 'ADR'); reads = [['O', dual ? A('RADR') : wa]]; }
  else { din = 'D'; clk = 'WCLK'; wa = A('A'); reads = dual ? [['SPO', wa], ['DPO', A('DPRA')]] : [['O', wa]]; }
  const ins = [...new Set([...wa, ...reads.flatMap((r) => r[1])]), din, clk, 'WE'];
  const depth = 2 ** n;
  return `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity ${name} is
  generic (${simprim ? 'LOC : string := "UNPLACED"; ' : ''}INIT : bit_vector(${depth - 1} downto 0) := (others => '0'));
  port (${ins.join(', ')} : in std_ulogic; ${reads.map((r) => r[0]).join(', ')} : out std_ulogic);
end ${name};
architecture silinx of ${name} is
  signal m : std_logic_vector(${depth - 1} downto 0) := (others => '0');
begin
  process (${clk})
    variable started : boolean := false;
    variable a : integer;
    variable bad : boolean;
  begin
    if not started then
      started := true;
      for i in 0 to ${depth - 1} loop if INIT(i) = '1' then m(i) <= '1'; else m(i) <= '0'; end if; end loop;
    end if;
    if ${falling ? 'falling_edge' : 'rising_edge'}(${clk}) and WE = '1' then
${addrOf(wa, '      ')}
      if not bad then m(a) <= ${din}; end if;
    end if;
  end process;
${reads.map(([o, pins]) => `  process (m, ${pins.join(', ')})
    variable a : integer;
    variable bad : boolean;
  begin
${addrOf(pins)}
    if bad then ${o} <= 'X'; else ${o} <= m(a); end if;
  end process;`).join('\n')}
end silinx;`;
};
const DRAMS = [
  ...[4, 5, 6].flatMap((n) => [dram(`RAM${2 ** n}X1S`, n), dram(`RAM${2 ** n}X1S_1`, n, { falling: true })]),
  ...[4, 5, 6].map((n) => dram(`RAM${2 ** n}X1D`, n, { dual: true })),
  dram('RAM16X1D_1', 4, { dual: true, falling: true }),
].join('\n');

// 18 x 18 signed multipliers: combinational, registered (MULT18X18S) and the Spartan-3E block with
// optional input / output registers (MULT18X18SIO)
const MULTS = [
  simple('MULT18X18', 'A : in std_logic_vector(17 downto 0); B : in std_logic_vector(17 downto 0); P : out std_logic_vector(35 downto 0)',
    '  P <= std_logic_vector(signed(A) * signed(B));'),
  `
library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;
entity MULT18X18S is
  port (A : in std_logic_vector(17 downto 0); B : in std_logic_vector(17 downto 0); C, CE, R : in std_ulogic; P : out std_logic_vector(35 downto 0));
end MULT18X18S;
architecture silinx of MULT18X18S is
  signal p_r : std_logic_vector(35 downto 0) := (others => '0');
begin
  P <= p_r;
  process (C)
  begin
    if rising_edge(C) then
      if R = '1' then p_r <= (others => '0');
      elsif CE = '1' then p_r <= std_logic_vector(signed(A) * signed(B));
      end if;
    end if;
  end process;
end silinx;
library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;
entity MULT18X18SIO is
  generic (AREG : integer := 1; BREG : integer := 1; PREG : integer := 1; B_INPUT : string := "DIRECT");
  port (A : in std_logic_vector(17 downto 0); B : in std_logic_vector(17 downto 0); BCIN : in std_logic_vector(17 downto 0) := (others => '0');
        CEA, CEB, CEP, CLK, RSTA, RSTB, RSTP : in std_ulogic;
        BCOUT : out std_logic_vector(17 downto 0); P : out std_logic_vector(35 downto 0));
end MULT18X18SIO;
architecture silinx of MULT18X18SIO is
  signal a_r, b_r : std_logic_vector(17 downto 0) := (others => '0');
  signal p_r : std_logic_vector(35 downto 0) := (others => '0');
  signal b_in, a_m, b_m : std_logic_vector(17 downto 0);
  signal prod : std_logic_vector(35 downto 0);
begin
  b_in <= BCIN when B_INPUT = "CASCADE" else B;
  a_m <= a_r when AREG = 1 else A;
  b_m <= b_r when BREG = 1 else b_in;
  prod <= std_logic_vector(signed(a_m) * signed(b_m));
  BCOUT <= b_m;
  P <= p_r when PREG = 1 else prod;
  process (CLK)
  begin
    if rising_edge(CLK) then
      if RSTA = '1' then a_r <= (others => '0'); elsif CEA = '1' then a_r <= A; end if;
      if RSTB = '1' then b_r <= (others => '0'); elsif CEB = '1' then b_r <= b_in; end if;
      if RSTP = '1' then p_r <= (others => '0'); elsif CEP = '1' then p_r <= prod; end if;
    end if;
  end process;
end silinx;`,
].join('\n');

// 16 Kbit block RAM (Spartan-3 / 3E RAMB16_Sw single port, RAMB16_Sm_Sn dual port): data and parity
// bits shared by the ports whatever their widths, INIT_xx / INITP_xx contents, synchronous read
// with WRITE_MODE (WRITE_FIRST / READ_FIRST / NO_CHANGE), SSR loads SRVAL, INIT = output at start.
// Collisions between the ports are not checked.
const BRAM_W = { 1: [1, 0, 14], 2: [2, 0, 13], 4: [4, 0, 12], 9: [8, 1, 11], 18: [16, 2, 10], 36: [32, 4, 9] };   // data, parity, address bits
const hexZeros = (bits) => `X"${'0'.repeat(Math.ceil(bits / 4))}"`;
const bram = (ws) => {
  const dual = ws.length === 2;
  const name = `RAMB16_${ws.map((w) => `S${w}`).join('_')}`;
  const parity = ws.some((w) => BRAM_W[w][1]);
  const ports = [], gens = [], init = [], body = [];
  ws.forEach((w, k) => {
    const [dw, pw, aw] = BRAM_W[w];
    const x = dual ? 'AB'[k] : '', g = dual ? `_${x}` : '';
    const iw = 4 * Math.ceil((dw + pw) / 4);
    ports.push(`DO${x} : out std_logic_vector(${dw - 1} downto 0)`, ...(pw ? [`DOP${x} : out std_logic_vector(${pw - 1} downto 0)`] : []),
      `ADDR${x} : in std_logic_vector(${aw - 1} downto 0)`, `CLK${x} : in std_ulogic`, `DI${x} : in std_logic_vector(${dw - 1} downto 0)`,
      ...(pw ? [`DIP${x} : in std_logic_vector(${pw - 1} downto 0)`] : []), `EN${x} : in std_ulogic`, `SSR${x} : in std_ulogic`, `WE${x} : in std_ulogic`);
    gens.push(`INIT${g} : bit_vector(${iw - 1} downto 0) := ${hexZeros(iw)}`, `SRVAL${g} : bit_vector(${iw - 1} downto 0) := ${hexZeros(iw)}`, `WRITE_MODE${g} : string := "WRITE_FIRST"`);
    const load = (v) => [`DO${x} <= to_stdlogicvector(${v}(${dw - 1} downto 0));`, ...(pw ? [`DOP${x} <= to_stdlogicvector(${v}(${dw + pw - 1} downto ${dw}));`] : [])];
    init.push(...load(`INIT${g}`));
    const dSl = `mem(a * ${dw} + ${dw - 1} downto a * ${dw})`, pSl = `par(a * ${pw} + ${pw - 1} downto a * ${pw})`;
    body.push(`    if rising_edge(CLK${x}) and EN${x} = '1' then
      a := 0; bad := false;
      for i in ${aw - 1} downto 0 loop
        a := a * 2;
        if ADDR${x}(i) = '1' then a := a + 1; elsif ADDR${x}(i) /= '0' then bad := true; end if;
      end loop;
      if SSR${x} = '1' then
        ${load(`SRVAL${g}`).join('\n        ')}
      elsif bad then
        DO${x} <= (others => 'X');${pw ? ` DOP${x} <= (others => 'X');` : ''}
      elsif WE${x} /= '1' or WRITE_MODE${g} = "READ_FIRST" then
        DO${x} <= to_stdlogicvector(${dSl});${pw ? `\n        DOP${x} <= to_stdlogicvector(${pSl});` : ''}
      elsif WRITE_MODE${g} = "WRITE_FIRST" then
        DO${x} <= DI${x};${pw ? ` DOP${x} <= DIP${x};` : ''}
      end if;
      if WE${x} = '1' and not bad then
        ${dSl} := to_bitvector(DI${x});${pw ? `\n        ${pSl} := to_bitvector(DIP${x});` : ''}
      end if;
    end if;`);
  });
  const hex = (k) => k.toString(16).toUpperCase().padStart(2, '0');
  gens.push('SIM_COLLISION_CHECK : string := "ALL"', ...Array.from({ length: 64 }, (_, k) => `INIT_${hex(k)} : bit_vector(255 downto 0) := ${hexZeros(256)}`),
    ...(parity ? Array.from({ length: 8 }, (_, k) => `INITP_${hex(k)} : bit_vector(255 downto 0) := ${hexZeros(256)}`) : []));
  return `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity ${name} is
  generic (${gens.join(';\n    ')});
  port (${ports.join(';\n    ')});
end ${name};
architecture silinx of ${name} is
begin
  process (${dual ? 'CLKA, CLKB' : 'CLK'})
    variable mem : bit_vector(16383 downto 0);${parity ? '\n    variable par : bit_vector(2047 downto 0);' : ''}
    variable started : boolean := false;
    variable a : integer;
    variable bad : boolean;
  begin
    if not started then
      started := true;
${Array.from({ length: 64 }, (_, k) => `      mem(${k * 256 + 255} downto ${k * 256}) := INIT_${hex(k)};`).join('\n')}
${parity ? Array.from({ length: 8 }, (_, k) => `      par(${k * 256 + 255} downto ${k * 256}) := INITP_${hex(k)};`).join('\n') : ''}
      ${init.join('\n      ')}
    end if;
${body.join('\n')}
  end process;
end silinx;`;
};
const BW = [1, 2, 4, 9, 18, 36];
const BRAMS = [...BW.map((w) => bram([w])), ...BW.flatMap((m, i) => BW.slice(i).map((n) => bram([m, n])))].join('\n');

// Digital clock managers: simulated as a pass-through (every clock output = CLKIN, inverted for
// the 180-degree ones), with a warning
const DCM_GENS = 'CLKDV_DIVIDE : real := 2.0; CLKFX_DIVIDE : integer := 1; CLKFX_MULTIPLY : integer := 4; CLKIN_DIVIDE_BY_2 : boolean := FALSE; '
  + 'CLKIN_PERIOD : real := 10.0; CLKOUT_PHASE_SHIFT : string := "NONE"; CLK_FEEDBACK : string := "1X"; DESKEW_ADJUST : string := "SYSTEM_SYNCHRONOUS"; '
  + 'DFS_FREQUENCY_MODE : string := "LOW"; DLL_FREQUENCY_MODE : string := "LOW"; DSS_MODE : string := "NONE"; DUTY_CYCLE_CORRECTION : boolean := TRUE; '
  + 'FACTORY_JF : bit_vector(15 downto 0) := X"C080"; PHASE_SHIFT : integer := 0; STARTUP_WAIT : boolean := FALSE; SIM_MODE : string := "SAFE"';
const dcm = (name) => `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity ${name} is
  generic (${DCM_GENS});
  port (CLKIN : in std_ulogic; CLKFB, RST, DSSEN, PSCLK, PSEN, PSINCDEC : in std_ulogic := '0';
        CLK0, CLK90, CLK180, CLK270, CLK2X, CLK2X180, CLKDV, CLKFX, CLKFX180, LOCKED, PSDONE : out std_ulogic;
        STATUS : out std_logic_vector(7 downto 0));
end ${name};
architecture silinx of ${name} is
begin
  CLK0 <= CLKIN; CLK90 <= CLKIN; CLK270 <= not CLKIN; CLK180 <= not CLKIN;
  CLK2X <= CLKIN; CLK2X180 <= not CLKIN; CLKDV <= CLKIN; CLKFX <= CLKIN; CLKFX180 <= not CLKIN;
  LOCKED <= '0' when RST = '1' else '1';
  PSDONE <= '0';
  STATUS <= (others => '0');
  process
  begin
    report "${name} simulated as a clock pass-through: CLK0, CLK2X, CLKDV and CLKFX all run at the CLKIN frequency (no multiplication, division or phase shift)" severity warning;
    wait;
  end process;
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
// transparent latch of the slices (post-translate / map): RST > SET > gate (CLK = '1', and GE)
const xlatch = (name, ge) => `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity ${name} is
  generic (LOC : string := "UNPLACED"; INIT : bit := '0');
  port (I : in std_ulogic;${ge ? ' GE : in std_ulogic;' : ''} CLK : in std_ulogic; SET : in std_ulogic; RST : in std_ulogic; O : out std_ulogic);
end ${name};
architecture silinx of ${name} is
  signal q_i : std_ulogic := '0';
begin
  O <= q_i;
  process (I, CLK, SET, RST${ge ? ', GE' : ''})
    variable started : boolean := false;
  begin
    if not started then
      started := true;
      if INIT = '1' then q_i <= '1'; else q_i <= '0'; end if;
    end if;
    if RST = '1' then q_i <= '0';
    elsif SET = '1' then q_i <= '1';
    elsif CLK = '1'${ge ? " and GE = '1'" : ''} then q_i <= I;
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
  ...['X_BUF', 'X_CKBUF', 'X_IPAD', 'X_OPAD', 'X_BUFGP'].map((n) => xs(n, PP, 'I : in std_ulogic; O : out std_ulogic', '  O <= I;')),
  xs('X_OBUF', `${PP}; ${IO_GENS}`, 'I : in std_ulogic; O : out std_ulogic', '  O <= I;'),
  // output buffer with 3-state control: CTL = '1' releases the pad (like T of OBUFT)
  xs('X_OBUFT', `${PP}; ${IO_GENS}`, 'I : in std_ulogic; CTL : in std_ulogic; O : out std_ulogic', "  O <= I when CTL = '0' else 'Z' when CTL = '1' else 'X';"),
  xs('X_PU', '', 'O : out std_logic', "  O <= 'H';"),
  xs('X_PD', '', 'O : out std_logic', "  O <= 'L';"),
  xs('X_INV', PP, 'I : in std_ulogic; O : out std_ulogic', '  O <= not I;'),
  xs('X_ZERO', '', 'O : out std_ulogic', "  O <= '0';"),
  xs('X_ONE', '', 'O : out std_ulogic', "  O <= '1';"),
  xs('X_AND2', PP, 'I0 : in std_ulogic; I1 : in std_ulogic; O : out std_ulogic', '  O <= I0 and I1;'),
  xs('X_OR2', PP, 'I0 : in std_ulogic; I1 : in std_ulogic; O : out std_ulogic', '  O <= I0 or I1;'),
  xs('X_XOR2', PP, 'I0 : in std_ulogic; I1 : in std_ulogic; O : out std_ulogic', '  O <= I0 xor I1;'),
  xs('X_MUX2', PP, 'IA : in std_ulogic; IB : in std_ulogic; SEL : in std_ulogic; O : out std_ulogic', mux2('O', 'IA', 'IB', 'SEL')),
  xs('X_BUFGMUX', '', 'I0 : in std_ulogic; I1 : in std_ulogic; S : in std_ulogic; O : out std_ulogic', mux2('O', 'I0', 'I1', 'S')),
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
  xlatch('X_LATCH', false), xlatch('X_LATCHE', true),
  srl('X_SRL16E', { ce: true, simprim: true }), srl('X_SRLC16E', { ce: true, q15: true, simprim: true }),
  ...[4, 5, 6].flatMap((n) => [dram(`X_RAMS${2 ** n}`, n, { simprim: true }), dram(`X_RAMD${2 ** n}`, n, { simprim: true, dual: true })]),
  `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity X_MULT18X18SIO is
  generic (LOC : string := "UNPLACED"; AREG : integer := 1; BREG : integer := 1; PREG : integer := 1; B_INPUT : string := "DIRECT");
  port (A : in std_logic_vector(17 downto 0); B : in std_logic_vector(17 downto 0); BCIN : in std_logic_vector(17 downto 0) := (others => '0');
        CEA, CEB, CEP, CLK, RSTA, RSTB, RSTP : in std_ulogic;
        BCOUT : out std_logic_vector(17 downto 0); P : out std_logic_vector(35 downto 0));
end X_MULT18X18SIO;
architecture silinx of X_MULT18X18SIO is
begin
  u : entity work.MULT18X18SIO generic map (AREG => AREG, BREG => BREG, PREG => PREG, B_INPUT => B_INPUT)
    port map (A => A, B => B, BCIN => BCIN, CEA => CEA, CEB => CEB, CEP => CEP, CLK => CLK, RSTA => RSTA, RSTB => RSTB, RSTP => RSTP, BCOUT => BCOUT, P => P);
end silinx;`,
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
  muxcy(''), muxcy('_L'), muxcy('_D'),
  simple('XORCY', 'CI : in std_ulogic; LI : in std_ulogic; O : out std_ulogic', '  O <= CI xor LI;'),
  simple('XORCY_L', 'CI : in std_ulogic; LI : in std_ulogic; LO : out std_ulogic', '  LO <= CI xor LI;'),
  simple('XORCY_D', 'CI : in std_ulogic; LI : in std_ulogic; O : out std_ulogic; LO : out std_ulogic', '  O <= CI xor LI;\n  LO <= CI xor LI;'),
  simple('MULT_AND', 'I0 : in std_ulogic; I1 : in std_ulogic; LO : out std_ulogic', '  LO <= I0 and I1;'),
  muxf(5), muxf(6), muxf(7), muxf(8),
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [lut(n, `LUT${n}`, ['O']), lut(n, `LUT${n}_L`, ['LO']), lut(n, `LUT${n}_D`, ['O', 'LO'])]),
  ...FFS.flatMap(([b, p]) => [ff(b, p, false), ff(b, p, true)]),
  ...LATCHES.flatMap(([n, p]) => [latch(n, p, false), latch(n, p, true)]),
  SRLS, DRAMS, MULTS, BRAMS, dcm('DCM_SP'), dcm('DCM'),
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

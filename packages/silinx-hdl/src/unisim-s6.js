// Silinx - the Spartan-6 UNISIM primitives the open synthesis maps onto (Yosys synth_xilinx -family xc6s,
// #720): Silinx's own functional models, written from the documented behaviour of each primitive (Spartan-6
// Libraries Guide UG615, the CLB, block RAM and DSP48A1 user guides UG384, UG383, UG389), as core/unisim.js's.
// No timing; the Xilinx UNISIM sources are not used (nor redistributed).
//   - CARRY4: the slice's carry chain, CO(i) = S(i) ? c(i) : DI(i), O(i) = S(i) xor c(i), c(0) = CI or CYINIT;
//   - SRLC32E: a 32-bit shift register LUT, Q at the address A, Q31 the cascade;
//   - the SLICEM's distributed RAMs with vector addresses or several ports: RAM128X1S / D, RAM256X1S, RAM32M,
//     RAM64M (RAM32X1S / D and RAM64X1S / D are core/unisim.js's);
//   - DSP48A1: its pipeline registers (A0REG, A1REG, B0REG, B1REG, CREG, DREG, MREG, PREG, OPMODEREG,
//     CARRYINREG, CARRYOUTREG; RSTTYPE SYNC or ASYNC), the pre-adder (OPMODE(4); OPMODE(6) subtracts), the 18 x 18
//     signed multiplier, the X (OPMODE(1:0): 0, M, P, D:A:B) and Z (OPMODE(3:2): 0, PCIN, P, C) multiplexers (P: the
//     P register's, the feedback of an accumulator), the
//     48-bit post-adder (OPMODE(7) subtracts) with its carry-in (CARRYINSEL: OPMODE(5) or CARRYIN);
//   - RAMB16BWER (18 Kbit) and RAMB8BWER (9 Kbit, TDP or SDP of 36 bits): the data and parity bits shared by the
//     ports whatever their widths (DATA_WIDTH_x 1, 2, 4, 9, 18, 36; 0 an unused port), INIT_xx / INITP_xx,
//     byte write enables (a port of 18 bits or more: one WE bit a byte and its parity bit; narrower: WE(0)),
//     WRITE_MODE (WRITE_FIRST, READ_FIRST, NO_CHANGE), the output latch and the optional output register
//     (DOx_REG, REGCEx), the reset to SRVAL (EN_RSTRAM, the register's RST_PRIORITY, RSTTYPE), INIT the output
//     at start. In SDP mode port A writes 36 bits (DIBDI & DIADI, WEBWEU & WEAWEL) and port B reads them (DOBDO &
//     DOADO), INIT_A / SRVAL_A the low half, INIT_B / SRVAL_B the high half. On an edge the reads of both ports,
//     then the writes; collisions are not checked.
//   - PLL_BASE (#791): the VCO at CLKIN × CLKFBOUT_MULT / DIVCLK_DIVIDE, CLKOUT0-5 its frequency / CLKOUTn_DIVIDE with
//     their duty cycles and phases (in degrees of their own period), CLKFBOUT at CLKIN / DIVCLK_DIVIDE; as core/unisim.js's
//     DCM, each output re-aligned to CLKIN's rising edges (every DIVCLK_DIVIDE × CLKOUTn_DIVIDE of them), LOCKED after
//     3 of them (RST restarts it, the outputs low until then); the feedback (CLKFBIN), the bandwidth, the
//     compensation and the jitter are not modelled;
//   - BUFIO2 (#791): IOCLK the input clock (inverted with I_INVERT), DIVCLK the same or divided by DIVIDE (high for
//     the first half of the DIVIDE periods, rounded up), SERDESSTROBE 1 for one input period in DIVIDE (0 with
//     DIVIDE_BYPASS); USE_DOUBLER is not modelled.
//
// Isomorphic ES module (browser + Node), no DOM.

import { hex2 } from './util.js';
const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';
const zeros = (bits) => `X"${'0'.repeat(Math.ceil(bits / 4))}"`;
const Z = (n) => `(${n - 1} downto 0 => '0')`;
// 2:1 multiplexer, an unknown select known only when both inputs agree (core/unisim.js mux2)
const mux2 = (out, a, b, s) => `  ${out} <= ${b} when ${s} = '1' else ${a} when ${s} = '0' else ${a} when (${a} = '0' and ${b} = '0') or (${a} = '1' and ${b} = '1') else 'X';`;
// an address from the bits hi … lo of a vector into `adr` (in words of 2^lo), `bad` when one of them is not 0 / 1
// (adr, not a: VHDL names are case-insensitive, and a primitive's address port may be A)
const addrOfVec = (v, hi, ind = '    ', lo = '0') => `${ind}adr := 0; bad := false;\n${ind}for i in ${hi} downto ${lo} loop\n${ind}  adr := adr * 2;\n`
  + `${ind}  if ${v}(i) = '1' then adr := adr + 1; elsif ${v}(i) /= '0' then bad := true; end if;\n${ind}end loop;`;

const CARRY4 = `
${IEEE}
entity CARRY4 is
  port (CO : out std_logic_vector(3 downto 0); O : out std_logic_vector(3 downto 0);
        CI : in std_ulogic := '0'; CYINIT : in std_ulogic := '0'; DI : in std_logic_vector(3 downto 0); S : in std_logic_vector(3 downto 0));
end CARRY4;
architecture silinx of CARRY4 is
  signal c : std_logic_vector(4 downto 0);
begin
  c(0) <= CI or CYINIT;
${[0, 1, 2, 3].map((i) => `${mux2(`c(${i + 1})`, `DI(${i})`, `c(${i})`, `S(${i})`)}\n  O(${i}) <= S(${i}) xor c(${i});`).join('\n')}
  CO <= c(4 downto 1);
end silinx;`;

const SRLC32E = `
${IEEE}
entity SRLC32E is
  generic (INIT : bit_vector(31 downto 0) := X"00000000"; IS_CLK_INVERTED : bit := '0');
  port (A : in std_logic_vector(4 downto 0); CE : in std_ulogic := '1'; CLK, D : in std_ulogic; Q, Q31 : out std_ulogic);
end SRLC32E;
architecture silinx of SRLC32E is
  signal r : std_logic_vector(31 downto 0) := (others => '0');
begin
  process (CLK)
    variable started : boolean := false;
  begin
    if not started then
      started := true;
      for i in 0 to 31 loop if INIT(i) = '1' then r(i) <= '1'; else r(i) <= '0'; end if; end loop;
    end if;
    if ((IS_CLK_INVERTED = '0' and rising_edge(CLK)) or (IS_CLK_INVERTED = '1' and falling_edge(CLK))) and CE = '1' then r <= r(30 downto 0) & D; end if;
  end process;
  process (r, A)
    variable adr : integer;
    variable bad : boolean;
  begin
${addrOfVec('A', 4)}
    if bad then Q <= 'X'; else Q <= r(adr); end if;
  end process;
  Q31 <= r(31);
end silinx;`;

// a distributed RAM of 2^n words of w bits (w = 1: std_ulogic ports): rams [{ init, din, reads: [[output,
// address]] }] written together at the address `wa`; scalar: the address pins A0 … (else vectors)
const lutram = (name, n, { rams = [{ init: 'INIT', din: 'D', reads: [['O', 'A']] }], wa = 'A', w = 1, scalar = false } = {}) => {
  const bits = 2 ** n * w;
  const addrs = [...new Set([wa, ...rams.flatMap((r) => r.reads.map((x) => x[1]))])];
  const t = w === 1 ? 'std_ulogic' : `std_logic_vector(${w - 1} downto 0)`;
  const pinsOf = (v) => Array.from({ length: n }, (_, i) => `${v}${i}`);
  const addrPorts = scalar ? `${pinsOf(wa).join(', ')} : in std_ulogic` : addrs.map((x) => `${x} : in std_logic_vector(${n - 1} downto 0)`).join('; ');
  // (scalar pins as core/unisim.js's addrOf)
  const decode = (v, ind) => (scalar ? `${ind}adr := 0; bad := false;\n${pinsOf(v).map((x, i) => `${ind}if ${x} = '1' then adr := adr + ${2 ** i}; elsif ${x} /= '0' then bad := true; end if;`).join('\n')}` : addrOfVec(v, n - 1, ind));
  const word = (m) => (w === 1 ? `${m}(adr)` : `${m}(adr * ${w} + ${w - 1} downto adr * ${w})`);
  return `
${IEEE}
entity ${name} is
  generic (${rams.map((r) => `${r.init} : bit_vector(${bits - 1} downto 0) := (others => '0')`).join('; ')});
  port (${addrPorts}; ${rams.map((r) => `${r.din} : in ${t}`).join('; ')}; WCLK, WE : in std_ulogic;
        ${rams.flatMap((r) => r.reads.map((x) => `${x[0]} : out ${t}`)).join('; ')});
end ${name};
architecture silinx of ${name} is
${rams.map((r, k) => `  signal m${k} : std_logic_vector(${bits - 1} downto 0) := (others => '0');`).join('\n')}
begin
  process (WCLK)
    variable started : boolean := false;
    variable adr : integer;
    variable bad : boolean;
  begin
    if not started then
      started := true;
${rams.map((r, k) => `      for i in 0 to ${bits - 1} loop if ${r.init}(i) = '1' then m${k}(i) <= '1'; else m${k}(i) <= '0'; end if; end loop;`).join('\n')}
    end if;
    if rising_edge(WCLK) and WE = '1' then
${decode(wa, '      ')}
      if not bad then
${rams.map((r, k) => `        ${word(`m${k}`)} <= ${r.din};`).join('\n')}
      end if;
    end if;
  end process;
${rams.flatMap((r, k) => r.reads.map(([o, ad]) => `  process (m${k}, ${scalar ? pinsOf(ad).join(', ') : ad})
    variable adr : integer;
    variable bad : boolean;
  begin
${decode(ad, '    ')}
    if bad then ${o} <= ${w === 1 ? "'X'" : "(others => 'X')"}; else ${o} <= ${word(`m${k}`)}; end if;
  end process;`)).join('\n')}
end silinx;`;
};
const LUTRAMS = [
  lutram('RAM128X1S', 7, { scalar: true }),
  lutram('RAM128X1D', 7, { rams: [{ init: 'INIT', din: 'D', reads: [['SPO', 'A'], ['DPO', 'DPRA']] }] }),
  lutram('RAM256X1S', 8),
  lutram('RAM32M', 5, { w: 2, wa: 'ADDRD', rams: 'ABCD'.split('').map((x) => ({ init: `INIT_${x}`, din: `DI${x}`, reads: [[`DO${x}`, `ADDR${x}`]] })) }),
  lutram('RAM64M', 6, { wa: 'ADDRD', rams: 'ABCD'.split('').map((x) => ({ init: `INIT_${x}`, din: `DI${x}`, reads: [[`DO${x}`, `ADDR${x}`]] })) }),
].join('\n');

// a register of the DSP48A1: its reset (asynchronous when RSTTYPE is ASYNC) before its clock enable
const dspReg = (r, d, ce, rst, zero) => `    if RSTTYPE = "ASYNC" and ${rst} = '1' then ${r} <= ${zero};
    elsif rising_edge(CLK) then
      if ${rst} = '1' then ${r} <= ${zero}; elsif ${ce} = '1' then ${r} <= ${d}; end if;
    end if;`;
const DSP48A1 = `
${IEEE}
entity DSP48A1 is
  generic (A0REG : integer := 0; A1REG : integer := 1; B0REG : integer := 0; B1REG : integer := 1; CARRYINREG : integer := 1;
           CARRYINSEL : string := "OPMODE5"; CARRYOUTREG : integer := 1; CREG : integer := 1; DREG : integer := 1; MREG : integer := 1;
           OPMODEREG : integer := 1; PREG : integer := 1; RSTTYPE : string := "SYNC");
  port (BCOUT : out std_logic_vector(17 downto 0); CARRYOUT, CARRYOUTF : out std_ulogic; M : out std_logic_vector(35 downto 0);
        P, PCOUT : out std_logic_vector(47 downto 0);
        A, B, D : in std_logic_vector(17 downto 0) := (others => '0'); C, PCIN : in std_logic_vector(47 downto 0) := (others => '0');
        OPMODE : in std_logic_vector(7 downto 0) := (others => '0'); CARRYIN, CLK : in std_ulogic := '0';
        CEA, CEB, CEC, CECARRYIN, CED, CEM, CEOPMODE, CEP : in std_ulogic := '1';
        RSTA, RSTB, RSTC, RSTCARRYIN, RSTD, RSTM, RSTOPMODE, RSTP : in std_ulogic := '0');
end DSP48A1;
architecture silinx of DSP48A1 is
  signal a0_r, a1_r, b0_r, b1_r, d_r, a0, a1, b0, b1, d_m, pre, b1_in : std_logic_vector(17 downto 0) := (others => '0');
  signal op_r, op : std_logic_vector(7 downto 0) := (others => '0');
  signal m_r, m_m, prod : std_logic_vector(35 downto 0) := (others => '0');
  signal c_r, c_m, x, z, p_r, p_m, post : std_logic_vector(47 downto 0) := (others => '0');
  signal sum, cin49 : std_logic_vector(48 downto 0);
  signal cin_r, cin_in, cin, cout_r : std_ulogic := '0';
begin
  a0 <= a0_r when A0REG = 1 else A;
  a1 <= a1_r when A1REG = 1 else a0;
  b0 <= b0_r when B0REG = 1 else B;
  d_m <= d_r when DREG = 1 else D;
  op <= op_r when OPMODEREG = 1 else OPMODE;
  -- the pre-adder: D + B or D - B (OPMODE(6)), taken when OPMODE(4)
  pre <= std_logic_vector(unsigned(d_m) - unsigned(b0)) when op(6) = '1' else std_logic_vector(unsigned(d_m) + unsigned(b0));
  b1_in <= pre when op(4) = '1' else b0;
  b1 <= b1_r when B1REG = 1 else b1_in;
  BCOUT <= b1;
  prod <= std_logic_vector(signed(a1) * signed(b1));
  m_m <= m_r when MREG = 1 else prod;
  M <= m_m;
  c_m <= c_r when CREG = 1 else C;
  cin_in <= op(5) when CARRYINSEL = "OPMODE5" else CARRYIN;
  cin <= cin_r when CARRYINREG = 1 else cin_in;
  x <= ${Z(48)} when op(1 downto 0) = "00" else std_logic_vector(resize(signed(m_m), 48)) when op(1 downto 0) = "01"
       else p_r when op(1 downto 0) = "10" else d_m(11 downto 0) & a1 & b1;
  z <= ${Z(48)} when op(3 downto 2) = "00" else PCIN when op(3 downto 2) = "01" else p_r when op(3 downto 2) = "10" else c_m;
  -- the post-adder: Z + (X + CIN), or Z - (X + CIN) (OPMODE(7)); its carry out the 49th bit
  cin49 <= (0 => cin, others => '0');
  sum <= std_logic_vector(unsigned('0' & z) + (unsigned('0' & x) + unsigned(cin49))) when op(7) = '0'
         else std_logic_vector(unsigned('0' & z) - (unsigned('0' & x) + unsigned(cin49)));
  post <= sum(47 downto 0);
  p_m <= p_r when PREG = 1 else post;
  P <= p_m;
  PCOUT <= p_m;
  CARRYOUT <= cout_r when CARRYOUTREG = 1 else sum(48);
  CARRYOUTF <= cout_r when CARRYOUTREG = 1 else sum(48);
  process (CLK, RSTA, RSTB, RSTC, RSTCARRYIN, RSTD, RSTM, RSTOPMODE, RSTP)
  begin
${dspReg('a0_r', 'A', 'CEA', 'RSTA', Z(18))}
${dspReg('a1_r', 'a0', 'CEA', 'RSTA', Z(18))}
${dspReg('b0_r', 'B', 'CEB', 'RSTB', Z(18))}
${dspReg('b1_r', 'b1_in', 'CEB', 'RSTB', Z(18))}
${dspReg('d_r', 'D', 'CED', 'RSTD', Z(18))}
${dspReg('c_r', 'C', 'CEC', 'RSTC', Z(48))}
${dspReg('op_r', 'OPMODE', 'CEOPMODE', 'RSTOPMODE', Z(8))}
${dspReg('m_r', 'prod', 'CEM', 'RSTM', Z(36))}
${dspReg('p_r', 'post', 'CEP', 'RSTP', Z(48))}
${dspReg('cin_r', 'cin_in', 'CECARRYIN', 'RSTCARRYIN', "'0'")}
${dspReg('cout_r', 'sum(48)', 'CECARRYIN', 'RSTCARRYIN', "'0'")}
  end process;
end silinx;`;

// ------------------------------------------------------------------ block RAM
// the data and parity bits, the address bits, the widths of DI / DIP / WE / INIT, the INIT_xx and INITP_xx, whether it
// has the SDP mode, the pins of ports A and B
export const BWER = {
  RAMB16BWER: { mem: 16384, par: 2048, aw: 14, dw: 32, pw: 4, ww: 4, iw: 36, inits: 64, initps: 8, sdp: false,
    pins: (x) => ({ addr: `ADDR${x}`, clk: `CLK${x}`, di: `DI${x}`, dip: `DIP${x}`, dout: `DO${x}`, dop: `DOP${x}`, en: `EN${x}`, regce: `REGCE${x}`, rst: `RST${x}`, we: `WE${x}` }) },
  RAMB8BWER: { mem: 8192, par: 1024, aw: 13, dw: 16, pw: 2, ww: 2, iw: 18, inits: 32, initps: 4, sdp: true,
    pins: (x) => (x === 'A'
      ? { addr: 'ADDRAWRADDR', clk: 'CLKAWRCLK', di: 'DIADI', dip: 'DIPADIP', dout: 'DOADO', dop: 'DOPADOP', en: 'ENAWREN', regce: 'REGCEA', rst: 'RSTA', we: 'WEAWEL' }
      : { addr: 'ADDRBRDADDR', clk: 'CLKBRDCLK', di: 'DIBDI', dip: 'DIPBDIP', dout: 'DOBDO', dop: 'DOPBDOP', en: 'ENBRDEN', regce: 'REGCEBREGCE', rst: 'RSTBRST', we: 'WEBWEU' }) },
};
const bwer = (name) => {
  const k = BWER[name];
  const A = k.pins('A'), B = k.pins('B');
  const ports = [A, B].flatMap((p) => [`${p.dout} : out std_logic_vector(${k.dw - 1} downto 0)`, `${p.dop} : out std_logic_vector(${k.pw - 1} downto 0)`,
    `${p.addr} : in std_logic_vector(${k.aw - 1} downto 0) := (others => '0')`, `${p.clk} : in std_ulogic := '0'`,
    `${p.di} : in std_logic_vector(${k.dw - 1} downto 0) := (others => '0')`, `${p.dip} : in std_logic_vector(${k.pw - 1} downto 0) := (others => '0')`,
    `${p.en} : in std_ulogic := '0'`, `${p.regce} : in std_ulogic := '0'`, `${p.rst} : in std_ulogic := '0'`, `${p.we} : in std_logic_vector(${k.ww - 1} downto 0) := (others => '0')`]);
  const gens = [...['A', 'B'].flatMap((x) => [`DATA_WIDTH_${x} : integer := 0`, `DO${x}_REG : integer := 0`, `EN_RSTRAM_${x} : boolean := TRUE`,
    `INIT_${x} : bit_vector(${k.iw - 1} downto 0) := ${zeros(k.iw)}`, `SRVAL_${x} : bit_vector(${k.iw - 1} downto 0) := ${zeros(k.iw)}`,
    `RST_PRIORITY_${x} : string := "CE"`, `WRITE_MODE_${x} : string := "WRITE_FIRST"`]),
  ...(k.sdp ? ['RAM_MODE : string := "TDP"'] : []), 'RSTTYPE : string := "SYNC"', 'SIM_COLLISION_CHECK : string := "ALL"', 'SIM_DEVICE : string := "SPARTAN6"',
  'INIT_FILE : string := "NONE"',
  ...Array.from({ length: k.inits }, (_, j) => `INIT_${hex2(j)} : bit_vector(255 downto 0) := ${zeros(256)}`),
  ...Array.from({ length: k.initps }, (_, j) => `INITP_${hex2(j)} : bit_vector(255 downto 0) := ${zeros(256)}`)];
  const sdp = k.sdp ? 'RAM_MODE = "SDP"' : 'false';
  // a port's width: its data bits, parity bits and the address bits below its word
  const dims = (x) => [[1, 1, 0, 0], [2, 2, 0, 1], [4, 4, 0, 2], [9, 8, 1, 3], [18, 16, 2, 4], [36, 32, 4, 5]]
    .map(([w, d, p, s], i) => `      ${i ? 'elsif' : 'if'} w${x} = ${w} then d${x} := ${d}; p${x} := ${p}; s${x} := ${s};`).join('\n') + `\n      else d${x} := 0; p${x} := 0; s${x} := 0;\n      end if;`;
  // INIT / SRVAL of the ports as vectors of 36 bits (the data bits from 0, then the parity bits)
  const vec36 = (g, a, b) => (k.iw === 36 ? `      ${a} := to_stdlogicvector(${g}_A); ${b} := to_stdlogicvector(${g}_B);`
    : `      ${a} := (others => '0'); ${b} := (others => '0');
      if ${sdp} then
        ${b}(15 downto 0) := to_stdlogicvector(${g}_A(15 downto 0)); ${b}(31 downto 16) := to_stdlogicvector(${g}_B(15 downto 0));
        ${b}(33 downto 32) := to_stdlogicvector(${g}_A(17 downto 16)); ${b}(35 downto 34) := to_stdlogicvector(${g}_B(17 downto 16));
      else
        ${a}(17 downto 0) := to_stdlogicvector(${g}_A); ${b}(17 downto 0) := to_stdlogicvector(${g}_B);
      end if;`);
  // (the variables' names not those of a port: VHDL names are case-insensitive, vdiA is not DIA)
  // a port's inputs as 32 data bits, 4 parity bits and 4 write enables (SDP: port A writes both halves, port B only
  // reads), and the
  // write enable of each data bit (wb) and parity bit (wp): its byte's on a port of 18 bits or more, else WE(0)
  const inputs = (x, p) => `      vdi${x} := (others => '0'); vdp${x} := (others => '0'); vwe${x} := (others => '0');
${k.sdp && x === 'A' ? `      if ${sdp} then vdi${x} := ${B.di} & ${A.di}; vdp${x} := ${B.dip} & ${A.dip}; vwe${x} := ${B.we} & ${A.we};
      else vdi${x}(15 downto 0) := ${A.di}; vdp${x}(1 downto 0) := ${A.dip}; vwe${x}(1 downto 0) := ${A.we};
      end if;` : k.sdp ? `      if not (${sdp}) then vdi${x}(${k.dw - 1} downto 0) := ${p.di}; vdp${x}(${k.pw - 1} downto 0) := ${p.dip}; vwe${x}(${k.ww - 1} downto 0) := ${p.we}; end if;`
    : `      vdi${x}(${k.dw - 1} downto 0) := ${p.di}; vdp${x}(${k.pw - 1} downto 0) := ${p.dip}; vwe${x}(${k.ww - 1} downto 0) := ${p.we};`}
      for i in 0 to d${x} - 1 loop if d${x} >= 16 then wb${x}(i) := vwe${x}(i / 8); else wb${x}(i) := vwe${x}(0); end if; end loop;
      for j in 0 to p${x} - 1 loop if d${x} >= 16 then wp${x}(j) := vwe${x}(j); else wp${x}(j) := vwe${x}(0); end if; end loop;`;
  // a port on its clock's edge: the output register takes the latch, then (reads) the latch the word read
  const port = (x, p, reads) => `
    if rising_edge(${p.clk}) then
      if DO${x}_REG = 1 then
        if RSTTYPE = "SYNC" and EN_RSTRAM_${x} and ${p.rst} = '1' and (RST_PRIORITY_${x} = "SR" or ${p.regce} = '1') then r${x} := srv${x};
        elsif ${p.regce} = '1' then r${x} := l${x};
        end if;
      end if;
      bad${x} := true;
      if ${p.en} = '1' and d${x} > 0 then
${addrOfVec(p.addr, k.aw - 1, '        ', `s${x}`)}
        a${x} := adr; bad${x} := bad; any := false;
        any := vwe${x} /= "0000";
        if ${reads} then
          if RSTTYPE = "SYNC" and EN_RSTRAM_${x} and ${p.rst} = '1' and DO${x}_REG = 0 then l${x} := srv${x};
          elsif bad then l${x} := (others => 'X');
          elsif not (any and WRITE_MODE_${x} = "NO_CHANGE") then
            for i in 0 to d${x} - 1 loop
              if WRITE_MODE_${x} = "WRITE_FIRST" and wb${x}(i) = '1' then l${x}(i) := vdi${x}(i); else l${x}(i) := to_stdulogic(mem(adr * d${x} + i)); end if;
            end loop;
            for j in 0 to p${x} - 1 loop
              if WRITE_MODE_${x} = "WRITE_FIRST" and wp${x}(j) = '1' then l${x}(d${x} + j) := vdp${x}(j); else l${x}(d${x} + j) := to_stdulogic(par(adr * p${x} + j)); end if;
            end loop;
          end if;
        end if;
      end if;
    end if;`;
  const write = (x, p, ind = '    ') => `${ind}if rising_edge(${p.clk}) and ${p.en} = '1' and not bad${x} then
${ind}  if vwe${x} /= "0000" then
${ind}    for i in 0 to d${x} - 1 loop if wb${x}(i) = '1' then mem(a${x} * d${x} + i) := to_bit(vdi${x}(i)); end if; end loop;
${ind}    for j in 0 to p${x} - 1 loop if wp${x}(j) = '1' then par(a${x} * p${x} + j) := to_bit(vdp${x}(j)); end if; end loop;
${ind}  end if;
${ind}end if;`;
  const asyncReset = (x, p) => `    if RSTTYPE = "ASYNC" and EN_RSTRAM_${x} and ${p.rst} = '1' then
      if DO${x}_REG = 1 then r${x} := srv${x}; else l${x} := srv${x}; end if;
    end if;
    if DO${x}_REG = 1 then o${x} := r${x}; else o${x} := l${x}; end if;`;
  // a port's output pins from o (its data bits from lo, its parity bits from lo / 8)
  const out = (x, dout, dop, lo, ind) => `${ind}for i in 0 to ${k.dw - 1} loop if ${lo} + i < d${x} then ${dout}(i) <= o${x}(${lo} + i); else ${dout}(i) <= '0'; end if; end loop;
${ind}for j in 0 to ${k.pw - 1} loop if ${lo / 8} + j < p${x} then ${dop}(j) <= o${x}(d${x} + ${lo / 8} + j); else ${dop}(j) <= '0'; end if; end loop;`;
  return `
${IEEE}
entity ${name} is
  generic (${gens.join(';\n    ')});
  port (${ports.join(';\n    ')});
end ${name};
architecture silinx of ${name} is
begin
  process (${A.clk}, ${B.clk}, ${A.rst}, ${B.rst})
    variable mem : bit_vector(${k.mem - 1} downto 0);
    variable par : bit_vector(${k.par - 1} downto 0);
    variable started : boolean := false;
    variable wA, wB, dA, dB, pA, pB, sA, sB, adr, aA, aB : integer := 0;
    variable bad, badA, badB, any : boolean := true;
    variable done : boolean := false;
    variable lA, lB, rA, rB, oA, oB, initA, initB, srvA, srvB : std_logic_vector(35 downto 0) := (others => '0');
    variable vdiA, vdiB, wbA, wbB : std_logic_vector(31 downto 0);
    variable vdpA, vdpB, vweA, vweB, wpA, wpB : std_logic_vector(3 downto 0);
  begin
    if not started then
      started := true;
${Array.from({ length: k.inits }, (_, j) => `      mem(${j * 256 + 255} downto ${j * 256}) := INIT_${hex2(j)};`).join('\n')}
${Array.from({ length: k.initps }, (_, j) => `      par(${j * 256 + 255} downto ${j * 256}) := INITP_${hex2(j)};`).join('\n')}
      wA := DATA_WIDTH_A; wB := DATA_WIDTH_B;
      if ${sdp} then wA := 36; wB := 36; end if;
${dims('A')}
${dims('B')}
${vec36('INIT', 'initA', 'initB')}
${vec36('SRVAL', 'srvA', 'srvB')}
      lA := initA; rA := initA; lB := initB; rB := initB;
    end if;
    -- (nothing changes on a falling edge)
    if rising_edge(${A.clk}) or rising_edge(${B.clk}) or (RSTTYPE = "ASYNC" and (${A.rst} = '1' or ${B.rst} = '1')) or not done then
      done := true;
${inputs('A', A)}
${inputs('B', B)}
${port('A', A, k.sdp ? `not (${sdp})` : 'true')}
${port('B', B, 'true')}
${write('A', A)}
    if not (${sdp}) then
${write('B', B, '      ')}
    end if;
${asyncReset('A', A)}
${asyncReset('B', B)}
    if ${sdp} then
${out('B', A.dout, A.dop, 0, '      ')}
${out('B', B.dout, B.dop, k.dw, '      ')}
    else
${out('A', A.dout, A.dop, 0, '      ')}
${out('B', B.dout, B.dop, 0, '      ')}
    end if;
    end if;
  end process;
end silinx;`;
};

// ------------------------------------------------------------------ clocking
const PLL_LOCK_CYCLES = 3;
const PLL_N = [0, 1, 2, 3, 4, 5];
// one output of the PLL: on every d-th CLKIN rising edge (after lock), m periods of p * d / m, each high for `duty`
// (thousandths) of it, shifted by `ph` (thousandths of a degree, 0 … 359999)
const pllOut = (sig, m, d, duty, ph) => `
  process (CLKIN, RST)
    variable k : integer := 0;
    variable t, sh : time;
  begin
    if RST = '1' then k := 0; ${sig} <= transport '0';
    elsif rising_edge(CLKIN) and lk then
      if k = 0 then
        t := (p * ${d}) / ${m};
        sh := (t * ${ph}) / 360000;
        for i in 0 to ${m} - 1 loop
          ${sig} <= transport '1' after sh + t * i;
          ${sig} <= transport '0' after sh + t * i + (t * ${duty}) / 1000;
        end loop;
      end if;
      k := k + 1;
      if k >= ${d} then k := 0; end if;
    end if;
  end process;`;
const PLL_BASE = `
${IEEE}
entity PLL_BASE is
  generic (BANDWIDTH : string := "OPTIMIZED"; CLKFBOUT_MULT : integer := 1; CLKFBOUT_PHASE : real := 0.0; CLKIN_PERIOD : real := 0.0;
           ${PLL_N.map((n) => `CLKOUT${n}_DIVIDE : integer := 1; CLKOUT${n}_DUTY_CYCLE : real := 0.5; CLKOUT${n}_PHASE : real := 0.0;`).join('\n           ')}
           CLK_FEEDBACK : string := "CLKFBOUT"; COMPENSATION : string := "SYSTEM_SYNCHRONOUS"; DIVCLK_DIVIDE : integer := 1;
           REF_JITTER : real := 0.1; RESET_ON_LOSS_OF_LOCK : boolean := FALSE);
  port (CLKFBOUT, ${PLL_N.map((n) => `CLKOUT${n}`).join(', ')}, LOCKED : out std_ulogic;
        CLKFBIN : in std_ulogic := '0'; CLKIN : in std_ulogic; RST : in std_ulogic := '0');
end PLL_BASE;
architecture silinx of PLL_BASE is
  signal p : time := 0 ns;               -- CLKIN's period
  signal lk : boolean := false;
  signal cfb, ${PLL_N.map((n) => `c${n}`).join(', ')} : std_ulogic := '0';
  -- a phase in thousandths of a degree, 0 … 359999; a duty cycle in thousandths
  constant FBPH : integer := ((integer(CLKFBOUT_PHASE * 1000.0) mod 360000) + 360000) mod 360000;
${PLL_N.map((n) => `  constant PH${n} : integer := ((integer(CLKOUT${n}_PHASE * 1000.0) mod 360000) + 360000) mod 360000;
  constant DU${n} : integer := integer(CLKOUT${n}_DUTY_CYCLE * 1000.0);`).join('\n')}
begin
  process (CLKIN, RST)
    variable last : time := 0 ns;
    variable n : integer := 0;
  begin
    if RST = '1' then n := 0; lk <= false;
    elsif rising_edge(CLKIN) then
      if n > 0 then p <= now - last; end if;
      last := now;
      if n < ${PLL_LOCK_CYCLES} then n := n + 1; end if;
      lk <= n >= ${PLL_LOCK_CYCLES};
    end if;
  end process;
${pllOut('cfb', 1, 'DIVCLK_DIVIDE', 500, 'FBPH')}
${PLL_N.map((n) => pllOut(`c${n}`, 'CLKFBOUT_MULT', `DIVCLK_DIVIDE * CLKOUT${n}_DIVIDE`, `DU${n}`, `PH${n}`)).join('\n')}
  CLKFBOUT <= cfb;
${PLL_N.map((n) => `  CLKOUT${n} <= c${n};`).join('\n')}
  LOCKED <= '1' when lk else '0';
end silinx;`;

const BUFIO2 = `
${IEEE}
entity BUFIO2 is
  generic (DIVIDE : integer := 1; DIVIDE_BYPASS : boolean := TRUE; I_INVERT : boolean := FALSE; USE_DOUBLER : boolean := FALSE);
  port (DIVCLK, IOCLK, SERDESSTROBE : out std_ulogic; I : in std_ulogic);
end BUFIO2;
architecture silinx of BUFIO2 is
  -- (the inverted input high from the start, as on the FPGA: no rising edge at time 0, #845)
  type init_t is array (boolean) of std_ulogic;
  constant II0 : init_t := (false => '0', true => '1');
  signal ii : std_ulogic := II0(I_INVERT);
  signal dv, sb : std_ulogic := '0';
begin
  ii <= not I when I_INVERT else I;
  IOCLK <= ii;
  DIVCLK <= ii when DIVIDE_BYPASS or DIVIDE = 1 else dv;
  SERDESSTROBE <= '0' when DIVIDE_BYPASS else sb;
  process (ii)
    variable k : integer := 0;
  begin
    if rising_edge(ii) then
      if k < (DIVIDE + 1) / 2 then dv <= '1'; else dv <= '0'; end if;
      if k = DIVIDE - 1 then sb <= '1'; else sb <= '0'; end if;
      k := k + 1;
      if k >= DIVIDE then k := 0; end if;
    end if;
  end process;
end silinx;`;

/** VHDL source of the Spartan-6 primitives (joined to core/unisim.js's UNISIM_VHDL). */
export const UNISIM_S6_VHDL = [CARRY4, SRLC32E, LUTRAMS, DSP48A1, bwer('RAMB16BWER'), bwer('RAMB8BWER'), PLL_BASE, BUFIO2].join('\n');

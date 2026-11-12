// Silinx - the Gowin's multipliers (#2299): gowin-prims.js's MULT9X9, MULT18X18 and MULT36X36, as Yosys's synth_gowin maps a
// product onto them (techlibs/gowin/dsp_map.v: combinational, every register off) and Gowin's DSP user guide (UG287) describes
// them: DOUT = A × B, each operand signed when its ASIGN / BSIGN is 1; ASEL / BSEL take the shift inputs SIA / SIB in place
// of A / B, SOA / SOB the operands (after their registers); the registers on CLK's rising edge with CE, RESET clearing
// them (MULT_RESET_MODE "SYNC" on the edge, "ASYNC" at once): AREG, BREG, ASIGN_REG, BSIGN_REG (the inputs'), PIPE_REG
// (the product's), OUT_REG (the output's; MULT36X36: OUT0_REG then OUT1_REG, in turn). The other DSP cells (PADD9 / 18,
// MULTALU*, MULTADDALU18X18, ALU54D) are not modelled.
//
// Isomorphic ES module (browser + Node), no DOM.

const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';

const mult = (n) => {
  const big = n === 36;
  const v = (w) => `std_logic_vector(${w - 1} downto 0)`;
  const regs = ['AREG', 'BREG', ...(big ? ['OUT0_REG', 'OUT1_REG'] : ['OUT_REG']), 'PIPE_REG', 'ASIGN_REG', 'BSIGN_REG', ...(big ? [] : ['SOA_REG'])];
  const outs = big ? ['o0', 'o1'] : ['o0'];
  return `
${IEEE}
entity MULT${n}X${n} is
  generic (${regs.map((r) => `${r} : bit := '0'`).join('; ')}; MULT_RESET_MODE : string := "SYNC");
  port (DOUT : out ${v(2 * n)};${big ? '' : ` SOA, SOB : out ${v(n)};`}
        A, B${big ? '' : ', SIA, SIB'} : in ${v(n)} := (others => '0');
        ASIGN, BSIGN${big ? '' : ', ASEL, BSEL'}, CE, CLK, RESET : in std_ulogic := '0');
end MULT${n}X${n};
architecture silinx of MULT${n}X${n} is
  signal ai, bi, ar, br, opa, opb : ${v(n)} := (others => '0');
  signal asr, bsr, sa, sb : std_ulogic := '0';
  signal prod, pr, pv, ${outs.join(', ')} : ${v(2 * n)} := (others => '0');
begin
  ai <= ${big ? 'A' : "SIA when ASEL = '1' else A"};
  bi <= ${big ? 'B' : "SIB when BSEL = '1' else B"};
  opa <= ar when AREG = '1' else ai;
  opb <= br when BREG = '1' else bi;
  sa <= asr when ASIGN_REG = '1' else ASIGN;
  sb <= bsr when BSIGN_REG = '1' else BSIGN;
  -- (each operand one bit wider: its sign bit, or a 0)
  process (opa, opb, sa, sb)
    variable x, y : signed(${n} downto 0);
    variable p : signed(${2 * n + 1} downto 0);
  begin
    if sa = '1' then x := signed(opa(${n - 1}) & opa); else x := signed('0' & opa); end if;
    if sb = '1' then y := signed(opb(${n - 1}) & opb); else y := signed('0' & opb); end if;
    p := x * y;
    prod <= std_logic_vector(p(${2 * n - 1} downto 0));
  end process;
  pv <= pr when PIPE_REG = '1' else prod;
  process (CLK, RESET)
  begin
    if MULT_RESET_MODE = "ASYNC" and RESET = '1' then
      ar <= (others => '0'); br <= (others => '0'); asr <= '0'; bsr <= '0'; pr <= (others => '0');${outs.map((o) => ` ${o} <= (others => '0');`).join('')}
    elsif rising_edge(CLK) then
      if MULT_RESET_MODE = "SYNC" and RESET = '1' then
        ar <= (others => '0'); br <= (others => '0'); asr <= '0'; bsr <= '0'; pr <= (others => '0');${outs.map((o) => ` ${o} <= (others => '0');`).join('')}
      elsif CE = '1' then
        -- (the inputs' pins read here: a test bench may change them with the clock)
        ${big ? 'ar <= A; br <= B;' : "if ASEL = '1' then ar <= SIA; else ar <= A; end if; if BSEL = '1' then br <= SIB; else br <= B; end if;"}
        asr <= ASIGN; bsr <= BSIGN; pr <= prod;
        ${big ? "o0 <= pv; if OUT0_REG = '1' then o1 <= o0; else o1 <= pv; end if;" : 'o0 <= pv;'}
      end if;
    end if;
  end process;
${big ? `  DOUT <= o1 when OUT1_REG = '1' else o0 when OUT0_REG = '1' else pv;`
    : `  DOUT <= o0 when OUT_REG = '1' else pv;
  SOA <= opa;
  SOB <= opb;`}
end silinx;`;
};

/** VHDL source of the Gowin's multipliers (joined to gowin-prims.js's GOWIN_VHDL). */
export const GOWIN_DSP_VHDL = [9, 18, 36].map(mult).join('\n');

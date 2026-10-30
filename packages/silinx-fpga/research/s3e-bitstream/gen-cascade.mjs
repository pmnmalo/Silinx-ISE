// #2: designs with the cascades the bit database lacks, to be implemented by ISE from HDL (ise-impl.sh,
// impl-remote.sh), then measured (learn-single.mjs, ana-residual.mjs, gen-pipdrop.mjs on the routed designs):
//   srl: chains of SRLC16E, each one's Q15 into the next one's D (the cascade between slices: DIG_MUX = SHIFTIN and
//        the SHIFTOUT -> SHIFTIN switch), each chain read at a variable tap of every stage;
//   mult: chains of MULT18X18SIO, each one's BCOUT into the next one's BCIN (B_INPUT = CASCADE), as long as a column
//        of multipliers.
//   PART=xc3s250ecp132-4 node gen-cascade.mjs outdir [chains=8] [length=4] [mults=4]
import fs from 'node:fs';
import { PART } from './db.mjs';

const [out, nc = '8', len = '4', nm = '4'] = process.argv.slice(2);
const C = +nc, L = +len, M = +nm;
const head = `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;
`;
const write = (name, vhd) => { fs.mkdirSync(`${out}/${name}`, { recursive: true }); fs.writeFileSync(`${out}/${name}/top.vhd`, vhd); fs.writeFileSync(`${out}/${name}/top.ucf`, 'NET "clk" LOC = "B8" ;\n'); };

// srl: C chains of L SRLC16E (16 x L stages), the tap address from the inputs
const srl = [];
for (let c = 0; c < C; c++) for (let k = 0; k < L; k++) {
  srl.push(`  u_s${c}_${k} : SRLC16E generic map (INIT => X"${((c * 7 + k * 3) & 0xffff).toString(16).padStart(4, '0').toUpperCase()}")
    port map (D => ${k ? `cq(${c})(${k - 1})` : `d(${c % 4})`}, CE => ce, CLK => clk, A0 => a(0), A1 => a(1), A2 => a(2), A3 => a(3), Q => tq(${c})(${k}), Q15 => cq(${c})(${k}));`);
}
write('srl', `-- ${PART} srl: ${C} chains of ${L} SRLC16E, cascaded through Q15 (gen-cascade.mjs, #2)
${head}
entity top is
  port (clk : in std_logic; ce : in std_logic; d : in std_logic_vector(3 downto 0); a : in std_logic_vector(3 downto 0);
        q : out std_logic_vector(${C - 1} downto 0));
end top;

architecture rtl of top is
  type v_t is array (0 to ${C - 1}) of std_logic_vector(${L - 1} downto 0);
  signal cq, tq : v_t;
begin
${srl.join('\n')}
${Array.from({ length: C }, (_, c) => `  q(${c}) <= ${Array.from({ length: L }, (_, k) => `tq(${c})(${k})`).join(' xor ')};`).join('\n')}
end rtl;
`);

// mult: a chain of M MULT18X18SIO, B cascaded
const mult = [];
for (let k = 0; k < M; k++) {
  mult.push(`  u_m${k} : MULT18X18SIO generic map (AREG => 1, BREG => 1, PREG => 1, B_INPUT => "${k ? 'CASCADE' : 'DIRECT'}")
    port map (A => a, B => b, BCIN => ${k ? `bc(${k - 1})` : '(others => \'0\')'}, CEA => '1', CEB => '1', CEP => '1', CLK => clk, RSTA => '0', RSTB => '0', RSTP => '0',
      BCOUT => bc(${k}), P => p(${k}));`);
}
write('mult', `-- ${PART} mult: a chain of ${M} MULT18X18SIO, B cascaded through BCOUT -> BCIN (gen-cascade.mjs, #2)
${head}
entity top is
  port (clk : in std_logic; a : in std_logic_vector(17 downto 0); b : in std_logic_vector(17 downto 0);
        q : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  type p_t is array (0 to ${M - 1}) of std_logic_vector(35 downto 0);
  type b_t is array (0 to ${M - 1}) of std_logic_vector(17 downto 0);
  signal p : p_t;
  signal bc : b_t;
  signal x : std_logic_vector(35 downto 0);
begin
${mult.join('\n')}
  process (p) variable v : std_logic_vector(35 downto 0); begin v := (others => '0'); for k in p'range loop v := v xor p(k); end loop; x <= v; end process;
  q <= x(35 downto 32) & x(3 downto 0);
end rtl;
`);
console.log(`srl (${C} x ${L} SRLC16E), mult (${M} MULT18X18SIO)`);

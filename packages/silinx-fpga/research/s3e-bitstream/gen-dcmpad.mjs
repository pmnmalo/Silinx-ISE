// #92: designs whose DCMs each take CLKIN straight from a clock pad on its dedicated path (pad ->
// CLKT / CLKB or the side I/O tile -> the DCM tile's DLL_CLKPADk -> DCM_CLKIN), to be implemented by
// ISE from HDL (ise-impl.sh, impl-remote.sh), then measured with gen-pipdrop.mjs. Round r gives every
// DCM of the part its r-th pad (dcm-pads.mjs: the pads whose dedicated paths reach it, in the
// device's order), so the rounds together use every pad -> DCM path once. Each DCM: CLK0 through a
// BUFG as its feedback, a counter on it, one output bit.
//   PART=xc3s500efg320-4 node gen-dcmpad.mjs outdir      (folders r0, r1, …)
import fs from 'node:fs';
import { PART } from './db.mjs';
import { dcmPadPaths } from './dcm-pads.mjs';

const out = process.argv[2];
const byDcm = new Map();
for (const p of dcmPadPaths()) { if (!byDcm.has(p.dcm)) byDcm.set(p.dcm, []); byDcm.get(p.dcm).push(p.pad); }
const dcms = [...byDcm.keys()].sort();
const rounds = Math.max(...[...byDcm.values()].map(v => v.length));
for (let r = 0; r < rounds; r++) {
  const used = dcms.filter(d => byDcm.get(d)[r]);
  const n = used.length;
  const body = used.map((d, k) => `  u_ib${k} : IBUFG port map (I => clk(${k}), O => clkin(${k}));
  u_dcm${k} : DCM_SP
    generic map (CLKIN_PERIOD => 20.000, CLK_FEEDBACK => "1X", CLKIN_DIVIDE_BY_2 => FALSE, CLKOUT_PHASE_SHIFT => "NONE",
      DESKEW_ADJUST => "SYSTEM_SYNCHRONOUS", DFS_FREQUENCY_MODE => "LOW", DLL_FREQUENCY_MODE => "LOW",
      DUTY_CYCLE_CORRECTION => TRUE, STARTUP_WAIT => FALSE)
    port map (CLKIN => clkin(${k}), CLKFB => clk0b(${k}), RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0',
      CLK0 => clk0(${k}), LOCKED => open);
  u_bg${k} : BUFG port map (I => clk0(${k}), O => clk0b(${k}));
  process (clk0b(${k})) begin if rising_edge(clk0b(${k})) then cnt${k} <= cnt${k} + 1; end if; end process;
  q(${k}) <= cnt${k}(7);`).join('\n');
  const vhd = `-- ${PART} round ${r}: ${n} DCMs, each CLKIN from a clock pad on its dedicated path (#92)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in std_logic_vector(${n - 1} downto 0);
        q   : out std_logic_vector(${n - 1} downto 0));
end top;

architecture rtl of top is
  signal clkin, clk0, clk0b : std_logic_vector(${n - 1} downto 0);
${used.map((d, k) => `  signal cnt${k} : unsigned(7 downto 0) := (others => '0');`).join('\n')}
begin
${body}
end rtl;
`;
  const ucf = used.flatMap((d, k) => [`NET "clk<${k}>" LOC = "${byDcm.get(d)[r]}" ;`, `INST "u_dcm${k}" LOC = "${d}" ;`]).join('\n') + '\n';
  fs.mkdirSync(`${out}/r${r}`, { recursive: true });
  fs.writeFileSync(`${out}/r${r}/top.vhd`, vhd);
  fs.writeFileSync(`${out}/r${r}/top.ucf`, ucf);
  console.log(`r${r}: ${used.map(d => `${byDcm.get(d)[r]}->${d}`).join(' ')}`);
}

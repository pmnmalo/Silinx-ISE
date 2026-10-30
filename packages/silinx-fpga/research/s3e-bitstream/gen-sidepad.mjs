// #641: designs whose side clock pads (the GCLK pins of the left and right sides, in the CLK_PCI I/O tiles) each drive
// a global buffer of their side on the dedicated path (IOIS_Yk -> IOIS_Fk_B3, then the side clock tile's input),
// to be implemented by ISE from HDL (ise-impl.sh, impl-remote.sh) and measured with gen-pipdrop.mjs. The side clock pads
// are the pads whose graph reaches a side buffer (route.js bufgReach, every switch allowed); which buffer is a pad's
// dedicated one ISE's placer knows (a pad LOC'd with its buffer elsewhere is ERROR:Place:1018), so the buffers have no
// LOC: ISE gives each pad its own. A round has at most 4 pads of one side (each side has 8 buffers). Each buffer
// clocks a counter, one output bit each.
//   PART=xc3s500efg320-4 node gen-sidepad.mjs outdir      (folders s0, s1, …)
import fs from 'node:fs';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { bufgReach } from '../../src/fpga/route.js';
import { deviceSites } from '../../src/fpga/place.js';
import { PART } from './db.mjs';

const out = process.argv[2];
const dev = loadDeviceCache(PART);
const side = s => /^BUFGMUX_X[03]Y/.test(s);
const bonded = deviceSites(dev).pads;   // the package's pins
const reach = new Map();
for (const t of ['IOB', 'IBUF', 'DIFFM', 'DIFFS', 'DIFFMI', 'DIFFSI']) for (const s of dev.sites(t)) {
  if (!bonded.has(s.name)) continue;
  const b = bufgReach(dev, s.name, 'I').filter(side);
  if (b.length) reach.set(s.name, b.sort());
}
const pads = [...reach.keys()].sort();
const rounds = [];
for (const sideX of ['X0', 'X3']) {
  const of = pads.filter(p => reach.get(p).some(b => b.startsWith(`BUFGMUX_${sideX}`)));
  for (let k = 0; k < of.length; k += 4) rounds.push(of.slice(k, k + 4).map(p => [p, sideX]));
}
rounds.forEach((round, r) => {
  const n = round.length;
  const vhd = `-- ${PART} round ${r}: ${n} side clock pads, each on its own side global buffer, ISE's choice (#641)
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
  signal ci, gc : std_logic_vector(${n - 1} downto 0);
${round.map((_, k) => `  signal cnt${k} : unsigned(7 downto 0) := (others => '0');`).join('\n')}
begin
${round.map((_, k) => `  u_ib${k} : IBUFG port map (I => clk(${k}), O => ci(${k}));
  u_bg${k} : BUFG port map (I => ci(${k}), O => gc(${k}));
  process (gc(${k})) begin if rising_edge(gc(${k})) then cnt${k} <= cnt${k} + 1; end if; end process;
  q(${k}) <= cnt${k}(7);`).join('\n')}
end rtl;
`;
  const ucf = round.map(([p], k) => `NET "clk<${k}>" LOC = "${p}" ;`).join('\n') + '\n';
  fs.mkdirSync(`${out}/s${r}`, { recursive: true });
  fs.writeFileSync(`${out}/s${r}/top.vhd`, vhd);
  fs.writeFileSync(`${out}/s${r}/top.ucf`, ucf);
  console.log(`s${r}: ${round.map(([p, x]) => `${p} (${x === 'X0' ? 'left' : 'right'})`).join(' ')}`);
});

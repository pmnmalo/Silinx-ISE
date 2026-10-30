// Designs with every pad bidirectional (#96: IOBUF, the pad feature IO:<standard>, never measured), one per I/O
// standard, to be implemented by ISE from HDL (ise-impl.sh, impl-remote.sh) and compared with the writer
// (ana-iobidir.mjs). Every pad that can drive an output but the clock's is an inout port: its output from a shift
// register, its enable from another (both kept out of the IOBs), its input read (an XOR of them all feeds the shift
// register back). One pad in four with DRIVE = 4, one in four with SLEW = FAST (LVCMOS33, LVCMOS25 and LVTTL: the
// standards whose drive and slew the database has), one in four with a pull-up.
//   PART=xc3s500efg320-4 node gen-iobidir.mjs outdir [--clk B8]
// Writes outdir/rbd-<standard> (top.vhd, top.ucf) for LVCMOS33, LVCMOS25, LVTTL, LVCMOS18, LVCMOS15, LVCMOS12.
import fs from 'node:fs';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { deviceSites } from '../../src/fpga/place.js';
import { PART } from './db.mjs';

const BIDIR_STDS = ['LVCMOS33', 'LVCMOS25', 'LVTTL', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12'];
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const clkPin = opt('--clk', 'B8');
const [out] = args;
const pads = [...deviceSites(loadDeviceCache(PART)).pads.values()].sort((a, b) => (a.tile < b.tile ? -1 : a.tile > b.tile ? 1 : a.name < b.name ? -1 : 1));
const io = pads.filter(p => p.name !== clkPin && !p.inputOnly);
const n = io.length;
for (const std of BIDIR_STDS) {
  const drives = ['LVCMOS33', 'LVCMOS25', 'LVTTL'].includes(std);
  const vhd = `-- rbd-${std}: ${n} bidirectional pads (gen-iobidir.mjs)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity top is
  port (clk : in std_logic; b : inout std_logic_vector(${n - 1} downto 0));
end top;

architecture rtl of top is
  signal s, te : std_logic_vector(${n - 1} downto 0) := (0 => '1', others => '0');
  signal x : std_logic;
  attribute IOB : string;
  attribute IOB of s, te : signal is "FALSE";
begin
  x <= ${Array.from({ length: n }, (_, i) => `b(${i})`).join(' xor ')};
  process (clk) begin if rising_edge(clk) then s <= s(${n - 2} downto 0) & (s(${n - 1}) xor x); te <= s(${Math.floor(n / 2)}) & te(${n - 1} downto 1); end if; end process;
${Array.from({ length: n }, (_, i) => `  b(${i}) <= s(${i}) when te(${i}) = '0' else 'Z';`).join('\n')}
end rtl;
`;
  // (the clock's pad in the standard too: a bank's pads of one VCCO, ISE's par refuses LVCMOS25 beside LVCMOS15)
  const ucf = [`NET "clk" LOC = "${clkPin}" | IOSTANDARD = ${std} ;`, `NET "clk" CLOCK_DEDICATED_ROUTE = FALSE ;`, ...io.map((p, i) => {
    const extra = drives && i % 4 === 1 ? ' | DRIVE = 4' : drives && i % 4 === 2 ? ' | SLEW = FAST' : i % 4 === 3 ? ' | PULLUP' : '';
    return `NET "b<${i}>" LOC = "${p.name}" | IOSTANDARD = ${std}${extra} ;`;
  })];
  fs.mkdirSync(`${out}/rbd-${std}`, { recursive: true });
  fs.writeFileSync(`${out}/rbd-${std}/top.vhd`, vhd);
  fs.writeFileSync(`${out}/rbd-${std}/top.ucf`, ucf.join('\n') + '\n');
}
console.log(`${n} bidirectional pads: ${BIDIR_STDS.map(s => `rbd-${s}`).join(', ')}`);

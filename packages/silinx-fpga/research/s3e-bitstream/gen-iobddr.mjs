// Designs with an IDDR2 on every pad (#96): gen-iobreg.mjs's rd / rd2 had one on every input, but ISE's map trimmed the
// IDDR2s whose outputs the design did not read (rd's XOR read the first ~90 of them only), so the DDR input registers'
// settings were measured on part of the pads (142 of the XC3S500E's 232). Here every IDDR2's two outputs are read (an
// XOR tree into eight outputs), to be implemented by ISE from HDL (ise-impl.sh, impl-remote.sh), varied at random
// (gen-iobrand.mjs) and solved against the bit database (ana-iobreg.mjs --known).
//   PART=xc3s500efg320-4 node gen-iobddr.mjs outdir [--clk B8]
// Writes outdir/rdi0, rdi1 (every pad but the clock, two control inputs and eight outputs an IDDR2: rdi0's outputs on
// the first pads that can drive one, rdi1's on the last, so that each pad has an IDDR2 in one of them; their kinds, as
// rd's: a clock enable or not, R, S or neither, SYNC or ASYNC, INIT_Q0 / INIT_Q1, cycling through the pads); rdi2, rdi3
// (#751: an IDDR2 on one pad of each I/O tile only, the first in rdi2, the second in rdi3, the tile's other pads plain
// inputs: ISE sets some bits only when both pads of a tile have an input register). Each: top.vhd, top.ucf.
import fs from 'node:fs';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { deviceSites } from '../../src/fpga/place.js';
import { PART } from './db.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const clkPin = opt('--clk', 'B8');
const [out] = args;
const pads = [...deviceSites(loadDeviceCache(PART)).pads.values()].sort((a, b) => (a.tile < b.tile ? -1 : a.tile > b.tile ? 1 : a.name < b.name ? -1 : 1));
const rest = pads.filter(p => p.name !== clkPin), io = rest.filter(p => !p.inputOnly);
// (the index of a pad in its tile)
const nth = new Map();
for (const p of pads) nth.set(p.name, pads.filter(q => q.tile === p.tile).indexOf(p));
for (const [name, outs, k] of [['rdi0', io.slice(0, 8), -1], ['rdi1', io.slice(-8), -1], ['rdi2', io.slice(0, 8), 0], ['rdi3', io.slice(-8), 1]]) {
  const ctl = rest.filter(p => p.inputOnly && !outs.includes(p)).slice(0, 2);
  const all = rest.filter(p => !outs.includes(p) && !ctl.includes(p));
  // (rdi2 / rdi3: the IDDR2s on pad k of each tile, the others plain inputs, b)
  const ins = all.filter(p => k < 0 || nth.get(p.name) === k), plain = all.filter(p => !ins.includes(p));
  const n = ins.length, m = plain.length;
  const inst = (i) => {
    const sr = i % 3, ce = i % 2 ? "'1'" : 'ctl(0)';
    return `  u_i${i} : IDDR2 generic map (DDR_ALIGNMENT => "NONE", INIT_Q0 => '${(i >> 1) % 2}', INIT_Q1 => '${(i >> 2) % 2}', SRTYPE => ${(i >> 3) % 2 ? '"ASYNC"' : '"SYNC"'})
    port map (D => d(${i}), C0 => clkb, C1 => clkn, CE => ${ce}, R => ${sr === 0 ? 'ctl(1)' : "'0'"}, S => ${sr === 1 ? 'ctl(1)' : "'0'"}, Q0 => r0(${i}), Q1 => r1(${i}));`;
  };
  const groups = Array.from({ length: 8 }, (_, g) => Array.from({ length: n }, (_, i) => i).filter(i => i % 8 === g));
  const vhd = `-- ${name}: ${n} IDDR2, every output read (gen-iobddr.mjs)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in std_logic; ctl : in std_logic_vector(1 downto 0);
        d : in std_logic_vector(${n - 1} downto 0);${m ? ` b : in std_logic_vector(${m - 1} downto 0);` : ''} q : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  signal clkb, clkn : std_logic;
  signal r0, r1 : std_logic_vector(${n - 1} downto 0);
begin
  u_b : BUFG port map (I => clk, O => clkb);
  clkn <= not clkb;
${Array.from({ length: n }, (_, i) => inst(i)).join('\n')}
${groups.map((g, j) => `  q(${j}) <= ${[...g.map(i => `r0(${i}) xor r1(${i})`), ...Array.from({ length: m }, (_, i) => i).filter(i => i % 8 === j).map(i => `b(${i})`)].join(' xor ') || "'0'"};`).join('\n')}
end rtl;
`;
  fs.mkdirSync(`${out}/${name}`, { recursive: true });
  fs.writeFileSync(`${out}/${name}/top.vhd`, vhd);
  fs.writeFileSync(`${out}/${name}/top.ucf`, [['clk', clkPin], ...ctl.map((p, i) => [`ctl<${i}>`, p.name]), ...ins.map((p, i) => [`d<${i}>`, p.name]), ...plain.map((p, i) => [`b<${i}>`, p.name]), ...outs.map((p, i) => [`q<${i}>`, p.name])]
    .map(([nn, p]) => `NET "${nn}" LOC = "${p}" ;`).join('\n') + '\n');
}
console.log(`${pads.length} pads: rdi0-3`);

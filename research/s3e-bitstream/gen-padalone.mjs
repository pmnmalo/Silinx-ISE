// #897: an IOB register's bits on one pad alone, for bits the database gave to the wrong one of two pads that the
// earlier designs always registered together (B3 / A3: A3's R:ISR_USED:0 bit was B3's R:IREV_USED:0). For each pad
// given, two designs ISE implements from HDL (ise-impl.sh, impl-remote.sh): an IDDR2 on that pad with R (the IOB's set /
// reset, ISR_USED) and one with S (REV, IREV_USED), both flip-flops (IFF1, IFF2); the clock, the control input and the
// two outputs LOC'd far from it, every other pad unused. ana-padalone.mjs compares the bits ISE set with the database.
//   PART=xc3s500efg320-4 node gen-padalone.mjs outdir A3,B3 [--clk B8]      (outdir/<pad>-r, <pad>-s: top.vhd, top.ucf)
import fs from 'node:fs';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import { deviceSites } from '../../packages/silinx-fpga/src/fpga/place.js';
import { PART } from './db.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const clkPin = opt('--clk', 'B8');
const [out, list = ''] = args;
const pads = [...deviceSites(loadDeviceCache(PART)).pads.values()].sort((a, b) => (a.tile < b.tile ? -1 : a.tile > b.tile ? 1 : a.name < b.name ? -1 : 1));
// (the control input and the outputs: pads of the right-hand I/O tiles, far from the pads measured)
const io = pads.filter(p => !p.inputOnly && p.name !== clkPin && /^RIOIS/.test(p.tile));
const [ctl, q0, q1] = io.slice(0, 3);
for (const pad of list.split(',').filter(Boolean)) {
  if (!pads.some(p => p.name === pad)) throw new Error(`${PART}: no pad ${pad}`);
  if ([clkPin, ctl.name, q0.name, q1.name].includes(pad)) throw new Error(`${pad} is one of the designs' other pads`);
  for (const k of ['r', 's']) {
    const vhd = `-- ${PART}: an IDDR2 on ${pad} alone, its ${k === 'r' ? 'R (SR)' : 'S (REV)'} used (#897, gen-padalone.mjs)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in std_logic; ctl : in std_logic; d : in std_logic; q : out std_logic_vector(1 downto 0));
end top;

architecture rtl of top is
  signal clkb, clkn : std_logic;
begin
  u_b : BUFG port map (I => clk, O => clkb);
  clkn <= not clkb;
  u_i : IDDR2 generic map (DDR_ALIGNMENT => "NONE", INIT_Q0 => '0', INIT_Q1 => '0', SRTYPE => "SYNC")
    port map (D => d, C0 => clkb, C1 => clkn, CE => '1', R => ${k === 'r' ? 'ctl' : "'0'"}, S => ${k === 's' ? 'ctl' : "'0'"}, Q0 => q(0), Q1 => q(1));
end rtl;
`;
    fs.mkdirSync(`${out}/${pad}-${k}`, { recursive: true });
    fs.writeFileSync(`${out}/${pad}-${k}/top.vhd`, vhd);
    fs.writeFileSync(`${out}/${pad}-${k}/top.ucf`, [['clk', clkPin], ['ctl', ctl.name], ['d', pad], ['q<0>', q0.name], ['q<1>', q1.name]]
      .map(([n, p]) => `NET "${n}" LOC = "${p}" ;`).join('\n') + '\n');
  }
}
console.log(`${PART}: clock ${clkPin}, control ${ctl.name}, outputs ${q0.name} ${q1.name}`);

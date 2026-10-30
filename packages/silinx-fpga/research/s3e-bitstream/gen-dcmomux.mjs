// #2: designs that route every output of every DCM through each of its output multiplexer's lines (the DCM tile's
// DCM_<output> -> OMUXk switches, k = 10, 11, 12, 15: each line reaches one global buffer on a dedicated path), to be
// implemented by ISE from HDL (ise-impl.sh, impl-remote.sh), then measured with gen-pipdrop.mjs (measure-dcmomux.sh).
// The Clocking Wizard (#793) found DCM outputs that reach no global buffer on switches of known bits (the XC3S100E's
// top DCM: CLKDV, CLK90): the placer then took another DCM, its CLKIN through general routing.
// Each round: every DCM of the part (its CLKIN from its first clock pad on the dedicated path, dcm-pads.mjs), CLK0
// through a BUFG as its feedback and up to three other outputs, each on a BUFG LOC'd on the buffer the chosen line
// reaches (no two outputs of a design on one buffer); the pairs (output, line) whose switch is not known first,
// until every such pair is in a round. A counter on each output clock, one bit of each to an output pad.
//   PART=xc3s250ecp132-4 [DCMS=regexp] node gen-dcmomux.mjs outdir [--list]   (folders r0, r1, …; --list: the pairs only;
//   DCMS: the DCM sites to measure, e.g. the XC3S1200E's side ones: the bits are the tile type's, the same on every device)
import fs from 'node:fs';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { knownRouting } from '../../src/fpga/bitgen.js';
import { PIP_ROUTETHRU } from '../../src/fpga/device.js';
import { PART, loadDb } from './db.mjs';
import { dcmPadPaths } from './dcm-pads.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUTS = ['CLK0', 'CLK90', 'CLK180', 'CLK270', 'CLK2X', 'CLK2X180', 'CLKDV', 'CLKFX', 'CLKFX180'];
const GENERAL = /^([NSEW](2|6)(BEG|MID|END|[A-D])\d|L[HV]\d)/;
const dev = loadDeviceCache(PART);
const known = knownRouting(loadDb(PART)).allowPip;
const E = dev.routingEdges();
const bufgOfNode = new Map(dev.sites('BUFGMUX').map(s => [dev.sitePinNode(s.name, 'I0'), s.name]));

// the global buffers a node reaches on dedicated paths (no general routing, no route-throughs)
function buffersFrom(start) {
  const seen = new Set([start]), q = [start], out = [];
  for (let steps = 0; q.length && steps < 20000; steps++) {
    const n = q.shift();
    if (bufgOfNode.has(n)) { out.push(bufgOfNode.get(n)); continue; }
    for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) {
      const m = E.edgeTo[e];
      if (seen.has(m) || E.edgeFlags[e] & PIP_ROUTETHRU || GENERAL.test(dev.pipWires(E.edgeTile[e], E.edgePip[e])[1])) continue;
      seen.add(m); q.push(m);
    }
  }
  return out;
}

/** Every DCM's (output, line) pairs: [{ dcm, pin, line, tile, bufg, known }] (the line's own buffer: the first it reaches). */
export function dcmOmuxPairs() {
  const out = [];
  for (const s of dev.sites('DCM')) {
    for (const pin of OUTPUTS) {
      const n = dev.sitePinNode(s.name, pin);
      if (n < 0) continue;
      for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) {
        const [from, to] = dev.pipWires(E.edgeTile[e], E.edgePip[e]);
        if (!/^OMUX\d+$/.test(to) || E.edgeFlags[e] & PIP_ROUTETHRU) continue;
        const tile = dev.tileNames[E.edgeTile[e]];
        const [bufg] = buffersFrom(E.edgeTo[e]);
        if (bufg) out.push({ dcm: s.name, pin, line: to, tile, from, bufg, known: known(tile, from, to) });
      }
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  const pairs = dcmOmuxPairs();
  if (process.argv.includes('--list') || !out) {
    for (const p of pairs) console.log(`${p.dcm} ${p.pin} -> ${p.line} (${p.bufg})${p.known ? '' : ' UNKNOWN'}`);
    console.log(`${PART}: ${pairs.length} pairs, ${pairs.filter(p => !p.known).length} unknown`);
    process.exit(0);
  }
  const pad = new Map();
  for (const p of dcmPadPaths()) if (!pad.has(p.dcm)) pad.set(p.dcm, p.pad);
  const only = process.env.DCMS ? new RegExp(process.env.DCMS) : null;
  const dcms = [...new Set(pairs.map(p => p.dcm))].filter(d => !only || only.test(d)).sort();
  const todo = new Set(pairs.filter(p => !p.known && dcms.includes(p.dcm)));
  const rounds = [];
  while (todo.size && rounds.length < 60) {
    const used = new Set(), round = [];
    for (const d of dcms) {
      if (!pad.has(d)) continue;
      const mine = pairs.filter(p => p.dcm === d && !used.has(p.bufg));
      // CLK0 (the feedback) on each free line in turn, then up to three outputs still to measure on the other lines:
      // the choice that measures the most pairs
      let best = null;
      for (const clk0 of mine.filter(p => p.pin === 'CLK0')) {
        const pick = [clk0];
        for (const p of mine.filter(x => todo.has(x) && x.pin !== 'CLK0')) {
          if (pick.length < 4 && !pick.some(x => x.line === p.line || x.pin === p.pin || x.bufg === p.bufg)) pick.push(p);
        }
        const gain = pick.filter(p => todo.has(p)).length;
        if (!best || gain > best.gain) best = { pick, gain };
      }
      if (!best || !best.gain) continue;
      for (const p of best.pick) { todo.delete(p); used.add(p.bufg); }
      round.push({ dcm: d, pad: pad.get(d), outs: best.pick });
    }
    if (!round.length) break;   // (nothing new: the rest cannot be scheduled)
    rounds.push(round);
  }
  rounds.forEach((round, r) => {
    const n = round.length, outs = round.flatMap((d, k) => d.outs.map(p => ({ ...p, k })));
    const body = round.map((d, k) => `  u_ib${k} : IBUFG port map (I => clk(${k}), O => clkin(${k}));
  u_dcm${k} : DCM_SP
    generic map (CLKIN_PERIOD => 20.000, CLK_FEEDBACK => "1X", CLKDV_DIVIDE => 2.0, CLKFX_MULTIPLY => 2, CLKFX_DIVIDE => 1,
      CLKIN_DIVIDE_BY_2 => FALSE, CLKOUT_PHASE_SHIFT => "NONE", DESKEW_ADJUST => "SYSTEM_SYNCHRONOUS", DFS_FREQUENCY_MODE => "LOW",
      DLL_FREQUENCY_MODE => "LOW", DUTY_CYCLE_CORRECTION => TRUE, STARTUP_WAIT => FALSE)
    port map (CLKIN => clkin(${k}), CLKFB => o${k}_clk0b, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0',
${OUTPUTS.map(o => `      ${o} => ${d.outs.some(p => p.pin === o) ? `o${k}_${o.toLowerCase()}` : 'open'},`).join('\n')}
      LOCKED => open);`).join('\n');
    const bufs = outs.map(p => `  u_bg${p.k}_${p.pin.toLowerCase()} : BUFG port map (I => o${p.k}_${p.pin.toLowerCase()}, O => o${p.k}_${p.pin.toLowerCase()}b);`).join('\n');
    const cnts = outs.map((p, i) => `  process (o${p.k}_${p.pin.toLowerCase()}b) begin if rising_edge(o${p.k}_${p.pin.toLowerCase()}b) then c${i} <= c${i} + 1; end if; end process;
  q(${i}) <= c${i}(7);`).join('\n');
    const vhd = `-- ${PART} round ${r}: ${n} DCMs, each output on the global buffer of one line of its output multiplexer (#2)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in std_logic_vector(${n - 1} downto 0);
        q   : out std_logic_vector(${outs.length - 1} downto 0));
end top;

architecture rtl of top is
  signal clkin : std_logic_vector(${n - 1} downto 0);
  signal ${outs.map(p => `o${p.k}_${p.pin.toLowerCase()}, o${p.k}_${p.pin.toLowerCase()}b`).join(', ')} : std_logic;
${outs.map((p, i) => `  signal c${i} : unsigned(7 downto 0) := (others => '0');`).join('\n')}
begin
${body}
${bufs}
${cnts}
end rtl;
`;
    // (the feedback is CLK0's buffer: CLKFB => o<k>_clk0b)
    const ucf = [...round.flatMap((d, k) => [`NET "clk<${k}>" LOC = "${d.pad}" ;`, `INST "u_dcm${k}" LOC = "${d.dcm}" ;`]),
      ...outs.map(p => `INST "u_bg${p.k}_${p.pin.toLowerCase()}" LOC = "${p.bufg}" ;`)].join('\n') + '\n';
    fs.mkdirSync(`${out}/r${r}`, { recursive: true });
    fs.writeFileSync(`${out}/r${r}/top.vhd`, vhd);
    fs.writeFileSync(`${out}/r${r}/top.ucf`, ucf);
    console.log(`r${r}: ${round.map(d => `${d.dcm}[${d.outs.map(p => `${p.pin}>${p.line}${p.known ? '' : '*'}`).join(' ')}]`).join(' ')}`);
  });
  console.log(`${PART}: ${rounds.length} rounds; ${todo.size} unknown pairs left unscheduled${todo.size ? `: ${[...todo].map(p => `${p.dcm}.${p.pin}>${p.line}`).join(' ')}` : ''}`);
}

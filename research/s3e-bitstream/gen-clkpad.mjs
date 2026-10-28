// #2: the dedicated paths from the global clock pads to the top and bottom global buffers (the clock tiles' switches
// CLKT_CKIk -> CLKT_GCLKj, CLKB_CKIk -> CLKB_GCLKj: each buffer's I0 is reached from two pads), to be implemented by ISE
// from HDL (ise-impl.sh, impl-remote.sh), then measured with gen-pipdrop.mjs (measure-bramclk.sh). The database knew
// a few of them (those the designs so far happened to use), so a clock on another of these pads went to its buffer
// through general routing.
// Each round: the eight buffers, each LOC'd, its pad LOC'd on a pad whose path is not measured yet (else on the other
// one), a counter on each clock, one bit of each to an output pad the placer chooses.
//   PART=xc3s250ecp132-4 node gen-clkpad.mjs outdir [--list]   (folders c0, c1)
import fs from 'node:fs';
import { loadDeviceCache } from '../../core/fpga/device-node.js';
import { knownRouting } from '../../core/fpga/bitgen.js';
import { PIP_ROUTETHRU } from '../../core/fpga/device.js';
import { PART, loadDb } from './db.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GENERAL = /^([NSEW](2|6)(BEG|MID|END|[A-D])\d|L[HV]\d|OMUX)/;
const dev = loadDeviceCache(PART);
const db = loadDb(PART);
const known = knownRouting(db).allowPip;
const E = dev.routingEdges();

/** Every pad's dedicated path to a top or bottom buffer's I0: [{ pad, bufg, tile, from, to, known }] (the clock tile's
 *  CKIk -> GCLKj on it). */
export function clockPadPaths() {
  const bufgs = new Map(dev.sites('BUFGMUX').filter(s => /^CLK[TB]/.test(s.tileName)).map(s => [dev.sitePinNode(s.name, 'I0'), s.name]));
  const out = [];
  // (the bonded pads' sites are named by their package pins, as dcm-pads.mjs takes them)
  for (const s of ['IOB', 'IBUF', 'DIFFM', 'DIFFS', 'DIFFMI', 'DIFFSI'].flatMap(t => dev.sites(t))) {
    const pad = db.pads[s.name] ? s.name : null;
    const start = dev.sitePinNode(s.name, 'I');
    if (!pad || start < 0) continue;
    const prev = new Map([[start, null]]), q = [start];
    while (q.length) {
      const n = q.shift();
      if (bufgs.has(n)) {
        for (let x = prev.get(n); x; x = prev.get(x.n)) {
          const [from, to] = dev.pipWires(E.edgeTile[x.e], E.edgePip[x.e]);
          if (/^CLK[TB]_CKI\d$/.test(from)) { const tile = dev.tileNames[E.edgeTile[x.e]]; out.push({ pad, bufg: bufgs.get(n), tile, from, to, known: known(tile, from, to) }); break; }
        }
        continue;
      }
      for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) {
        const m = E.edgeTo[e];
        const [, to] = dev.pipWires(E.edgeTile[e], E.edgePip[e]);
        if (prev.has(m) || E.edgeFlags[e] & PIP_ROUTETHRU || GENERAL.test(to)) continue;
        prev.set(m, { n, e });
        q.push(m);
      }
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  const paths = clockPadPaths();
  if (process.argv.includes('--list') || !out) {
    for (const p of paths) console.log(`${p.pad} -> ${p.bufg}: ${p.tile} ${p.from} -> ${p.to}${p.known ? '' : ' UNKNOWN'}`);
    console.log(`${PART}: ${paths.length} paths, ${paths.filter(p => !p.known).length} unknown`);
    process.exit(0);
  }
  const bufgs = [...new Set(paths.map(p => p.bufg))].sort();
  const feat = p => `${p.tile} ${p.from}->${p.to}`;
  const todo = new Set(paths.filter(p => !p.known).map(feat));
  for (let r = 0; r < 2; r++) {
    // each buffer: a pad of a switch still to measure, else (the second round) its other pad
    const pick = bufgs.map(b => { const ps = paths.filter(p => p.bufg === b); return ps.find(p => todo.has(feat(p))) || ps[r % ps.length]; });
    for (const p of pick) todo.delete(feat(p));
    const n = pick.length;
    const vhd = `-- ${PART} round ${r}: each top / bottom global buffer from one of its clock pads, on the dedicated path (#2)
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
  signal ci, g : std_logic_vector(${n - 1} downto 0);
${pick.map((p, k) => `  signal c${k} : unsigned(7 downto 0) := (others => '0');`).join('\n')}
begin
${pick.map((p, k) => `  u_ib${k} : IBUFG port map (I => clk(${k}), O => ci(${k}));
  u_bg${k} : BUFG port map (I => ci(${k}), O => g(${k}));
  process (g(${k})) begin if rising_edge(g(${k})) then c${k} <= c${k} + 1; end if; end process;
  q(${k}) <= c${k}(7);`).join('\n')}
end rtl;
`;
    const ucf = pick.flatMap((p, k) => [`NET "clk<${k}>" LOC = "${p.pad}" ;`, `INST "u_bg${k}" LOC = "${p.bufg}" ;`]).join('\n') + '\n';
    fs.mkdirSync(`${out}/c${r}`, { recursive: true });
    fs.writeFileSync(`${out}/c${r}/top.vhd`, vhd);
    fs.writeFileSync(`${out}/c${r}/top.ucf`, ucf);
    console.log(`c${r}: ${pick.map(p => `${p.pad}>${p.bufg}${p.known ? '' : '*'}`).join(' ')}`);
  }
  console.log(`${PART}: ${todo.size} unknown switches left unscheduled${todo.size ? `: ${[...todo].join(', ')}` : ''}`);
}

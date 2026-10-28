// #2: designs that clock every block RAM's ports (CLKA, CLKB) and every multiplier's registers (CLK) from each of the
// eight global lines, to be implemented by ISE from HDL (ise-impl.sh, impl-remote.sh), then measured with
// gen-pipdrop.mjs (measure-bramclk.sh). A clock pin of a block RAM or a multiplier is reached from the global line k
// of its block-RAM interconnect tile by one switch, `GCLKk -> BRAM_CLKj` (`GCLKk_BRK` in the clock rows' tiles); the
// database knew few of them (the lines the designs so far happened to use), so the placer could not clock a block
// RAM's port B or a multiplier from most of the lines.
// The eight global buffers of the top and bottom (BUFGMUX in the CLKT / CLKB tiles) each drive one line in every
// quadrant: each design has eight clocks, each on a BUFG LOC'd on one of them (its pad through general routing:
// CLOCK_DEDICATED_ROUTE = FALSE), and gives every block RAM's ports (or, in the multipliers' designs, every
// multiplier) the line not measured yet for that switch, until each switch is in a design.
// --repeat N: the whole schedule N times, each switch on other sites the next time (a switch then measured in more
// tiles, which pips-to-db.mjs checks against each other).
//   PART=xc3s250ecp132-4 node gen-bramclk.mjs outdir [--list] [--repeat 2]   (folders r0, r1, …: block RAMs; m0, m1, …:
//   multipliers)
import fs from 'node:fs';
import { loadDeviceCache } from '../../core/fpga/device-node.js';
import { knownRouting, tileOf } from '../../core/fpga/bitgen.js';
import { PIP_ROUTETHRU } from '../../core/fpga/device.js';
import { PART, loadDb } from './db.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GENERAL = /^([NSEW](2|6)(BEG|MID|END|[A-D])\d|L[HV]\d|OMUX)/;
const dev = loadDeviceCache(PART);
const db = loadDb(PART);
const known = knownRouting(db).allowPip;
const E = dev.routingEdges();
const PINS = { RAMB16: ['CLKA', 'CLKB'], MULT18X18SIO: ['CLK'] };

// the clock pins a global buffer reaches on dedicated paths, each with the switch into its block-RAM interconnect tile's
// BRAM_CLKj: Map(node of the pin -> { tile, from, to })
function reach(bufg) {
  const start = dev.sitePinNode(bufg, 'O');
  const prev = new Map([[start, null]]), q = [start];
  while (q.length) {
    const n = q.shift();
    for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) {
      const m = E.edgeTo[e];
      const [, to] = dev.pipWires(E.edgeTile[e], E.edgePip[e]);
      if (prev.has(m) || E.edgeFlags[e] & PIP_ROUTETHRU || GENERAL.test(to)) continue;
      prev.set(m, { n, e });
      q.push(m);
    }
  }
  return { prev, pip: e => { const [from, to] = dev.pipWires(E.edgeTile[e], E.edgePip[e]); return { tile: dev.tileNames[E.edgeTile[e]], from, to }; } };
}

/** Every clock pin of the block RAMs and multipliers with, per top / bottom global buffer, the switch from its line:
 *  [{ site, type, pin, bufg, tile, ttype, from, to, known }]. */
export function bramClockPairs() {
  const bufgs = dev.sites('BUFGMUX').filter(s => /^CLK[TB]/.test(s.tileName)).map(s => s.name).sort();
  const out = [];
  for (const bufg of bufgs) {
    const r = reach(bufg);
    for (const [type, pins] of Object.entries(PINS)) for (const s of dev.sites(type)) for (const pin of pins) {
      // back from the pin to the switch into a BRAM_CLKj
      let x = r.prev.get(dev.sitePinNode(s.name, pin));
      for (; x; x = r.prev.get(x.n)) {
        const p = r.pip(x.e);
        if (/^BRAM_CLK\d$/.test(p.to)) { out.push({ site: s.name, type, pin, bufg, ...p, ttype: tileOf(p.tile, db)?.type, known: known(p.tile, p.from, p.to) }); break; }
      }
    }
  }
  return { bufgs, pairs: out };
}

// the design of one round: every site's pins on the buffers given (pick: Map(site -> { pin: bufg }))
function design(kind, bufgs, sites, pick, r) {
  const n = bufgs.length;
  const ram = kind === 'RAMB16';
  const insts = sites.map((s, i) => {
    const p = pick.get(s);
    const c = pin => `g(${bufgs.indexOf(p[pin])})`;
    return ram
      ? `  u${i} : RAMB16_S18_S18
    generic map (INIT_00 => X"${(i + 1).toString(16).padStart(64, '0')}")
    port map (CLKA => ${c('CLKA')}, CLKB => ${c('CLKB')}, ENA => '1', ENB => '1', WEA => d(0), WEB => d(1), SSRA => '0', SSRB => '0',
      ADDRA => aa, ADDRB => ab, DIA => dd, DIB => dd, DIPA => d2, DIPB => d2,
      DOA => da(${i}), DOB => db(${i}), DOPA => open, DOPB => open);`
      : `  u${i} : MULT18X18SIO
    generic map (AREG => 1, BREG => 1, PREG => 1, B_INPUT => "DIRECT")
    port map (CLK => ${c('CLK')}, CEA => '1', CEB => '1', CEP => '1', RSTA => '0', RSTB => '0', RSTP => '0',
      A => ma, B => mb, BCIN => z18, P => pp(${i}), BCOUT => open);`;
  });
  const outs = ram ? sites.map((s, i) => `da(${i})(${i % 16}) xor db(${i})(${(i + 5) % 16})`) : sites.map((s, i) => `pp(${i})(${i % 36})`);
  const vhd = `-- ${PART} ${kind === 'RAMB16' ? 'block RAMs' : 'multipliers'}, round ${r}: each clock pin on the global line of a switch not measured yet (#2)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in std_logic_vector(${n - 1} downto 0);
        d   : in std_logic_vector(7 downto 0);
        q   : out std_logic_vector(${sites.length - 1} downto 0));
end top;

architecture rtl of top is
  signal g : std_logic_vector(${n - 1} downto 0);
  -- (the port maps take signals only, VHDL-93: the inputs as signals of their own)
${ram ? `  signal aa, ab : std_logic_vector(9 downto 0);
  signal dd : std_logic_vector(15 downto 0);
  signal d2 : std_logic_vector(1 downto 0);
  type w16 is array (0 to ${sites.length - 1}) of std_logic_vector(15 downto 0);
  signal da, db : w16;` : `  type w36 is array (0 to ${sites.length - 1}) of std_logic_vector(35 downto 0);
  signal pp : w36;
  signal ma, mb, z18 : std_logic_vector(17 downto 0);`}
begin
${ram ? `  aa <= d & d(1 downto 0); ab <= d(1 downto 0) & d; dd <= d & d; d2 <= d(1 downto 0);` : `  ma <= d & d & d(1 downto 0); mb <= d(1 downto 0) & d & d; z18 <= (others => '0');`}
${bufgs.map((b, k) => `  u_bg${k} : BUFG port map (I => clk(${k}), O => g(${k}));`).join('\n')}
${insts.join('\n')}
${outs.map((o, i) => `  q(${i}) <= ${o};`).join('\n')}
end rtl;
`;
  const ucf = [...bufgs.flatMap((b, k) => [`INST "u_bg${k}" LOC = "${b}" ;`, `NET "clk<${k}>" CLOCK_DEDICATED_ROUTE = FALSE ;`]),
    ...sites.map((s, i) => `INST "u${i}" LOC = "${s}" ;`)].join('\n') + '\n';
  return { vhd, ucf };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  const { bufgs, pairs } = bramClockPairs();
  // a switch (tile type, from -> to) is measured once it is in a design; the pairs that use it
  const feat = p => `${p.ttype} ${p.from}->${p.to}`;
  const unknown = new Set(pairs.filter(p => !p.known).map(feat));
  if (process.argv.includes('--list') || !out) {
    const all = new Set(pairs.map(feat));
    for (const f of [...all].sort()) console.log(`${f}${unknown.has(f) ? ' UNKNOWN' : ''}`);
    console.log(`${PART}: ${pairs.length} (pin, buffer) pairs, ${all.size} switches, ${unknown.size} unknown`);
    process.exit(0);
  }
  const ri = process.argv.indexOf('--repeat'), repeat = ri > 0 ? +process.argv[ri + 1] : 1;
  for (const [type, prefix] of [['RAMB16', 'r'], ['MULT18X18SIO', 'm']]) {
    const all = [...new Set(pairs.filter(p => p.type === type).map(p => p.site))].sort();
    const unknownHere = [...unknown].filter(f => pairs.some(p => p.type === type && feat(p) === f));
    let r = 0, todo = new Set();
    for (let rep = 0; rep < repeat; rep++) {
      // (each repeat: the sites in another order, so that a switch goes to another site)
      const sites = all.map((s, i) => all[(i + rep * 5) % all.length]);
      todo = new Set(unknownHere);
      for (let k = 0; todo.size && k < 16; k++) {
        const pick = new Map();
        let gain = 0;
        sites.forEach((s, i) => {
          const p = {};
          for (const pin of PINS[type]) {
            const opts = pairs.filter(x => x.site === s && x.pin === pin);
            // the line of a switch still to measure, else the next line in turn
            const best = opts.find(x => todo.has(feat(x))) || opts[(i + k) % opts.length];
            if (todo.delete(feat(best))) gain++;
            p[pin] = best.bufg;
          }
          pick.set(s, p);
        });
        if (!gain) break;
        const { vhd, ucf } = design(type, bufgs, sites, pick, r);
        fs.mkdirSync(`${out}/${prefix}${r}`, { recursive: true });
        fs.writeFileSync(`${out}/${prefix}${r}/top.vhd`, vhd);
        fs.writeFileSync(`${out}/${prefix}${r}/top.ucf`, ucf);
        console.log(`${prefix}${r}: ${sites.length} ${type}, ${gain} switches not measured before`);
        r++;
      }
    }
    if (todo.size) console.log(`${type}: ${todo.size} switches left unscheduled: ${[...todo].join(', ')}`);
  }
}

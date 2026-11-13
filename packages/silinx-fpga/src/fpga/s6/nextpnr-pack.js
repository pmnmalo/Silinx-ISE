// Silinx toolchain - the Spartan-6's Map by nextpnr (#3138; the plan: #2131): Yosys's netlist handed to the fork's spartan6
// micro-architecture (pmnmalo/nextpnr-spartan, its packer #3135 and its pads' and clocks' rules #3136), which packs it
// into the sites Silinx's Map would (fpga/s6/pack.js, phys.js: the same sites and site pins, the fork's packer a port of
// them) and places them; Silinx reads its placement back by those sites, then routes and writes the settings as before.
//
//   sortedNetlistText(text) -> the netlist with its cells by name (nextpnr's order: both packers then name one site alike)
//   packInput(text, phys, device) -> Yosys's netlist for the fork, each I/O buffer with its port and the port's constraints,
//                             each BSCAN with the BEL of its JTAG chain's site (#3766)
//   packedSites(json)       -> the fork's sites { name: type } (its cells after packing)
//   samePacking(json, phys) -> the differences of the fork's sites from Silinx's Map's ([] when they are the same)

import { siteBel } from './nextpnr.js';

const topModule = j => Object.values(j.modules).find(m => m.attributes?.top) ?? Object.values(j.modules)[0];
const byName = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);

/** The netlist's text with each module's cells by name: Silinx's Map then reads them in the order the fork's packer does. */
export function sortedNetlistText(text) {
  const j = JSON.parse(text);
  for (const m of Object.values(j.modules)) if (m.cells) m.cells = Object.fromEntries(Object.entries(m.cells).sort(byName));
  return JSON.stringify(j);
}

/**
 * Yosys's netlist (sortedNetlistText's) as the fork's packer reads it: each I/O buffer of phys (physS6's, of the same
 * netlist) with its port bit (PORT) and that port's constraints (LOC, IOSTANDARD, DRIVE, SLEW, PULL); with the device,
 * each BSCAN_SPARTAN6 with its BEL, the site of its JTAG chain (BSCAN_X0Y<chain - 1>: the site decides the chain, #3766;
 * nextpnr-spartan6 0.5.1 keeps it).
 */
export function packInput(text, phys, device = null) {
  const j = JSON.parse(text);
  const mod = topModule(j);
  const keys = Object.keys(mod.cells);
  for (const inst of phys.insts) {
    if (inst.kind === 'bscan' && device) {
      const c = mod.cells[keys[inst.cell]];
      c.attributes = { ...c.attributes, BEL: siteBel(device, `BSCAN_X0Y${(inst.chain ?? 1) - 1}`) };
    }
    if (inst.kind !== 'iob') continue;
    const c = mod.cells[keys[inst.cell]], a = inst.cons || {};
    c.attributes = { ...c.attributes, PORT: inst.port, ...(inst.loc ? { LOC: inst.loc } : {}), ...(a.iostandard ? { IOSTANDARD: a.iostandard } : {}),
      ...(a.drive ? { DRIVE: String(a.drive) } : {}), ...(a.slew ? { SLEW: a.slew } : {}), ...(a.pull ? { PULL: a.pull } : {}) };
  }
  return j;
}

// a site type as Silinx's Map names it (an IOB: IOB, whichever of the pair it takes)
const siteType = t => (/^IOB[MS]?$/.test(t) ? 'IOB' : t === 'BUFGMUX' ? 'BUFG' : t);

/** The sites of the fork's packed (and placed) design: { cell name: its site type }. */
export function packedSites(json) {
  const out = {};
  for (const [name, c] of Object.entries(topModule(json).cells)) out[name] = siteType(c.type);
  return out;
}

/** How the fork's packing differs from Silinx's Map (phys): its sites missing, extra, or of another type; [] when the same. */
export function samePacking(json, phys) {
  const fork = packedSites(json), problems = [];
  const ours = new Map(phys.insts.map(i => [i.name, siteType(i.type)]));
  for (const [name, t] of ours) {
    if (!(name in fork)) problems.push(`${name}: not packed by nextpnr`);
    else if (fork[name] !== t) problems.push(`${name}: a ${fork[name]} in nextpnr, a ${t} in Silinx's Map`);
  }
  for (const name of Object.keys(fork)) if (!ours.has(name)) problems.push(`${name}: packed by nextpnr only`);
  return problems;
}

// Silinx toolchain - the open flow's Map and Place & Route by nextpnr (#2136; the plan: #2131). Chosen by
// spec.engine === 'nextpnr'; the Spartan-3E's own steps in open-flow-core.js otherwise.
// - nextpnr-himbaechel with the spartan3e micro-architecture (the fork pmnmalo/nextpnr-spartan, its WebAssembly package
//   through io.nextpnr) packs, places and routes Yosys's netlist.
// - Its routed design becomes XDL (fpga/nextpnr-xdl.js), which the timing, the pins and the bitstream read as they
//   read Silinx's own.
// - For now the micro-architecture knows LUTs, flip-flops, carry chains, constants, IOBs and global clock buffers
//   (#2135): a netlist with other cells fails at Map, naming them.
import { parseUcf } from './ucf.js';
import { parseXdl, writeXdl } from './xdl.js';
import { checkRouting } from './fpga/route.js';
import { deviceSites } from './fpga/place.js';
import { nextpnrToXdl, xdlSize } from './fpga/nextpnr-xdl.js';

/** The netlist's cells the spartan3e micro-architecture packs (its spartan3e.cc pack()): LUTs, INV, the flip-flops of
 *  the rising edge (FD, FDE, FDR, FDRE, FDS, FDSE, FDC, FDCE, FDP, FDPE), the carry chains (MUXCY, XORCY), the
 *  constants (GND, VCC), the I/O buffers and BUFG. */
export const NEXTPNR_CELL = /^(LUT[1-4]|INV|FD[RSCP]?E?|MUXCY|XORCY|GND|VCC|IBUF|OBUF|BUFG)$/;

/**
 * The netlist for nextpnr: each port bit's pad (its LOC in the UCF) on the I/O buffer at that bit, the IBUF or OBUF the
 * synthesis put there (nextpnr gives a port's own attributes to none of its cells; the micro-architecture places an
 * I/O buffer at its LOC). Returns { json, problems }: the cells the micro-architecture does not have, ports without
 * a pad. (The constants: the micro-architecture's, #2135.)
 */
export function nextpnrNetlist(text, top, ucfText) {
  const json = JSON.parse(text);
  const [name, mod] = Object.entries(json.modules).find(([, m]) => m.attributes?.top) || [top, json.modules[top]];
  const problems = [];
  const types = new Map();
  for (const c of Object.values(mod.cells)) if (!NEXTPNR_CELL.test(c.type)) types.set(c.type, (types.get(c.type) || 0) + 1);
  for (const [t, n] of types) problems.push(`${n} cell(s) ${t}: not in the spartan3e micro-architecture yet`);
  // each port bit's pad on its I/O buffer
  let locs = {};
  try { if (ucfText) locs = parseUcf(ucfText).assignments || {}; } catch { /* checked by translate */ }
  const loc = n => Object.entries(locs).find(([k, a]) => a.loc && k.toLowerCase() === n.toLowerCase())?.[1].loc;
  const buffers = new Map();   // port bit -> its IBUF / OBUF
  for (const c of Object.values(mod.cells)) {
    if (c.type === 'IBUF') buffers.set(c.connections.I?.[0], c);
    if (c.type === 'OBUF') buffers.set(c.connections.O?.[0], c);
  }
  for (const [p, d] of Object.entries(mod.ports)) {
    d.bits.forEach((b, i) => {
      const bit = d.bits.length > 1 ? `${p}<${i}>` : p;
      const pad = loc(bit) || (d.bits.length === 1 ? loc(`${p}<0>`) : null);
      const buffer = buffers.get(b);
      if (!pad) problems.push(`port ${bit}: no LOC in the constraints (the nextpnr engine places only the ports given a pad)`);
      else if (!buffer) problems.push(`port ${bit}: no I/O buffer (IBUF / OBUF) on it`);
      else buffer.attributes = { ...buffer.attributes, LOC: pad };
    });
  }
  json.modules = { [name]: mod };
  return { json, problems };
}

/**
 * { runMap, runPar } of runFlow for the nextpnr engine. ctx: { io, spec, log, report, util, now, ms, netlistText (a
 * getter: the synthesis's JSON), top, ucfText, StepError, setRouted (the routed design's text, for the reports and
 * the bitstream) }. io.nextpnr: { run(args, files, onLine) -> files, chipdb(part) -> Uint8Array }.
 */
export function mountNextpnrSteps(ctx) {
  const { io, spec, log, report, util, now, ms, netlistText, top, ucfText, StepError, setRouted } = ctx;
  let input = null;
  const part = `${spec.device}${spec.pkg}`;

  function runMap() {
    if (spec.family !== 'spartan3e') throw new StepError(`the nextpnr engine places the Spartan-3E only (#2131), not the ${spec.family}`, [], 'Choose the Silinx engine (Toolchain Settings).');
    if (!io.nextpnr) throw new StepError('the nextpnr engine is not available here (io.nextpnr)', [], 'Choose the Silinx engine (Toolchain Settings).');
    const r = nextpnrNetlist(netlistText(), top, ucfText);
    if (r.problems.length) {
      throw new StepError(`the nextpnr engine cannot implement this design yet: ${r.problems.length} problem(s)`, r.problems.slice(0, 50),
        'Choose the Silinx engine (Toolchain Settings): nextpnr\'s Spartan-3E is growing (#2135).');
    }
    input = JSON.stringify(r.json);
    log('Map: nextpnr packs the design itself, at Place & Route (the nextpnr engine).');
  }

  async function runPar() {
    if (!input) runMap();
    const t = now();
    const db = await io.nextpnr.chipdb(part);
    // the tightest PERIOD constraint as nextpnr's target (each clock's met or not: the timing step's)
    let mhz = null;
    try { const c = ucfText ? parseUcf(ucfText).clocks || [] : []; if (c.length) mhz = 1000 / Math.min(...c.map(x => x.period)); } catch { /* translate's */ }
    const args = ['--device', part, '--chipdb', 'chipdb.bin', '--json', 'design.json', '--write', 'routed.json', '--seed', String(spec.seed || 1),
      ...(mhz ? ['--freq', mhz.toFixed(3)] : []), '--timing-allow-fail'];
    const lines = [];
    let files;
    try {
      files = await io.nextpnr.run(args, { 'design.json': input, 'chipdb.bin': db }, l => {
        lines.push(l);
        if (/^ERROR:/.test(l)) log(`ERROR:nextpnr - ${l.replace(/^ERROR:\s*/, '')}`);
        else if (/^Warning:/.test(l)) log(`WARNING:nextpnr - ${l.replace(/^Warning:\s*/, '')}`);
      });
    } catch (e) {
      throw new StepError(`nextpnr failed: ${e.message}`, lines.filter(l => /^ERROR:/.test(l)).slice(0, 20));
    }
    const routedJson = files?.['routed.json'];
    if (!routedJson) throw new StepError('nextpnr wrote no routed design', lines.filter(l => /^ERROR:/.test(l)).slice(0, 20));
    const fmax = lines.map(l => /Max frequency for clock '(.*)': ([0-9.]+) MHz/.exec(l)).filter(Boolean).at(-1);
    log(`Placed and routed by nextpnr in ${ms(t)}${fmax ? ` (its estimate: ${fmax[2]} MHz)` : ''}.`);
    const json = typeof routedJson === 'string' ? routedJson : new TextDecoder().decode(routedJson);
    let design;
    try { design = nextpnrToXdl(JSON.parse(json), io.device(), io.device().part); } catch (e) { throw new StepError(`nextpnr's routed design cannot be read: ${e.message}`); }
    const text = writeXdl(design);
    report.files.routed = io.write('open/routed.xdl', text);
    const check = checkRouting(parseXdl(text), io.device());
    if (!check.ok) throw new StepError('the routing check failed', check.problems.slice(0, 50));
    setRouted(text);
    mapReport(design);
    const pips = design.nets.reduce((n, x) => n + x.pips.length, 0);
    report.par = { routed: true, unroutedSignals: 0, nets: design.nets.length, pips, iterations: null, done: true, engine: 'nextpnr' };
    log(`Routed ${design.nets.length} nets (${pips} PIPs): ${report.files.routed}`);
    log('All signals are completely routed.');
  }

  // the Design Summary's map section, from the routed design (nextpnr packs at Place & Route)
  function mapReport(design) {
    const s = xdlSize(design), sites = deviceSites(io.device());
    const count = t => design.insts.filter(i => t.test(i.type)).length;
    const rows = [['ffs', 'Number of Slice Flip Flops', s.ffs, 2 * sites.slices.size], ['luts', 'Number of 4 input LUTs', s.luts, 2 * sites.slices.size],
      ['slices', 'Number of occupied Slices', s.slices, sites.slices.size], ['iob', 'Number of bonded IOBs', count(/^(IOB|IBUF)$/), sites.pads.size],
      ['bufgmux', 'Number of BUFGMUXs', count(/^BUFGMUX$/), sites.bufgmux.length]];
    const items = rows.map(([id, name, used, total]) => ({ id, ...util(name, used, total) }));
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    report.map = { utilization: items, summary: { slices: byId.slices, ffs: byId.ffs, luts: byId.luts, iobs: byId.iob, bufg: byId.bufgmux }, warnings: 0, errors: 0, engine: 'nextpnr' };
    log('Design summary (nextpnr):');
    for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
  }

  return { runMap, runPar };
}

// Silinx toolchain - the open flow's Map and Place & Route by nextpnr (#2136; the plan: #2131). Chosen by
// spec.engine === 'nextpnr'; the Spartan-3E's own steps in open-flow-core.js otherwise.
// - nextpnr-himbaechel with the spartan3e micro-architecture (the fork pmnmalo/nextpnr-spartan, its WebAssembly package
//   through io.nextpnr) packs, places and routes Yosys's netlist.
// - Its routed design becomes XDL (fpga/nextpnr-xdl.js), which the timing, the pins and the bitstream read as they
//   read Silinx's own.
// - For now the micro-architecture knows LUTs, flip-flops, carry chains, wide multiplexers, constants, IOBs with their
//   registers, global clock buffers, block RAMs and multipliers (#2135): a netlist with other cells fails at Map, naming them.
import { UCF, readConstraints } from './constraints.js';
import { portAssignments, ucfPattern } from './ucf.js';
export { engineOf } from './open-steps.js';
import { parseXdl, writeXdl } from './xdl.js';
import { checkRouting } from './fpga/route.js';
import { deviceSites } from './fpga/place.js';
import { analyzeTiming } from './fpga/timing.js';
import { nextpnrToXdl, xdlSize } from './fpga/nextpnr-xdl.js';
import { dcmPeriodFactor, dcmSettings } from './fpga/nextpnr-dcm.js';
import { parityToData } from './fpga/pack-bram.js';
import { BRAM_TYPE, MULT_TYPE } from './fpga/pack.js';

/** The netlist's cells the spartan3e micro-architecture packs (its spartan3e.cc pack()): LUTs, INV, the flip-flops of
 *  the rising edge (FD, FDE, FDR, FDRE, FDS, FDSE, FDC, FDCE, FDP, FDPE), the carry chains (MUXCY, XORCY), the wide
 *  multiplexers, the constants (GND, VCC), the I/O buffers, the IOBs' DDR registers (IDDR2, ODDR2), BUFG, the DCMs, the block RAMs,
 *  the multipliers (not chained), the distributed RAMs and the shift registers. */
export const NEXTPNR_CELL = /^(LUT[1-4]|INV|FD[RSCP]?E?|MUXCY|XORCY|MUXF[5-8]|GND|VCC|IBUF|IBUFG|OBUF|OBUFT|IOBUF|IDDR2|ODDR2|BUFG|DCM|DCM_SP|RAMB16_S(1|2|4|9|18|36)(_S(1|2|4|9|18|36))?|MULT18X18(S|SIO)?|RAM16X1[SD]|RAM32X1S|SRLC?16E?(_1)?)$/;

/**
 * The netlist for nextpnr: each port bit's pad (its LOC in the UCF) on the I/O buffer at that bit, the IBUF or OBUF the
 * synthesis put there (nextpnr gives a port's own attributes to none of its cells; the micro-architecture places an
 * I/O buffer at its LOC). The UCF's IOB = TRUE / FALSE as the attribute IOB, the micro-architecture's question: NET on the
 * port bit's buffer, INST on the cell; INST LOC on a DCM as its BEL (device: the device's graph, for the site's place). Returns { json, problems }: the cells the micro-architecture does not have, ports without
 * a pad; and sdc, the PERIODs as nextpnr's clock constraints. An input nothing reads is left out, as Silinx's packer does.
 * (The constants: the micro-architecture's, #2135.)
 */
export function nextpnrNetlist(text, top, ucf, device = null) {
  const json = JSON.parse(text);
  const [name, mod] = Object.entries(json.modules).find(([, m]) => m.attributes?.top) || [top, json.modules[top]];
  const problems = [];
  const types = new Map();
  for (const c of Object.values(mod.cells)) if (!NEXTPNR_CELL.test(c.type)) types.set(c.type, (types.get(c.type) || 0) + 1);
  for (const [t, n] of types) problems.push(`${n} cell(s) ${t}: not in the spartan3e micro-architecture yet`);
  hardInputs(mod);
  // each port bit's pad on its I/O buffer
  let parsed = { assignments: {}, clocks: [], other: [] };
  parsed = (typeof ucf === 'string' ? readConstraints(UCF, ucf) : ucf) || parsed;
  const { other = [] } = parsed;
  // INST "name" LOC = "DCM_X0Y1": a DCM's site, its BEL in the chip database (X<col>Y<row>/S<site index>_DCM)
  for (const st of other) {
    const m = /^INST\s+"?([^"\s]+)"?\s+LOC\s*=\s*"?([^"\s;]+)"?\s*$/i.exec(String(st).trim());
    const c = m && mod.cells[m[1]];
    if (!c || !/^DCM(_SP)?$/.test(c.type) || !device) continue;
    const s = device.site(m[2].toUpperCase());
    if (s?.type !== 'DCM') { problems.push(`INST ${m[1]}: LOC ${m[2]} is not a DCM site of this device`); continue; }
    c.attributes = { ...c.attributes, BEL: `X${device.tileCol[s.tile]}Y${device.tileRow[s.tile]}/S${s.index}_DCM` };
  }
  const iobAsked = [];   // [NET / INST, name pattern, TRUE / FALSE]: the last that matches
  for (const st of other) {
    const m = /^(NET|INST)\s+"?([^"\s]+)"?\s+IOB\s*=\s*"?(TRUE|FALSE|FORCE)"?\s*$/i.exec(String(st).trim());
    if (m) iobAsked.push([m[1].toUpperCase(), ucfPattern(m[2]), /^FALSE$/i.test(m[3]) ? 'FALSE' : 'TRUE']);
  }
  const asked = (kind, name) => { let v; for (const [k, re, x] of iobAsked) if (k === kind && re.test(name)) v = x; return v; };
  for (const [n, c] of Object.entries(mod.cells)) { const a = asked('INST', n); if (a) c.attributes = { ...c.attributes, IOB: a }; }
  // the constraints of each port bit, a NET name with wildcards on every bit it matches, as Silinx's packer reads them
  const bitName = (p, d, i) => (d.bits.length > 1 ? `${p}<${i}>` : p);
  const names = Object.entries(mod.ports).flatMap(([p, d]) => d.bits.map((_, i) => bitName(p, d, i)));
  const cons = portAssignments(parsed, names).assignments;
  const consOf = n => cons[n] || Object.entries(cons).find(([k]) => k.toLowerCase() === n.toLowerCase())?.[1];
  const read = new Set();   // the nets some cell reads
  for (const c of Object.values(mod.cells)) for (const [p, b] of Object.entries(c.connections || {})) if (c.port_directions?.[p] === 'input') read.add(b[0]);
  const buffers = new Map();   // port bit -> its IBUF / OBUF
  for (const c of Object.values(mod.cells)) {
    if (c.type === 'IBUF' || c.type === 'IBUFG') buffers.set(c.connections.I?.[0], c);
    if (c.type === 'OBUF' || c.type === 'OBUFT') buffers.set(c.connections.O?.[0], c);
    if (c.type === 'IOBUF') buffers.set(c.connections.IO?.[0], c);
  }
  for (const [p, d] of Object.entries(mod.ports)) {
    d.bits.forEach((b, i) => {
      const bit = bitName(p, d, i);
      const buffer = buffers.get(b);
      // an input nothing reads gets no pad, as ISE's map trims it (ISE's DRC calls its buffer's output a dangling pin)
      if (/^IBUFG?$/.test(buffer?.type) && !read.has(buffer.connections.O?.[0])) {
        delete mod.cells[Object.keys(mod.cells).find(k => mod.cells[k] === buffer)];
        d.bits[i] = 'x';
        return;
      }
      // a one-bit bus ([0:0], std_logic_vector(0 downto 0)) also as p<0>, as XST names it; not a scalar (#2199, #2232)
      const oneBitBus = d.bits.length === 1 && d.offset === undefined && !d.upto && mod.netnames?.[p]?.attributes?.single_bit_vector !== undefined;
      const a = { ...(oneBitBus ? consOf(`${p}<0>`) : null), ...consOf(bit) };
      if (!a.loc) problems.push(`port ${bit}: no LOC in the constraints (the nextpnr engine places only the ports given a pad)`);
      else if (!buffer) problems.push(`port ${bit}: no I/O buffer (IBUF / OBUF) on it`);
      else {
        const iob = asked('NET', bit);
        // (the converter to XDL writes the IOB's settings from them: they stay on the cell in the routed design)
        buffer.attributes = { ...buffer.attributes, LOC: a.loc, ...(iob ? { IOB: iob } : {}), ...(a.iostandard ? { IOSTANDARD: a.iostandard } : {}),
          ...(a.drive ? { DRIVE: String(a.drive) } : {}), ...(a.slew ? { SLEW: a.slew } : {}), ...(a.pull ? { PULL: a.pull } : {}) };
      }
    });
  }
  // a PERIOD per clock as nextpnr's targets: on the port's clock net as the flip-flops see it, after its global buffer
  const netNameOf = b => Object.entries(mod.netnames).find(([, n]) => n.bits[0] === b && n.bits.length === 1)?.[0]
    ?? Object.entries(mod.netnames).find(([, n]) => n.bits.includes(b))?.[0];
  const clockNets = [];
  // a clock net as the flip-flops see it: after its global buffers, through a DCM's outputs with their periods
  const follow = (net, period, depth = 0) => {
    const users = port => Object.values(mod.cells).filter(c => c.connections?.[port]?.[0] === net);
    const bufgs = users('I').filter(c => c.type === 'BUFG');
    for (const c of bufgs) follow(c.connections.O[0], period, depth + 1);
    if (!bufgs.length || users('I').some(c => c.type !== 'BUFG')) clockNets.push([netNameOf(net), period]);
    if (depth > 8) return;
    for (const c of users('CLKIN').filter(x => /^DCM(_SP)?$/.test(x.type))) {
      const d = dcmSettings(c.parameters);
      for (const [pin, bits] of Object.entries(c.connections)) {
        const f = dcmPeriodFactor(d, pin);
        if (f !== null && bits[0] !== undefined && Object.values(mod.cells).some(u => u.type === 'BUFG' && u.connections.I?.[0] === bits[0])) follow(bits[0], +(period * f).toFixed(6), depth + 1);
      }
    }
  };
  for (const k of parsed.clocks || []) {
    for (const [p, d] of Object.entries(mod.ports)) {
      d.bits.forEach((b, i) => {
        if (bitName(p, d, i).toLowerCase() === String(k.net).toLowerCase() && /^IBUFG?$/.test(buffers.get(b)?.type)) follow(buffers.get(b).connections.O[0], k.period);
      });
    }
  }
  const sdc = clockNets.filter(([n]) => n).map(([n, period]) => `create_clock -period ${period} [get_nets {${n}}]\n`).join('');
  json.modules = { [name]: mod };
  return { json, problems, sdc };
}

/**
 * The block RAMs' and multipliers' inputs as Silinx's packer leaves them (#2135), which ISE's DRC wants: a block RAM's
 * parity bit written and not read moved to a free data bit (pack-bram.js parityToData); the data inputs of a port never
 * written (WE at 0, its data constant or undriven) left unconnected; the other undriven inputs (x) at 0. In place.
 */
export function hardInputs(mod) {
  // Silinx's netlist view of the module (fpga/netlist.js): nets 0 and 1 the constants, a net per bit
  const nets = [{ const: 0, loads: [] }, { const: 1, loads: [] }], netOf = new Map();
  const net = b => { if (!netOf.has(b)) { netOf.set(b, nets.length); nets.push({ loads: [], driver: null }); } return netOf.get(b); };
  for (const p of Object.values(mod.ports)) for (const b of p.bits) if (typeof b === 'number') nets[net(b)].port = true;
  const pinName = (port, i, n) => (n > 1 ? `${port}<${i}>` : port);
  const cells = Object.values(mod.cells);
  cells.forEach((c, k) => {
    for (const [port, bits] of Object.entries(c.connections)) {
      bits.forEach((b, i) => {
        if (typeof b !== 'number') return;
        const e = { cell: k, pin: pinName(port, i, bits.length) };
        if (c.port_directions[port] === 'output') nets[net(b)].driver = e; else nets[net(b)].loads.push(e);
      });
    }
  });
  cells.forEach((c, k) => {
    const m = BRAM_TYPE.exec(c.type);
    if (!m && !MULT_TYPE.test(c.type)) return;
    const pins = {}, undriven = [];
    for (const [port, bits] of Object.entries(c.connections)) {
      bits.forEach((b, i) => {
        const pin = pinName(port, i, bits.length);
        if (b === 'x' || b === 'z') { undriven.push(pin); pins[pin] = 0; } else pins[pin] = b === '0' ? 0 : b === '1' ? 1 : net(b);
      });
    }
    const cell = { type: c.type, pins, params: c.parameters, undriven };
    let unwritten = new Set();
    if (m) {
      const single = !m[3], ports = single ? { A: +m[1] } : { A: +m[1], B: +m[3] };
      parityToData(cell, ports, single, { ci: x => (x === cell ? k : -1), nets });
      const inputsOf = P => Object.keys(cell.pins).filter(p => new RegExp(`^DIP?${single ? '' : P}(<\\d+>)?$`).test(p));
      unwritten = new Set(Object.keys(ports).filter(P => cell.pins[single ? 'WE' : `WE${P}`] === 0
        && inputsOf(P).every(p => nets[cell.pins[p]].const !== undefined)));
      c.type = cell.type;
      c.parameters = cell.params;
    }
    // the connections again from the pins (parityToData may move or widen them)
    const bitOf = new Map([...netOf].map(([b, n]) => [n, b]));
    const conn = {}, dirs = {};
    for (const [pin, n] of Object.entries(cell.pins)) {
      const q = /^(\w+?)(?:<(\d+)>)?$/.exec(pin), port = q[1], i = q[2] === undefined ? 0 : +q[2];
      const free = /^DIP?[AB]?$/.test(port) && unwritten.has(m && !m[3] ? 'A' : port.slice(-1));
      (conn[port] ||= [])[i] = free ? 'x' : nets[n].const !== undefined ? String(nets[n].const) : bitOf.get(n);
      dirs[port] = /^(DO|DOP|P|BCOUT)$/.test(port.replace(/[AB]$/, '')) || /^(P|BCOUT)$/.test(port) ? 'output' : 'input';
    }
    for (const port of Object.keys(conn)) conn[port] = Array.from(conn[port], b => b ?? 'x');
    c.connections = conn;
    c.port_directions = dirs;
  });
}

// The placements the nextpnr engine makes, each routed, the fastest kept. Measured on the examples (#2196): the best of
// four is 2 to 8 % shorter than one seed; a design of a few hundred slices takes seconds per placement.
export const NEXTPNR_TRIES = { normal: 4, high: 8, maxSlices: 500 };
/** The placements at an Optimization Effort ('high', else Normal) for a design of `slices` slices: one for a large one at Normal. */
export const nextpnrTries = (effort, slices) => (effort === 'high' ? NEXTPNR_TRIES.high : slices <= NEXTPNR_TRIES.maxSlices ? NEXTPNR_TRIES.normal : 1);

/**
 * { problems, runMap, runPar } of runFlow for the nextpnr engine (problems(): what keeps it from the design, [] if nothing). ctx: { io, spec, log, report, util, now, ms, netlistText (a
 * getter: the synthesis's JSON), top, constraints, StepError, setRouted (the routed design's text, for the reports and
 * the bitstream) }. io.nextpnr.spartan3e: { run(args, files, onLine) -> files, chipdb(part) -> Uint8Array }.
 */
export function mountNextpnrSteps(ctx) {
  const { io, spec, log, report, util, now, ms, netlistText, top, constraints, StepError, setRouted } = ctx;
  const model = () => { try { return constraints(); } catch { return null; } };   // (checked by translate)
  let input = null, sdc = '';
  const part = `${spec.device}${spec.pkg}`;

  // what keeps the nextpnr engine from implementing the design, [] when nothing (the engine 'auto' then takes it)
  let found = null;
  function problems() {
    if (found) return found;
    if (spec.family !== 'spartan3e') return (found = [`the nextpnr engine places the Spartan-3E only (#2131), not the ${spec.family}`]);
    if (!io.nextpnr?.spartan3e) return (found = ['the nextpnr engine is not available here (io.nextpnr)']);
    return (found = nextpnrNetlist(netlistText(), top, model(), io.device()).problems);
  }

  function runMap() {
    if (spec.family !== 'spartan3e') throw new StepError(`the nextpnr engine places the Spartan-3E only (#2131), not the ${spec.family}`, [], 'Choose the Silinx engine (Toolchain Settings).');
    if (!io.nextpnr?.spartan3e) throw new StepError('the nextpnr engine is not available here (io.nextpnr)', [], 'Choose the Silinx engine (Toolchain Settings).');
    const r = nextpnrNetlist(netlistText(), top, model(), io.device());
    if (r.problems.length) {
      throw new StepError(`the nextpnr engine cannot implement this design yet: ${r.problems.length} problem(s)`, r.problems.slice(0, 50),
        'Choose the Silinx engine (Toolchain Settings): nextpnr\'s Spartan-3E is growing (#2135).');
    }
    input = JSON.stringify(r.json);
    sdc = r.sdc;
    log('Map: nextpnr packs the design itself, at Place & Route (the nextpnr engine).');
  }

  // nextpnr and the device's chip database, loaded once (offline, a database not downloaded yet fails: #2329)
  let db = null;
  const load = async () => (db ||= await io.nextpnr.spartan3e.chipdb(part, log));

  async function runPar() {
    if (!input) runMap();
    const t = now();
    await load();
    // each clock's PERIOD as its target (the SDC), the tightest for the clocks with none (each met or not: the timing step's)
    let mhz = null;
    try { const c = constraints()?.clocks || []; if (c.length) mhz = 1000 / Math.min(...c.map(x => x.period)); } catch { /* translate's */ }
    // one placement and routing, as nextpnr's seed makes it: { seed, lines, ms, design, text, size, period } (its problems: StepError)
    const placeRoute = async seed => {
      const t1 = now(), lines = [];
      const args = ['--device', part, '--chipdb', 'chipdb.bin', '--json', 'design.json', '--write', 'routed.json', '--seed', String(seed),
        ...(mhz ? ['--freq', mhz.toFixed(3)] : []), ...(sdc ? ['--sdc', 'design.sdc'] : []), '--timing-allow-fail'];
      const errors = () => lines.filter(l => /^ERROR:/.test(l)).slice(0, 20);
      let files;
      try {
        files = await io.nextpnr.spartan3e.run(args, { 'design.json': input, 'chipdb.bin': db, ...(sdc ? { 'design.sdc': sdc } : {}) }, l => lines.push(l));
      } catch (e) {
        throw new StepError(`nextpnr failed: ${e.message}`, errors());
      }
      const routedJson = files?.['routed.json'];
      if (!routedJson) throw new StepError('nextpnr wrote no routed design', errors());
      const json = typeof routedJson === 'string' ? routedJson : new TextDecoder().decode(routedJson);
      let design;
      try { design = nextpnrToXdl(JSON.parse(json), io.device(), io.device().part); } catch (e) { throw new StepError(`nextpnr's routed design cannot be read: ${e.message}`); }
      const text = writeXdl(design);
      return { seed, lines, took: ms(t1), design, text, size: xdlSize(design), period: analyzeTiming(parseXdl(text), io.device(), { clocks: [] }).period };
    };
    // N placements from the seed on, the fastest kept (as fpga/place-route.js's tries); a design without a clock: one
    const first = spec.seed || 1;
    let best = null, failed = null, tried = 0;
    for (let k = 0, n = 1; k < n; k++) {
      let r;
      try { r = await placeRoute(first + k); } catch (e) { failed ||= { e }; continue; } finally { tried++; }
      if (!best) n = r.period > 0 ? nextpnrTries(spec.synthEffort, r.size.slices) : 1;
      if (n > 1) log(`Placement ${k + 1} of ${n} (seed ${r.seed}): ${r.period.toFixed(3)} ns, ${r.size.slices} slices, in ${r.took}.`);
      if (!best || r.period < best.period) best = r;
    }
    if (!best) throw failed.e;
    for (const l of best.lines) if (/^Warning:/.test(l)) log(`WARNING:nextpnr - ${l.replace(/^Warning:\s*/, '')}`);
    if (tried > 1) log(`Kept the fastest of ${tried} placements: seed ${best.seed}, ${best.period.toFixed(3)} ns.`);
    const fmax = best.lines.map(l => /Max frequency for clock '(.*)': ([0-9.]+) MHz/.exec(l)).filter(Boolean).at(-1);
    log(`Placed and routed by nextpnr in ${ms(t)}${fmax ? ` (its estimate: ${fmax[2]} MHz)` : ''}.`);
    const { design } = best;
    const text = best.text;
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

  // the Design Summary's map section, from the routed design (nextpnr packs at Place & Route): every resource, as
  // the Silinx engine's (#795), in the MAP report's order
  function mapReport(design) {
    const s = xdlSize(design), sites = deviceSites(io.device());
    const count = t => design.insts.filter(i => t.test(i.type)).length;
    const rows = [['ffs', 'Number of Slice Flip Flops', s.ffs, 2 * sites.slices.size], ['luts', 'Number of 4 input LUTs', s.luts, 2 * sites.slices.size],
      ['slices', 'Number of occupied Slices', s.slices, sites.slices.size], ['iob', 'Number of bonded IOBs', count(/^(IOB|IBUF)$/), sites.pads.size],
      ['ramb16', 'Number of RAMB16s', count(/^RAMB16$/), sites.brams.length], ['mult18x18', 'Number of MULT18X18SIOs', count(/^MULT18X18SIO$/), sites.mults.length],
      ['bufgmux', 'Number of BUFGMUXs', count(/^BUFGMUX$/), sites.bufgmux.length], ['dcm', 'Number of DCMs', count(/^DCM$/), sites.dcms.length]];
    const items = rows.map(([id, name, used, total]) => ({ id, ...util(name, used, total) }));
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    report.map = { utilization: items, summary: { slices: byId.slices, ffs: byId.ffs, luts: byId.luts, iobs: byId.iob, bufg: byId.bufgmux }, warnings: 0, errors: 0, engine: 'nextpnr' };
    log('Design summary (nextpnr):');
    for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
  }

  return { problems, load, runMap, runPar };
}

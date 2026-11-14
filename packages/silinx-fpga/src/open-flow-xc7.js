// Silinx toolchain - the 7-series' back end (#3146), a family of open-flow-backends.js's: Yosys's synth_xilinx, nextpnr-
// himbaechel's xilinx micro-architecture (#3143) placing and routing into FASM (open/routed.fasm), and the bitstream written
// from the FASM by Silinx's own writer on Project X-Ray's database (fpga/xc7/, #3144); the constraints are XDC (xdc.js).
// nextpnr comes through io.nextpnr.xc7 { run(args, files, onLine) -> files, chipdb(part, log) -> Uint8Array, router? }
// (nextpnr-xc7-node.js: the package @silinx/nextpnr-himbaechel-xc7; router: 'router2' where memory is plenty, the local
// server's, else router1's 0.4-0.5 GB); the bit database through io.bitDb() (fpga/xc7/bitdb.js's).
// The timing is nextpnr's own estimate: optimistic against Vivado's (1.2-1.5 times its Fmax on the same netlist, #3146),
// so said wherever it is shown, until a model calibrated against Vivado exists.
// The JTAG's user access (BSCANE2, the logic analyzer's link, #3767): the netlist hands nextpnr a BSCAN on the site of its
// chain (xc7BscanCells), and the FASM gets the chain's feature, which nextpnr does not write (xc7BscanFeatures).
import { scriptSynthesis } from './synth-script.js';
import { XDC } from './xdc.js';
import { loadChipdb } from './nextpnr-io.js';
import { portBits, nextpnrNames } from './nextpnr-ports.js';
import { fasmToFrames } from './fpga/xc7/frames.js';
import { bitstreamXc7 } from './fpga/xc7/bitstream.js';

/** The 7-series' steps, as runFlow runs them (open-steps.js XILINX_STEPS' shape): nextpnr packs in its Place & Route. */
export const XC7_STEPS = [
  { id: 'synth', label: 'Synthesize - Yosys', needs: [] },
  { id: 'translate', label: 'Translate', needs: ['synth'] },
  { id: 'par', label: 'Place & Route - nextpnr', needs: ['translate'] },
  { id: 'trce', label: 'Generate Post-Place & Route Static Timing', needs: ['par'] },
  { id: 'bitgen', label: 'Generate Programming File', needs: ['par'] },
];

/** What the timing of this back end is: nextpnr's estimate, not Vivado's (#3146). */
export const XC7_TIMING_MODEL = 'nextpnr\'s estimate (optimistic against Vivado, #3146)';

// the synthesis's resources, from synth_xilinx's cells
const sum = (counts, re) => Object.entries(counts).reduce((n, [t, k]) => n + (re.test(t) ? k : 0), 0);
export const xc7Utilization = counts => ({
  luts: sum(counts, /^LUT[1-6]$/), flipFlops: sum(counts, /^FD[CPRS]E(_1)?$/), latches: sum(counts, /^LD[CP]E(_1)?$/), ios: sum(counts, /^(IBUF|IBUFG|OBUF|OBUFT|IOBUF)$/),
  carry: sum(counts, /^CARRY4$/), muxes: sum(counts, /^MUXF[78]$/), shiftRegisters: sum(counts, /^SRL(16E|C32E)$/), distributedRam: sum(counts, /^RAM(32|64|128|256)X1[SD]$|^RAM(32|64)M$/),
  blockRam: sum(counts, /^RAMB(18|36)E1$/), multipliers: sum(counts, /^DSP48E1$/), clockBuffers: sum(counts, /^BUFG/), dcms: sum(counts, /^(MMCME2|PLLE2)_/),
  cells: sum(counts, /./),
});
// (the lines of the synthesis's report: Vivado's names for those the part's resources do not name)
const NAMES = { luts: 'Slice LUTs', ffs: 'Slice Registers', ramb16: 'Block RAM Tiles', mult18x18: 'DSPs', bufgmux: 'BUFGCTRL', dcm: 'MMCME2_ADV / PLLE2_ADV', iob: 'Bonded IOB' };
// the tile of the four BSCAN sites in nextpnr's chip databases (the xc7a50t's, which the xc7a35t takes, and the xc7a100t's:
// the same grid position); the JTAG chain n's site BSCAN_X0Y<n - 1>, as Vivado's DRC asks (PDRC-2, #3767)
const XC7_BSCAN_TILE = 'X46Y124';

/** Yosys's netlist (its text) with each BSCANE2 as nextpnr's xilinx takes it: a BSCAN (its BELs' type) on the BEL of its
 *  JTAG chain (BSCAN_X0Y<chain - 1>). Returns { text, chains: [the JTAG chains, 1 … 4] }; the text unchanged with none. */
export function xc7BscanCells(text) {
  if (!/"BSCANE2"/.test(text)) return { text, chains: [] };
  const j = JSON.parse(text), chains = [];
  for (const m of Object.values(j.modules)) {
    for (const c of Object.values(m.cells || {})) {
      if (c.type !== 'BSCANE2') continue;
      // (Yosys writes a parameter as its 32 bits)
      const p = c.parameters?.JTAG_CHAIN, chain = p === undefined ? 1 : typeof p === 'number' ? p : parseInt(p, /^[01]{9,}$/.test(p) ? 2 : 10);
      if (!(chain >= 1 && chain <= 4)) throw new Error(`a BSCANE2's JTAG_CHAIN is 1 to 4, not ${p}`);
      if (chains.includes(chain)) throw new Error(`two BSCANE2s on the JTAG chain ${chain}`);
      chains.push(chain);
      c.type = 'BSCAN';
      c.attributes = { ...c.attributes, BEL: `${XC7_BSCAN_TILE}/BSCAN_X0Y${chain - 1}.BSCAN` };
    }
  }
  return { text: JSON.stringify(j), chains };
}

/** The FASM lines of the BSCANs' chains (Project X-Ray's CFG_CENTER_MID.BSCAN.JTAG_CHAIN_<n>), on the part's CFG_CENTER_MID
 *  tile (db: the bit database); '' with none. */
export function xc7BscanFeatures(db, chains) {
  if (!chains.length) return '';
  const tile = db.tiles().find(n => db.tile(n).type === 'CFG_CENTER_MID');
  if (!tile) throw new Error(`the ${db.part} has no CFG_CENTER_MID tile in the bit database`);
  return chains.map(c => `${tile}.BSCAN.JTAG_CHAIN_${c}\n`).join('');
}

// nextpnr's bels (its --report's utilization), named as the part's resources name them (resources.js: their `report`, the
// Design Summary's rows) or as Vivado's utilization report does, and how many the part has of each (counts: its resources'
// slices, luts, ffs, iob): the chip database of the xc7a35t is the xc7a50t's (#3143), whose counts nextpnr gives; a resource
// the part's do not count (block RAM, DSP), nextpnr's. Its others (PSEUDO_GND, the pads' buffers…) left out; the LUTs and
// the slices are the FASM's (xc7FasmUtilization), not its LUT bels (a LUT6 and a LUT5 of a site are two).
const BELS = [
  [/^SLICE_FFX$/, { id: 'ffs', name: 'Slice Registers' }, r => r.ffs], [/^CARRY4$/, { name: 'CARRY4' }, r => r.slices],
  [/^F7MUX$/, { name: 'F7 Muxes' }, r => 2 * r.slices], [/^F8MUX$/, { name: 'F8 Muxes' }, r => r.slices], [/^RAMB18E1(_RAMB18E1)?$/, { name: 'RAMB18' }],
  [/^RAMB36E1(_RAMB36E1)?$/, { name: 'RAMB36' }], [/^DSP48E1(_DSP48E1)?$/, { name: 'DSPs' }], [/^BUFGCTRL$/, { name: 'BUFGCTRL' }],
  [/^(MMCME2_ADV|PLLE2_ADV)$/, { name: 'MMCME2_ADV / PLLE2_ADV' }], [/^PAD$/, { id: 'iob', name: 'Bonded IOB' }, r => r.iob], [/^BSCAN$/, { name: 'BSCANE2' }],
];

// a LUT's INIT that passes one input through (bit i is input k's value in i): nextpnr's feed-through LUTs, around the carry
// chains (#3160), or a buffer synthesis left
const passThrough = bits => {
  for (let k = 0; 1 << k < bits.length; k++) if ([...bits].every((b, j) => +b === (((bits.length - 1 - j) >> k) & 1))) return true;
  return false;
};

/** The LUT sites a FASM uses (each a LUT6, or a LUT6 and a LUT5, with an INIT): those with logic and those nextpnr made
 *  feed-throughs (one input passed through), and its slices: { luts, feedThroughs, slices }. A slice counts with a feature
 *  other than NOCLKINV: nextpnr writes both halves of every logic tile it uses (fasm.cc, write_logic), and an empty half
 *  gets only the FF block's default, NOCLKINV (#3683). */
export function xc7FasmUtilization(fasm) {
  const luts = new Map(), slices = new Set();
  for (const m of String(fasm).matchAll(/^([A-Z0-9_]+_X\d+Y\d+\.SLICE[LM]?_X[01])\.(?:([A-D])LUT\.INIT\[(\d+):0\]\s*=\s*\d+'b([01]+)|(NOCLKINV)\s*$)?/gm)) {
    if (!m[5]) slices.add(m[1]);
    if (m[2]) luts.set(`${m[1]}.${m[2]}`, passThrough(m[4].padStart(+m[3] + 1, '0')));
  }
  const feedThroughs = [...luts.values()].filter(Boolean).length;
  return { luts: luts.size - feedThroughs, feedThroughs, slices: slices.size };
}

const text = v => (typeof v === 'string' ? v : new TextDecoder().decode(v));
// the model's bits are x<1> (UCF's), nextpnr's x[1]
const bracketed = name => name.replace(/<(\d+)>$/, '[$1]');

/**
 * The XDC nextpnr reads (-o xdc=): each port's PACKAGE_PIN and IOSTANDARD, each clock's create_clock -period, for the
 * ports the netlist has (a line for another makes nextpnr warn); nextpnr's xilinx reads no other property or option.
 * Returns { text, free: the ports with no pin, clocks: the create_clocks' [{ net, mhz }] }.
 */
export function nextpnrXdc(model, bits) {
  const named = model ? nextpnrNames({ ...model, assignments: Object.fromEntries(Object.entries(model.assignments || {}).map(([n, a]) => [bracketed(n), a])),
    clocks: (model.clocks || []).map(c => ({ ...c, net: bracketed(c.net) })) }, bits) : { assignments: {}, clocks: [] };
  const names = new Set(bits.map(b => b.name)), lines = [];
  for (const b of bits) {
    const a = named.assignments[b.name];
    if (!a?.loc) continue;
    lines.push(`set_property -dict {PACKAGE_PIN ${a.loc} IOSTANDARD ${a.iostandard || 'LVCMOS33'}} [get_ports {${b.name}}]`);
  }
  const clocks = named.clocks.filter(c => names.has(c.net) && c.period > 0);
  for (const c of clocks) lines.push(`create_clock -period ${(+c.period).toFixed(3)} [get_ports {${c.net}}]`);
  return { text: lines.length ? `${lines.join('\n')}\n` : '', free: bits.map(b => b.name).filter(n => !named.assignments[n]?.loc),
    clocks: clocks.map(c => ({ net: c.net, mhz: 1000 / c.period })) };
}

/** The resources nextpnr used (its --report's utilization; fasm: its FASM, for the LUTs and the slices) as rows { name, used,
 *  total, percent } (util: runFlow's), each total the part's own (resources: resources.js resourcesOf's) where the chip
 *  database is a larger part's. */
export function xc7PlacedUtilization(report, resources = [], util, fasm = null) {
  const counts = Object.fromEntries(resources.filter(x => x.count).map(x => [x.id, x.count]));
  const nameOf = (id, name) => resources.find(x => x.id === id)?.report || name;
  const rows = new Map();
  if (fasm != null) {
    const f = xc7FasmUtilization(fasm);
    if (f.luts) rows.set(nameOf('luts', 'Slice LUTs'), { used: f.luts, available: counts.luts });
    if (f.feedThroughs) rows.set('LUTs as feed-throughs (nextpnr)', { used: f.feedThroughs, available: counts.luts });
    if (f.slices) rows.set(nameOf('slices', 'Slices'), { used: f.slices, available: counts.slices });
  }
  for (const [bel, u] of Object.entries(report.utilization || {})) {
    const row = BELS.find(([re]) => re.test(bel));
    if (!row || !u.used) continue;
    const [, { id, name }, own] = row, key = nameOf(id, name), r = rows.get(key) || { used: 0, available: 0, own };
    rows.set(key, { ...r, used: r.used + u.used, available: r.available + u.available });
  }
  return [...rows].map(([name, u]) => util(name, u.used, (u.own && u.own(counts)) || u.available));
}

// a clock net nextpnr names as synthesis left it ($abc$…$aiger$o292, the global buffer's output): the port of the only
// create_clock with its frequency (ports: [{ net, mhz }]), else its own name
const clockName = (net, mhz, ports) => {
  if (!net.startsWith('$')) return net;
  const same = ports.filter(p => Math.abs(p.mhz - mhz) < 0.01);
  return same.length === 1 ? same[0].net : net;
};

/** nextpnr's timing (its --report's fmax; clockPorts: the create_clocks' [{ net, mhz }], to name the clocks): { met,
 *  timingErrors, minPeriodNs, maxFreqMHz, constraints, clocks, model }; null with no clock. */
export function xc7Timing(report, clockPorts = []) {
  const clocks = Object.entries(report.fmax || {}).map(([net, f]) => ({ clock: clockName(net, f.constraint, clockPorts), achieved: +f.achieved.toFixed(2), constraint: +f.constraint.toFixed(2) }));
  if (!clocks.length) return null;
  const constraints = clocks.map(c => ({ name: c.clock, constraint: `create_clock ${c.clock}: ${(1000 / c.constraint).toFixed(3)} ns (${c.constraint} MHz)`,
    timingErrors: c.achieved >= c.constraint ? 0 : 1, minPeriodNs: +(1000 / c.achieved).toFixed(3), maxFreqMHz: c.achieved }));
  const worst = clocks.reduce((a, c) => (c.achieved < a.achieved ? c : a));
  const timingErrors = constraints.reduce((n, c) => n + c.timingErrors, 0);
  return { met: !timingErrors, timingErrors, minPeriodNs: +(1000 / worst.achieved).toFixed(3), maxFreqMHz: worst.achieved, constraints, clocks, model: XC7_TIMING_MODEL };
}

/** The run kept of nextpnr's runs with several seeds (#3825): runs, [{ seed, fmax }] (fmax: the slowest clock's, null with no
 *  clock) or [{ seed, error }]: the best Fmax, a tie to the lowest seed; a failed run left out; null when all failed. */
export function xc7BestRun(runs) {
  const f = r => r.fmax ?? -Infinity;
  return runs.filter(r => !r.error).reduce((b, r) => (!b || f(r) > f(b) || (f(r) === f(b) && r.seed < b.seed) ? r : b), null);
}

/** The seeds of the reports (report.par.seeds, nextpnr-report.json's): [{ seed, fmaxMHz, failed?, kept? }] of the runs (best:
 *  the one kept). */
export const xc7SeedsOfRuns = (runs, best) => runs.map(r => ({ seed: r.seed, fmaxMHz: r.error ? null : r.fmax, ...(r.error && { failed: true }), ...(r === best && { kept: true }) }));

/** The seeds' sentence of the timing report: the seed kept, the others' Fmax. */
export function xc7SeedsLine(seeds) {
  const kept = seeds.find(s => s.kept), mhz = s => (s.failed ? 'nextpnr failed' : s.fmaxMHz == null ? 'no clock timed' : `${s.fmaxMHz} MHz`);
  return `Best of ${seeds.length} seeds (nextpnr's estimate of the slowest clock): seed ${kept.seed} kept (${mhz(kept)}); ${seeds.filter(s => !s.kept).map(s => `seed ${s.seed}: ${mhz(s)}`).join(', ')}.`;
}

/** The timing report's text (open/timing.txt). */
export function xc7TimingText(timing, part, seeds = null) {
  const out = [`Timing of ${part} after Place & Route: ${XC7_TIMING_MODEL}.`,
    'nextpnr\'s xilinx timing is optimistic: on the same netlist it reports 1.2-1.5 times the maximum frequency Vivado gives; check a design near its limit with Vivado.', '',
    ...(seeds ? [xc7SeedsLine(seeds), ''] : [])];
  if (!timing) return [...out, 'No clock constrained or timed: no create_clock in the XDC, and no path between flip-flops on a clock.', ''].join('\n');
  for (const c of timing.clocks) out.push(`Clock ${c.clock}: ${c.achieved} MHz (${(1000 / c.achieved).toFixed(3)} ns), constraint ${c.constraint} MHz: ${c.achieved >= c.constraint ? 'met' : 'NOT met'}`);
  out.push('', timing.met ? 'All constraints met (nextpnr\'s estimate).' : `${timing.timingErrors} constraint(s) not met (nextpnr's estimate).`, '');
  return out.join('\n');
}

function mountXc7(ctx) {
  const { io, spec, log, report, top, ms, now, constraints, netlistText, StepError } = ctx;
  const part = spec.part;
  let fasm = null, nreport = null;
  const fasmOrEarlier = () => {
    if (fasm == null) fasm = io.read('open/routed.fasm');
    if (fasm == null) throw new StepError('no routed design: run Place & Route first', [], '');
    return fasm;
  };
  const reportOrEarlier = () => {
    if (nreport == null) { const t = io.read('open/nextpnr-report.json'); nreport = t == null ? null : JSON.parse(t); }
    if (nreport == null) throw new StepError('no routed design: run Place & Route first', [], '');
    return nreport;
  };
  const tool = () => {
    if (!io.nextpnr?.xc7) throw new StepError('nextpnr-himbaechel-xc7 is not in this installation (io.nextpnr.xc7)', [], 'Install it: npm install @silinx/nextpnr-himbaechel-xc7');
    return io.nextpnr.xc7;
  };
  const timingOf = r => {
    const timing = xc7Timing(r, r.clockPorts);
    report.timing = timing ? { ...timing, clocks: undefined } : { met: null, timingErrors: 0, constraints: [], model: XC7_TIMING_MODEL };
    report.files.timing = io.write('open/timing.txt', xc7TimingText(timing, part, r.seeds || null));
    return timing;
  };

  // one placement and routing with nextpnr's seed (run: nextpnr's run, in this thread or apart): { seed, lines, out, nreport,
  // fmax } (fmax: the slowest clock's, nextpnr's estimate; null with no clock), or { seed, lines, error }
  const placeRoute = async (run, seed, args, files, clockPorts) => {
    const lines = [];
    try {
      const out = await run([...args, '--seed', String(seed)], files, l => lines.push(l));
      const nr = { ...JSON.parse(text(out['report.json'])), clockPorts };   // (the clocks' ports, to name them)
      return { seed, lines, out, nreport: nr, fmax: xc7Timing(nr, clockPorts)?.maxFreqMHz ?? null };
    } catch (error) { return { seed, lines, error }; }
  };

  async function runPar() {
    const t = now();
    const bits = portBits(netlistText(), top);
    const xdc = nextpnrXdc(constraints(), bits);
    for (const p of xdc.free) log(`WARNING:Place - the port ${p} has no pin (PACKAGE_PIN in the XDC): nextpnr places it anywhere.`);
    const nextpnr = tool();
    const chipdb = await loadChipdb(nextpnr, part, log, StepError);
    const router = nextpnr.router || 'router1';
    let netlist;
    try { netlist = xc7BscanCells(netlistText()); } catch (e) { throw new StepError(e.message, [], ''); }
    const args = ['--device', part, '--chipdb', 'chipdb.bin', '--json', 'netlist.json', '-o', 'fasm=routed.fasm', '--report', 'report.json',
      '--router', router, '--timing-allow-fail', ...(xdc.text ? ['-o', 'xdc=design.xdc'] : [])];
    const files = { 'chipdb.bin': chipdb, 'netlist.json': netlist.text, ...(xdc.text && { 'design.xdc': xdc.text }) };
    // the best of 3 seeds (#3825, Process Properties): each placed and routed, apart and at once where nextpnr's io can
    // (the local server's), else one after another; the best Fmax kept, and only its warnings said
    const first = spec.seed || 1, seeds = Array.from({ length: spec.xc7Seeds === 3 ? 3 : 1 }, (_, k) => first + k);
    log(`nextpnr-himbaechel (xilinx) places and routes <${top}> on the ${part} (${router}${seeds.length > 1 ? `; seeds ${seeds.join(', ')}, the best kept` : ''}).`);
    let runs;
    if (seeds.length > 1 && nextpnr.runApart && (nextpnr.parallel || 1) >= seeds.length) runs = await Promise.all(seeds.map(s => placeRoute(nextpnr.runApart, s, args, files, xdc.clocks)));
    else {
      runs = [];
      for (const s of seeds) runs.push(await placeRoute(nextpnr.run, s, args, files, xdc.clocks));
    }
    const best = xc7BestRun(runs);
    if (!best) throw new StepError(`nextpnr failed: ${runs[0].error.message}`, runs[0].lines.filter(l => /^ERROR:/.test(l)), '');
    if (seeds.length > 1) {
      for (const r of runs) log(`Seed ${r.seed}: ${r.error ? `nextpnr failed (${r.error.message})` : r.fmax == null ? 'no clock timed' : `${r.fmax} MHz (nextpnr's estimate)`}${r === best ? ', kept' : ''}.`);
    }
    const warnings = best.lines.filter(l => /^Warning:/.test(l));
    for (const l of warnings) log(`WARNING:Place - ${l.replace(/^Warning:\s*/, '')}`);
    nreport = { ...best.nreport, ...(seeds.length > 1 && { seeds: xc7SeedsOfRuns(runs, best) }) };
    // (the BSCANs' chains: features nextpnr's FASM does not write)
    fasm = text(best.out['routed.fasm']) + xc7BscanFeatures(io.bitDb(), netlist.chains);
    report.files.routed = io.write('open/routed.fasm', fasm);
    io.write('open/nextpnr-report.json', JSON.stringify(nreport, null, 2) + '\n');
    const items = xc7PlacedUtilization(nreport, spec.resources, ctx.util, fasm);
    // (the xc7a35t's chip database is the xc7a50t's, #3143: nextpnr does not hold it to the part's own resources)
    const over = items.filter(i => i.total && i.used > i.total);
    report.map = { utilization: items, warnings: warnings.length, errors: over.length };
    log(`Device utilization (nextpnr, ${part}):`);
    for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
    if (over.length) throw new StepError(`the design takes more than the ${spec.device} has: ${over.map(i => `${i.used} ${i.name} of ${i.total}`).join(', ')}`, [], 'Choose a larger device (Design Properties).');
    const timing = timingOf(nreport);
    for (const c of timing?.clocks || []) log(`Clock ${c.clock}: ${c.achieved} MHz (${c.achieved >= c.constraint ? 'met' : 'NOT met'}, ${c.constraint} MHz asked; nextpnr's estimate)`);
    report.par = { routed: true, unroutedSignals: 0, done: true, engine: 'nextpnr', router, seed: best.seed, ...(nreport.seeds && { seeds: nreport.seeds }), fmax: timing?.clocks || [], constraintsMet: timing ? timing.met : true };
    log(`Placed and routed by nextpnr in ${ms(t)}: ${report.files.routed}`);
  }

  function runTiming() {
    const timing = timingOf(reportOrEarlier());
    log(timing ? `Timing (${XC7_TIMING_MODEL}): ${timing.met ? 'all constraints met' : `${timing.timingErrors} constraint(s) not met`}, minimum period ${timing.minPeriodNs} ns (${timing.maxFreqMHz} MHz).`
      : 'Timing: no clock constrained or timed.');
    if (timing && !timing.met) for (const c of timing.clocks.filter(c => c.achieved < c.constraint)) log(`WARNING:Timing - the clock ${c.clock} reaches ${c.achieved} MHz, not the ${c.constraint} MHz of its constraint (nextpnr's estimate).`);
    log(`Timing report: ${report.files.timing}`);
  }

  function runBitgen() {
    const db = io.bitDb();
    const routed = fasmOrEarlier();
    let frames;
    try {
      ({ frames } = fasmToFrames(db, routed));
    } catch (e) {
      throw new StepError(`the routed design's FASM cannot be written as a bitstream: ${e.message}`, [], '');
    }
    // (the header's part as Vivado and ISE write it, 7a35tcpg236: the programmer's check of the board's device reads it)
    const bytes = bitstreamXc7(frames, db, { source: top, generator: 'silinx-fpga', part: `${String(spec.device).replace(/^xc/, '')}${spec.pkg}` });
    report.bit = { path: io.write(`${top}.bit`, bytes), size: bytes.length };
    log(`Bitstream: build/${top}.bit (${bytes.length} bytes, from nextpnr's FASM on Project X-Ray's database)`);
  }

  return { steps: { translate: ctx.readNetlist, par: runPar, trce: runTiming, bitgen: runBitgen } };
}

export const XC7 = {
  id: 'artix7', mount: mountXc7, steps: XC7_STEPS, constraints: XDC,
  synth: scriptSynthesis({ script: top => `synth_xilinx -flatten -arch xc7 -top ${top}`, utilization: xc7Utilization }),
  synthName: (id, resource) => resource?.report || NAMES[id] || id,
};

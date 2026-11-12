// Silinx toolchain - nextpnr's own timing as the reports show it (#2300), for the families nextpnr's analysis times (the
// iCE40, the ECP5, the Gowin): its --report's fmax (each clock's frequency) and its critical paths (the worst of each
// clock, the worst from the inputs to a clock and from a clock to the outputs: nextpnr keeps one of each), each segment
// (clk-to-q, routing, logic, setup) with its cell, port, place and net.
//
//   nextpnrTiming(fmax, asked)                 // the Design Summary's timing (report.timing)
//   nextpnrPaths(report, { clockName, fmax, asked, netlist, synText, top })   // the Paths panel's and timing_paths' paths
//   nextpnrTimingText({ top, part, tool, timing, paths })                      // the Static Timing Report (open/timing.txt)
//
// The paths are fpga/timing-paths.js's (timingPaths' result: paths, points, pairs), and back to the source lines as
// those are: a stage's cell is the Yosys cell of the synthesized netlist (<top>.json) that drives the net after it (a
// clock-to-out's flip-flop, a logic stage's LUT or carry), or, for a setup, the flip-flop the net before it reaches; the
// cells' sources and signals are cellSources' (the blocks of <top>_syn.v). nextpnr names a net as Yosys does (name[i]),
// the nets it adds at an I/O buffer with a suffix ($SB_IO_IN, $TRELLIS_IO_OUT…), and a cell it packs after one of the
// cells it holds (an iCE40's logic cell: the LUT's name, then _LC).
import { cellSources } from './fpga/timing-paths.js';

const r3 = x => +x.toFixed(3);
const ns = mhz => 1000 / mhz;
// a stage of nextpnr's (its segment's type) as timing-paths.js names it; an input pad's ('source'), the path's start
const KIND = { 'clk-to-q': 'clock-to-out', routing: 'net', logic: 'logic', setup: 'setup', source: 'input' };
// the suffixes nextpnr gives the nets at an I/O buffer and the global buffers, and a packed cell's name
const NET_SUFFIX = /\$(SB_IO_IN|SB_IO_OUT|SB_IO_IN_\$glb_clk|glb_clk|TRELLIS_IO_IN|TRELLIS_IO_OUT|TRELLIS_IO_INOUT)$/;
const CELL_SUFFIX = /(_LC|_DFFLC|_CARRY_LC|\$CARRY|\$sb_io|\$tr_io)$/;
const FLOP = /^(SB_DFF|TRELLIS_FF$|DFF|FD[CPRS]E)/;

/** The clocks of nextpnr's fmax ([{ clock, achieved, constraint }]) that a constraint asks for (asked(clock): the
 *  constraints' own, not nextpnr's default frequency) as the Design Summary's timing: { met, timingErrors, score,
 *  minPeriodNs, maxFreqMHz, clocks, constraints, engine }. */
export function nextpnrTiming(fmax, asked = f => f.constraint != null) {
  const constraints = fmax.filter(f => f.constraint != null && asked(f)).map(f => ({
    name: `clock ${f.clock}`, constraint: `${f.clock} at ${f.constraint} MHz (${ns(f.constraint).toFixed(3)} ns)`, required: r3(ns(f.constraint)), constraintMHz: f.constraint,
    minPeriodNs: r3(ns(f.achieved)), maxFreqMHz: f.achieved, timingErrors: f.achieved >= f.constraint ? 0 : 1, slackNs: r3(ns(f.constraint) - ns(f.achieved)),
  }));
  const worst = fmax.reduce((a, f) => (!a || f.achieved < a.achieved ? f : a), null);
  const timingErrors = constraints.reduce((n, c) => n + c.timingErrors, 0);
  return { met: !timingErrors, timingErrors, score: null, minPeriodNs: worst ? r3(ns(worst.achieved)) : null, maxFreqMHz: worst ? worst.achieved : null,
    clocks: fmax.map(f => ({ clock: f.clock, minPeriodNs: r3(ns(f.achieved)), maxFreqMHz: f.achieved, constraintMHz: constraints.some(c => c.name === `clock ${f.clock}`) ? f.constraint : null })),
    constraints, engine: 'nextpnr' };
}

// the synthesized netlist's bits by nextpnr's net names, each bit's driving cell and its readers, the cells' types
function netlistIndex(netlist, top) {
  const mod = netlist?.modules?.[top] || Object.values(netlist?.modules || {}).find(m => m.attributes?.top) || { cells: {}, netnames: {} };
  const bits = new Map(), driver = new Map(), readers = new Map(), types = new Map(), names = new Map();
  for (const [name, n] of Object.entries(mod.netnames || {})) {
    const b = n.bits || [], off = n.offset || 0;
    if (!name.startsWith('$') && !n.hide_name) for (const x of b) if (typeof x === 'number') { if (!names.has(x)) names.set(x, []); names.get(x).push(name); }
    if (b.length === 1 && typeof b[0] === 'number' && !bits.has(name)) bits.set(name, b[0]);
    b.forEach((x, i) => { const k = `${name}[${n.upto ? off + b.length - 1 - i : off + i}]`; if (typeof x === 'number' && !bits.has(k)) bits.set(k, x); });
  }
  for (const [name, c] of Object.entries(mod.cells || {})) {
    types.set(name, c.type);
    for (const [port, bs] of Object.entries(c.connections || {})) {
      for (const b of bs) {
        if (typeof b !== 'number') continue;
        if (c.port_directions?.[port] === 'output') driver.set(b, name);
        else if (c.port_directions?.[port] === 'input') { if (!readers.has(b)) readers.set(b, []); readers.get(b).push(name); }
      }
    }
  }
  const bitOf = (net) => {
    for (let n = net; n; n = n.replace(NET_SUFFIX, '')) {
      if (bits.has(n)) return bits.get(n);
      if (!NET_SUFFIX.test(n)) break;
    }
    return null;
  };
  // a cell of nextpnr's as the netlist names it (the cell it is named after)
  const cellOf = (cell) => {
    for (let n = cell; n; n = n.replace(CELL_SUFFIX, '')) {
      if (types.has(n)) return n;
      if (!CELL_SUFFIX.test(n)) break;
    }
    return null;
  };
  const isFlop = n => FLOP.test(types.get(n) || '');
  const outs = n => Object.entries(mod.cells[n]?.connections || {}).filter(([p]) => mod.cells[n].port_directions?.[p] === 'output').flatMap(([, bs]) => bs);
  return { bitOf, cellOf, isFlop, driver, readers, outs, names: b => names.get(b) || [] };
}

// the Yosys cells of a stage: what drives the net after it (clock-to-out, logic, an input), or the flip-flops the net
// before it reaches in its cell (setup); else the cell it is named after
function stageCells(ix, seg, prev, next) {
  const own = ix.cellOf(seg.to.cell);
  if (seg.type === 'setup') {
    const b = prev?.net == null ? null : ix.bitOf(prev.net);
    const into = b == null ? [] : ix.readers.get(b) || [];
    const cells = into.includes(own) ? [own] : into.length ? into : own ? [own] : [];
    const flops = cells.flatMap(n => (ix.isFlop(n) ? [n] : ix.outs(n).flatMap(x => (ix.readers.get(x) || []).filter(ix.isFlop))));
    const fl = [...new Set(flops)];
    return { cells: [...new Set([...cells, ...flops])], flops: fl, bits: fl.flatMap(ix.outs).filter(x => typeof x === 'number') };
  }
  const b = next?.net == null ? null : ix.bitOf(next.net);
  const d = b == null ? null : ix.driver.get(b);
  const cells = d ? [d] : own ? [own] : [];
  return { cells, flops: cells.filter(ix.isFlop), bits: b == null ? [] : [b] };
}

const event = e => /^(posedge|negedge) (.*)$/.exec(e || '');

/**
 * nextpnr's critical paths (its --report's) as timing-paths.js's paths: { top, paths (between two clocked ends, the
 * slowest first), points, pairs (as timingPaths' between), inputs, outputs, through (the paths from the inputs, to the
 * outputs and from the inputs to the outputs: their stages, no required time) }. clockName(net): a clock as the reports name it; fmax: the clocks
 * ([{ clock, constraint }]); asked(f): whether a constraint asks for a clock's (its required time; else none).
 */
export function nextpnrPaths(report, { clockName = n => n, fmax = [], asked = f => f.constraint != null, netlist = null, synText = '', top = '' } = {}) {
  const ix = netlistIndex(netlist, top);
  const sourcesOf = cellSources(netlist, synText, top);
  const required = new Map(fmax.filter(f => f.constraint != null && asked(f)).map(f => [f.clock, ns(f.constraint)]));
  const asPath = (cp) => {
    const segs = cp.path || [];
    let arrival = 0;
    const stages = segs.map((s, i) => {
      arrival += s.delay;
      const stage = { kind: KIND[s.type] || 'logic', inst: s.to.cell, pin: s.to.port, site: Array.isArray(s.to.loc) ? `X${s.to.loc[0]}Y${s.to.loc[1]}` : null, delay: r3(s.delay), arrival: r3(arrival) };
      if (s.type === 'routing') { stage.net = s.net ?? null; stage.sources = []; stage.signals = []; return stage; }
      const { cells, flops, bits } = stageCells(ix, s, segs[i - 1], segs.slice(i + 1).find(x => x.type === 'routing'));
      const seen = new Set();
      stage.sources = cells.flatMap(sourcesOf).filter(x => { const k = `${x.file}:${x.line}`; return !seen.has(k) && seen.add(k); });
      // (the named signals of the bits it drives: a flip-flop's register, a block RAM's output; else its cells')
      const named = bits.flatMap(ix.names);
      stage.signals = [...new Set(named.length ? named : (flops.length ? flops : cells).flatMap(sourcesOf.signals))];
      return stage;
    });
    const seen = new Set(), lines = [];
    for (const s of stages) for (const x of s.sources) { const k = `${x.file}:${x.line}`; if (!seen.has(k)) { seen.add(k); lines.push({ file: x.file, line: x.line }); } }
    return { stages, lines, delay: r3(arrival) };
  };
  const paths = [], inputs = [], outputs = [], through = [];
  for (const cp of report?.critical_paths || []) {
    const a = event(cp.from), b = event(cp.to);
    const p = asPath(cp);
    if (!a && !b) { through.push(p); continue; }
    if (!a || !b) { (a ? outputs : inputs).push({ clock: clockName((a || b)[2]), ...p }); continue; }
    const clock = clockName(b[2]), from = clockName(a[2]);
    // (between a clock's two edges: half its period; between two clocks: no required time of nextpnr's own)
    const half = from === clock && a[1] !== b[1];
    const req = from !== clock || !required.has(clock) ? null : half ? required.get(clock) / 2 : required.get(clock);
    paths.push({ clock, ...(from !== clock ? { fromClock: from } : {}), port: null, required: req == null ? null : r3(req), delay: p.delay, period: r3(half ? 2 * p.delay : p.delay), half,
      slack: req == null ? null : r3(req - p.delay), stages: p.stages, lines: p.lines });
  }
  paths.sort((x, y) => y.period - x.period);
  // the paths between two registers: each one's from its first flip-flop's signals to its last one's
  const pointsOf = s => (s.signals.length ? s.signals : [s.inst]);
  const pairs = paths.flatMap(p => pointsOf(p.stages[0]).flatMap(f => pointsOf(p.stages.at(-1)).map(t => ({ from: f, to: t, ...p }))));
  return { top, paths, points: [...new Set(pairs.flatMap(p => [p.from, p.to]))].sort(), pairs, inputs, outputs, through };
}

/**
 * A family's timing step (Generate Post-Place & Route Static Timing) and what its Place & Route keeps for it: record(r,
 * fmax) at Place & Route (nextpnr's report, its clocks: fmax as the family reads it, a clock's constraint null when the
 * constraints do not ask for it), then the timing written (report.timing, open/timing.txt, open/paths.json); runTiming()
 * writes them again from an earlier run's report. tool: nextpnr's name (nextpnr-ice40…); clockName: its clocks' names.
 */
export function mountNextpnrTiming(ctx, { tool, clockName }) {
  const { io, spec, log, report, top, StepError } = ctx;
  let saved = null;
  const write = () => {
    const json = ctx.netlistText?.() ?? io.read(`open/${top}.json`);
    const netlist = json == null ? null : typeof json === 'string' ? JSON.parse(json) : json;
    const synTop = Object.entries(netlist?.modules || {}).find(([, m]) => m.attributes?.top)?.[0] ?? top;
    const timing = nextpnrTiming(saved.clocks);
    const paths = nextpnrPaths(saved, { clockName, fmax: saved.clocks, netlist, synText: io.read(`open/${synTop}_syn.v`) || '', top: synTop });
    report.timing = timing;
    report.files.timing = io.write('open/timing.txt', nextpnrTimingText({ top, part: spec.part || spec.device, tool, timing, paths }));
    report.files.paths = io.write('open/paths.json', JSON.stringify(paths));
    return timing;
  };
  return {
    record(r, clocks) {
      saved = { ...r, clocks };
      io.write('open/nextpnr-report.json', `${JSON.stringify(saved, null, 2)}\n`);
      write();
    },
    runTiming() {
      if (saved == null) { const t = io.read('open/nextpnr-report.json'); saved = t == null ? null : JSON.parse(t); }
      if (!saved?.clocks) throw new StepError('no routed design: run Place & Route first', [], '');
      const timing = write();
      log(timing.clocks.length ? `Timing (${tool}'s analysis): ${timing.met ? 'all constraints met' : `${timing.timingErrors} constraint(s) not met`}, minimum period ${timing.minPeriodNs} ns (${timing.maxFreqMHz} MHz).`
        : 'Timing: no clock to time.');
      for (const c of timing.constraints.filter(x => x.timingErrors)) log(`WARNING:Timing - the clock ${c.name.replace(/^clock /, '')} reaches ${c.maxFreqMHz} MHz, not the ${c.constraintMHz} MHz of its constraint.`);
      log(`Timing report: ${report.files.timing}`);
    },
  };
}

const stageLine = s => `  ${s.kind.padEnd(12)} ${s.delay.toFixed(3).padStart(7)} ${s.arrival.toFixed(3).padStart(8)}  ${s.inst}.${s.pin}${s.site ? ` (${s.site})` : ''}${s.net ? `, net ${s.net}` : ''}${s.sources?.length ? `  <- ${s.sources.map(x => `${x.file}:${x.line}`).join(', ')}` : ''}`;

/** The Static Timing Report of nextpnr's analysis (open/timing.txt): the clocks, then each critical path, stage by stage. */
export function nextpnrTimingText({ top, part, tool, timing, paths }) {
  const out = [`Static timing of ${top} on ${part} after Place & Route: ${tool}'s timing analysis (its report), the worst path of each clock.`, ''];
  if (!timing.clocks.length) out.push('No clock: no path between two flip-flops to time.');
  for (const c of timing.clocks) {
    const k = timing.constraints.find(x => x.name === `clock ${c.clock}`);
    out.push(`Clock ${c.clock}: ${c.maxFreqMHz} MHz (${c.minPeriodNs.toFixed(3)} ns), ${k ? `constraint ${c.constraintMHz} MHz (${k.required.toFixed(3)} ns): ${k.timingErrors ? 'NOT met' : 'met'}, slack ${k.slackNs.toFixed(3)} ns` : 'no constraint'}`);
  }
  const head = '  kind           delay  arrival  to';
  for (const p of paths.paths) {
    out.push('', `Critical path of clock ${p.clock}${p.fromClock ? ` from clock ${p.fromClock}` : ''}${p.half ? ' (between its two edges)' : ''}: ${p.delay.toFixed(3)} ns${p.required == null ? ' (no constraint)' : `, required ${p.required.toFixed(3)} ns, slack ${p.slack.toFixed(3)} ns`}`, head, ...p.stages.map(stageLine));
  }
  for (const p of paths.inputs) out.push('', `Critical path from the inputs to clock ${p.clock}: ${p.delay.toFixed(3)} ns`, head, ...p.stages.map(stageLine));
  for (const p of paths.outputs) out.push('', `Critical path from clock ${p.clock} to the outputs: ${p.delay.toFixed(3)} ns`, head, ...p.stages.map(stageLine));
  for (const p of paths.through) out.push('', `Critical path from the inputs to the outputs: ${p.delay.toFixed(3)} ns`, head, ...p.stages.map(stageLine));
  out.push('', timing.timingErrors ? `${timing.timingErrors} constraint(s) not met.` : timing.constraints.length ? 'All constraints were met.' : 'No clock constraint.', '');
  return out.join('\n');
}

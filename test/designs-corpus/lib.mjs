// The logic of the design corpus runner (test/designs-corpus/run.mjs) that needs no design: the
// manifest's validation, the comparison of a run with the expectations (results and warnings), the
// normalization of warnings, the I/O wrapper of a design with more ports than the package has pins.
// Unit-tested on synthetic data (test/designs-corpus.test.js).
import { yosysScript, yosysFiles } from '../../packages/silinx-fpga/src/synth-open.js';

/** The stages of a design, in order. Each records 'pass' (the flow: 'complete') or a reason. */
export const STAGES = ['frontend', 'tb', 'synth', 'diff', 'flow'];

/** A status that the run must keep (a regression when it is lost). */
export const isGood = s => s === 'pass' || s === 'complete';

/** The first word of a status: pass, complete, skip, unsupported, mismatch, fail, error, too large. */
export const kindOf = s => (s === undefined ? 'none' : /^too large/.test(s) ? 'too large' : String(s).split(':')[0]);

// licences accepted in the corpus: permissive or copyleft open-source licences
const LICENCES = /\b(MIT|ISC|BSD|Apache|LGPL|GPL|MPL|CERN-OHL|Solderpad|Unlicense|CC0|OpenCores BSD-style|VTR benchmarks)\b/;
const PARTS = new Set(['xc3s100e', 'xc3s250e', 'xc3s500e', 'xc3s1200e', 'xc3s1600e']);
const SHA = /^[0-9a-f]{40}$/;

/** Problems of a manifest (test/designs-corpus/manifest.json): [] when it is valid. */
export function validateManifest(m) {
  const out = [];
  if (!m || typeof m !== 'object') return ['the manifest is not an object'];
  const sources = m.sources || {};
  if (!Object.keys(sources).length) out.push('no sources');
  for (const [id, s] of Object.entries(sources)) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(s.repo || '')) out.push(`source ${id}: repo must be owner/name`);
    if (!SHA.test(s.commit || '')) out.push(`source ${id}: commit must be a full commit hash (pinned), not '${s.commit}'`);
    if (!/^https:\/\//.test(s.url || '')) out.push(`source ${id}: url missing`);
    if (!LICENCES.test(s.licence || '')) out.push(`source ${id}: licence '${s.licence}' is not a recognised open-source licence`);
    if (!s.licenceFile) out.push(`source ${id}: licenceFile missing`);
  }
  const names = new Set();
  for (const d of m.designs || []) {
    const n = d.name || '?';
    if (!/^[\w.-]+$/.test(n)) out.push(`design ${n}: name must be a plain word`);
    if (names.has(n)) out.push(`design ${n}: name used twice`);
    names.add(n);
    if (!sources[d.source]) out.push(`design ${n}: unknown source '${d.source}'`);
    if (d.licence !== undefined && !LICENCES.test(d.licence)) out.push(`design ${n}: licence '${d.licence}' is not a recognised open-source licence`);
    if (!['verilog', 'vhdl', 'mixed'].includes(d.language)) out.push(`design ${n}: language must be verilog, vhdl or mixed`);
    if (!d.top) out.push(`design ${n}: top missing`);
    if (!Array.isArray(d.files) || !d.files.length) out.push(`design ${n}: files missing`);
    else {
      if (new Set(d.files).size !== d.files.length) out.push(`design ${n}: a file listed twice`);
      for (const f of d.files) if (f.split('/').includes('..') || f.startsWith('/')) out.push(`design ${n}: unsafe path ${f}`);
    }
    if (!d.size || !PARTS.has(d.size.target)) out.push(`design ${n}: size.target must be one of ${[...PARTS].join(', ')}`);
    if (d.generics && Object.values(d.generics).some(v => !Number.isInteger(v))) out.push(`design ${n}: generics must be integers`);
    if (d.periodNs !== undefined && !(Number.isFinite(d.periodNs) && d.periodNs > 0)) out.push(`design ${n}: periodNs must be a positive number of ns`);
    const tb = d.testbench;
    if (tb) {
      if (!tb.top) out.push(`design ${n}: testbench.top missing`);
      if (!tb.pass) out.push(`design ${n}: testbench.pass (what a passing run prints) missing`);
      if (!Array.isArray(tb.files) || !tb.files.length) out.push(`design ${n}: testbench.files missing`);
      try { new RegExp(tb.pass); if (tb.fail) new RegExp(tb.fail); } catch (e) { out.push(`design ${n}: testbench pattern: ${e.message}`); }
      if (tb.generics && Object.values(tb.generics).some(v => !Number.isInteger(v))) out.push(`design ${n}: testbench.generics must be integers`);
      if (tb.until && !/^\d+(\.\d+)?\s*(fs|ps|ns|us|ms)$/.test(tb.until)) out.push(`design ${n}: testbench.until must be a time such as '2 ms'`);
    }
  }
  if (!names.size) out.push('no designs');
  return out;
}

/** A time such as '2 ms' in the simulator's unit (ps). */
export function parseTime(s) {
  const m = /^(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|ms)$/.exec(String(s).trim());
  if (!m) throw new Error(`not a time: ${s}`);
  return Math.round(+m[1] * { fs: 1e-3, ps: 1, ns: 1e3, us: 1e6, ms: 1e9 }[m[2]]);
}

/**
 * A warning as it is recorded: one line, without absolute paths or the cache's folders, without
 * Yosys's generated numbers ($auto$…:123$456), bounded. Equal warnings of different runs are equal
 * strings.
 */
export function normalizeWarning(w) {
  return String(w)
    .replace(/\s+/g, ' ').trim()
    .replace(/(?:\/[^\s:'"/]+)*\/\.cache\/designs-corpus\/[^/\s]+\/[0-9a-f]{40}\//g, '')
    .replace(/(?:[A-Za-z]:)?(?:[\\/][^\s:'"\\/]+)+[\\/]([^\s:'"\\/]+)/g, '$1')
    .replace(/\$(auto|abc|techmap|flatten|opt|memory|proc)\$[^\s']*?(\$\d+)+/g, '$$$1')
    .replace(/\$(\w+)\$\d+/g, '$$$1')
    .slice(0, 300);
}

/** Warnings with repeats counted: ['message', 'other (x3)'] (sorted, stable between runs). */
export function countWarnings(list) {
  const n = new Map();
  for (const w of list) { const k = normalizeWarning(w); n.set(k, (n.get(k) || 0) + 1); }
  return [...n].map(([k, c]) => (c > 1 ? `${k} (x${c})` : k)).sort();
}

/**
 * The results of a run against the expectations. Both: { design: { stage: status, …,
 * warnings: { stage: [warning] } } }. Returns { regressions, improvements, changed, newWarnings,
 * vanishedWarnings, fresh, missing, failed } where regressions are stages expected good (pass /
 * complete) that are not, improvements stages good now that were not, changed other status changes,
 * newWarnings / vanishedWarnings [{ design, stage, warning }], fresh designs not in the
 * expectations, missing expected designs that did not run (only when `ran` lists what ran);
 * failed: the run must fail (a regression or a warning that appeared or vanished).
 */
export function compareExpectations(expected, results, { ran = null } = {}) {
  const regressions = [], improvements = [], changed = [], newWarnings = [], vanishedWarnings = [], fresh = [], missing = [];
  for (const [d, r] of Object.entries(results)) {
    const e = expected[d];
    if (!e) { fresh.push(d); continue; }
    for (const st of STAGES) {
      const a = e[st], b = r[st];
      if (a === b) continue;
      if (isGood(a) && !isGood(b)) regressions.push({ design: d, stage: st, expected: a, got: b });
      else if (!isGood(a) && isGood(b)) improvements.push({ design: d, stage: st, expected: a, got: b });
      else changed.push({ design: d, stage: st, expected: a, got: b });
    }
    for (const st of STAGES) {
      const ew = e.warnings?.[st] || [], rw = r.warnings?.[st] || [];
      const left = new Map();
      for (const w of ew) left.set(w, (left.get(w) || 0) + 1);
      for (const w of rw) {
        if (left.get(w)) left.set(w, left.get(w) - 1);
        else newWarnings.push({ design: d, stage: st, warning: w });
      }
      for (const [w, k] of left) for (let i = 0; i < k; i++) vanishedWarnings.push({ design: d, stage: st, warning: w });
    }
  }
  if (ran) for (const d of Object.keys(expected)) if (ran.includes(d) && !results[d]) missing.push(d);
  const failed = regressions.length + newWarnings.length + vanishedWarnings.length + missing.length > 0;
  return { regressions, improvements, changed, newWarnings, vanishedWarnings, fresh, missing, failed };
}

/** The expectations after a run: the results of the designs that ran, the others kept. Times and
 *  details are not expectations; the quality of the circuit is (when the flow ran: the run's, none
 *  when it did not complete). */
export function updatedExpectations(expected, results) {
  const out = { ...expected };
  for (const [d, r] of Object.entries(results)) {
    // a stage that did not run (--stages) keeps its expectation
    const old = expected[d] || {}, e = {}, w = {};
    for (const st of STAGES) {
      const ranSt = r[st] !== undefined;
      if (ranSt) e[st] = r[st]; else if (old[st] !== undefined) e[st] = old[st];
      const ws = ranSt ? r.warnings?.[st] : old.warnings?.[st];
      if (ws?.length) w[st] = ws;
    }
    if (Object.keys(w).length) e.warnings = w;
    const q = r.flow !== undefined ? r.quality : old.quality;
    if (q) e.quality = q;
    out[d] = e;
  }
  return Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]));
}

/**
 * Verilog of a wrapper that gives a design with more port bits than the package has pins a few
 * pins: the inputs (all but the clocks) are loaded serially from one pin through a shift register,
 * the outputs are registered and XOR-reduced to one pin, so no logic is optimised away. It is how
 * the back end (pack, place, route, bitgen) is tested on such designs; the design's behaviour is
 * checked before, on its own ports (diff stage). ports: [{ name, dir: 'in' | 'out' | 'inout', w }],
 * clocks: names of the clock inputs (kept as pins), generics: { NAME: integer }. Returns
 * { name, text } (ports clk, din, dout plus each clock other than the first).
 */
export function ioWrapper(top, ports, { clocks = [], generics = {}, name = 'corpus_io_wrap' } = {}) {
  const lc = new Set(clocks.map(c => c.toLowerCase()));
  const ins = ports.filter(p => p.dir === 'in' && !lc.has(p.name.toLowerCase()));
  const outs = ports.filter(p => p.dir === 'out');
  const clks = ports.filter(p => p.dir === 'in' && lc.has(p.name.toLowerCase()));
  if (ports.some(p => p.dir === 'inout')) throw new Error('ioWrapper: inout ports');
  const nin = ins.reduce((s, p) => s + p.w, 0), nout = outs.reduce((s, p) => s + p.w, 0);
  const esc = n => (/^[A-Za-z_][\w$]*$/.test(n) ? n : `\\${n} `);
  const lines = [];
  lines.push(`// generated by test/designs-corpus (Silinx ISE): ${top} with its inputs loaded serially and its outputs XOR-reduced`);
  lines.push(`module ${name} (input wire clk, ${clks.slice(1).map(p => `input wire ${esc(p.name)}, `).join('')}input wire din, output reg dout);`);
  if (nin) lines.push(`  reg [${nin - 1}:0] sin = 0;`, `  always @(posedge clk) sin <= ${nin === 1 ? 'din' : `{sin[${nin - 2}:0], din}`};`);
  if (nout) lines.push(`  wire [${nout - 1}:0] sout;`, `  reg [${nout - 1}:0] sreg = 0;`, '  always @(posedge clk) begin sreg <= sout; dout <= ^sreg; end');
  else lines.push("  always @(posedge clk) dout <= 1'b0;");
  const conns = [];
  let i = 0;
  for (const p of ins) { conns.push(`.${esc(p.name)}(sin[${i + p.w - 1}:${i}])`); i += p.w; }
  i = 0;
  for (const p of outs) { conns.push(`.${esc(p.name)}(sout[${i + p.w - 1}:${i}])`); i += p.w; }
  clks.forEach((p, k) => conns.push(`.${esc(p.name)}(${k === 0 ? 'clk' : esc(p.name)})`));
  const gm = Object.entries(generics).map(([k, v]) => `.${k}(${v})`).join(', ');
  lines.push(`  ${esc(top)} ${gm ? `#(${gm}) ` : ''}dut (${conns.join(', ')});`);
  lines.push('endmodule');
  return { name, text: `${lines.join('\n')}\n` };
}

/** Verilog of a wrapper with the same ports as `top` that sets its generics (a Silinx project has no
 *  generics of its own). Returns { name, text }. */
export function paramWrapper(top, ports, generics, { name = 'corpus_param_wrap' } = {}) {
  const esc = n => (/^[A-Za-z_][\w$]*$/.test(n) ? n : `\\${n} `);
  const decl = p => `${p.dir === 'in' ? 'input' : p.dir === 'out' ? 'output' : 'inout'} wire ${p.w > 1 ? `[${p.w - 1}:0] ` : ''}${esc(p.name)}`;
  const gm = Object.entries(generics).map(([k, v]) => `.${k}(${v})`).join(', ');
  return {
    name,
    text: `// generated by test/designs-corpus (Silinx ISE): ${top} with its generics set\n`
      + `module ${name} (${ports.map(decl).join(', ')});\n`
      + `  ${esc(top)} ${gm ? `#(${gm}) ` : ''}dut (${ports.map(p => `.${esc(p.name)}(${esc(p.name)})`).join(', ')});\n`
      + 'endmodule\n',
  };
}

/** The UCF of a design's clock on the Basys2's oscillator pin (B8, a global clock pad; 50 MHz). No I/O
 *  standard: all the ports keep the default (LVCMOS25), so one bank voltage fits them all. */
// the devices of the flow, smallest first: a design too large for one is tried on the next (#7);
// the clock pad, B8, is the oscillator's on the Basys2 and the Nexys2
export const FLOW_PARTS = ['xc3s250ecp132-4', 'xc3s500efg320-4', 'xc3s1200efg320-4'];
/** 'xc3s500efg320-4' -> 'XC3S500E' */
export const chipOf = part => part.replace(/(cp|fg)\d+-\d$/, '').toUpperCase();
/** 'xc3s500efg320-4' -> a project's device { family, part, package, speed } */
export function deviceOf(part) {
  const m = /^(xc3s\d+e)(cp132|fg320)-(\d)$/.exec(part);
  if (!m) throw new Error(`not a device of the flow: ${part}`);
  return { family: 'spartan3e', part: m[1], package: m[2], speed: `-${m[3]}` };
}

// periodNs: the design's clock constraint, 20 ns (the Basys2's 50 MHz) unless the manifest gives one (#440:
// a design whose critical path is within a few per cent of 20 ns flips its 'not met' warning from one
// machine to another; its own PERIOD keeps it clear of that edge)
export function boardClockUcf(port, periodNs = 20) {
  return `# the clock on the Basys2's oscillator (generated by test/designs-corpus)\n`
    + `NET "${port}" LOC = "B8" ;\n`
    + `NET "${port}" CLOCK_DEDICATED_ROUTE = FALSE ;\n`
    + `NET "${port}" TNM_NET = "${port}" ;\n`
    + `TIMESPEC "TS_${port}" = PERIOD "${port}" ${periodNs} ns HIGH 50% ;\n`;
}

/**
 * Yosys's arguments and files to synthesize a flat module (core/synth-verilog.js toVerilog) with
 * extra synth_xilinx options (e.g. '-nobram -nolutram -nosrl'): the options go to every
 * synth_xilinx step of the script, -nosrl also leaves out Silinx's own shift-register mapping, and
 * the files are all those the script reads (yosysFiles: the module, the SRL map and cells, #62).
 */
export function flaggedSynth(top, text, flags, family = 'spartan3e') {
  const srl = !/(^|\s)-nosrl(\s|$)/.test(flags);
  const script = yosysScript(top, family, { srl }).replaceAll('synth_xilinx ', `synth_xilinx ${flags} `);
  return { args: ['-q', '-p', script], files: yosysFiles(top, text) };
}

// ---- the quality guard: the size and speed of the generated circuit

/** The default tolerances of the quality guard (fractions). Size (slices, LUTs, flip-flops after
 *  packing) does not depend on the placer's seed; the critical path does, by up to 12.5 % over
 *  seeds 1-3 (README): a change within these is placement noise, not reported. */
export const QUALITY_TOLERANCE = { slices: 0.05, luts: 0.05, ffs: 0.05, period: 0.15 };
const METRICS = [['slices', 'slices', ''], ['luts', 'LUTs', ''], ['ffs', 'flip-flops', ''], ['period', 'critical path', ' ns']];
const pct = x => `${x > 0 ? '+' : ''}${(100 * x).toFixed(1)}%`;

/** The quality of a design's circuit for the expectations: { part, slices, luts, ffs, period }
 *  (period: the critical path by Silinx's STA, ns, the worst of the clocks; null without a clock). */
export function qualityOf(part, packStats, staClocks) {
  const period = staClocks.length ? Math.max(...staClocks.map(c => c.period)) : null;
  return { part, slices: packStats.slices, luts: packStats.luts, ffs: packStats.ffs, period: period === null ? null : +period.toFixed(3) };
}

/** '131 slices, 259 LUTs, 79 FFs, 5.625 ns on the xc3s250ecp132-4' */
export function describeQuality(q) {
  return `${q.slices} slices, ${q.luts} LUTs, ${q.ffs} FFs${typeof q.period === 'number' ? `, ${q.period.toFixed(3)} ns` : ''} on the ${q.part}`;
}

/**
 * The quality of each design whose flow completed (results: { design: { quality } }, qualityOf's
 * shape) against the expectations' (the same shape). Returns { worse, better, moved, fresh, failed }:
 * worse / better [{ design, metric, expected, got, change, message }] beyond the tolerance (a fraction
 * per metric, QUALITY_TOLERANCE by default), moved [{ design, message }] built on another device than
 * recorded (not compared), fresh [{ design, message }] without a recorded quality; failed: a design
 * got larger or slower.
 */
export function compareQuality(expected, results, tolerance = {}) {
  const tol = { ...QUALITY_TOLERANCE, ...tolerance };
  const worse = [], better = [], moved = [], fresh = [];
  for (const [d, r] of Object.entries(results)) {
    const q = r.quality;
    if (!q) continue;
    const e = expected[d]?.quality;
    if (!e) { fresh.push({ design: d, message: `${d}: no recorded quality (${describeQuality(q)}): --update records it` }); continue; }
    if (e.part !== q.part) { moved.push({ design: d, message: `${d}: built on the ${q.part}, recorded on the ${e.part}: not compared` }); continue; }
    for (const [k, label, unit] of METRICS) {
      const a = e[k], b = q[k];
      if (typeof a !== 'number' || typeof b !== 'number' || a === b) continue;
      const change = a ? (b - a) / a : Infinity;
      if (Math.abs(change) <= tol[k] + 1e-9) continue;
      const fmt = x => (k === 'period' ? x.toFixed(3) : String(x));
      const item = { design: d, metric: k, expected: a, got: b, change };
      if (change > 0) worse.push({ ...item, message: `${d}: ${label} ${fmt(a)} -> ${fmt(b)}${unit} (${pct(change)}, tolerance ${pct(tol[k]).slice(1)})` });
      else better.push({ ...item, message: `${d}: ${label} ${fmt(a)} -> ${fmt(b)}${unit} (${pct(change)})` });
    }
  }
  return { worse, better, moved, fresh, failed: worse.length > 0 };
}

// ---- run times

/** Run-time warnings: a stage this many times slower than its baseline, and longer by more than this (ms). */
export const TIME_RATIO = 1.5, TIME_MARGIN = 30000;
const TIMED = ['synth', 'flow'];

/** The machine class of the time baselines (times.json): --machine, else SILINX_CORPUS_MACHINE,
 *  else 'ci' on a CI runner (CI=true: GitHub Actions), else 'local'. */
export function machineClass(arg, env = process.env) {
  return arg || env.SILINX_CORPUS_MACHINE || (env.CI === 'true' ? 'ci' : 'local');
}

/** The times of a run as a baseline: { design: { synth, flow, total } } in ms (total: all the
 *  stages), sorted by design. */
export function timesOf(results) {
  const out = {};
  for (const d of Object.keys(results).sort()) {
    const t = results[d].times || {};
    if (!Object.keys(t).length) continue;
    const o = {};
    for (const s of TIMED) if (t[s] !== undefined) o[s] = t[s];
    o.total = Object.values(t).reduce((a, b) => a + b, 0);
    out[d] = o;
  }
  return out;
}

/**
 * The run's times against a baseline (timesOf's shape): warnings [{ design, stage, baseline, got,
 * message }] for a synthesis or a flow more than `ratio` times its baseline and longer by more than
 * `margin` ms; unknown: the designs without a baseline. Never a failure: times depend on the machine
 * and its load.
 */
export function compareTimes(baseline, results, { ratio = TIME_RATIO, margin = TIME_MARGIN } = {}) {
  const warnings = [], unknown = [];
  for (const [d, r] of Object.entries(results)) {
    const b = baseline?.[d];
    if (!b) { if (r.times && Object.keys(r.times).length) unknown.push(d); continue; }
    for (const s of TIMED) {
      const got = r.times?.[s], was = b[s];
      if (typeof got !== 'number' || typeof was !== 'number') continue;
      if (got > ratio * was && got - was > margin) warnings.push({ design: d, stage: s, baseline: was, got, message: `${d} ${s}: ${(got / 1000).toFixed(0)} s, baseline ${(was / 1000).toFixed(0)} s (x${(got / was).toFixed(1)})` });
    }
  }
  return { warnings, unknown };
}

/** The slowest designs of a run as lines of a table: seconds per stage, the total, the baseline's total. */
export function slowestTable(results, baseline = {}, n = 10) {
  const sec = ms => (typeof ms === 'number' ? (ms / 1000).toFixed(0) : '-');
  const times = timesOf(results);
  const rows = Object.keys(times).sort((a, b) => times[b].total - times[a].total || (a < b ? -1 : 1)).slice(0, n);
  const cols = [...STAGES, 'total', 'baseline'];
  return [`${'design'.padEnd(24)} ${cols.map(s => s.padStart(8)).join(' ')}`,
    ...rows.map(d => `${d.padEnd(24)} ${[...STAGES.map(s => results[d].times[s]), times[d].total, baseline?.[d]?.total].map(x => sec(x).padStart(8)).join(' ')}`)];
}

// ---- the README's results table (#89): generated from the expectations, so it cannot drift
export const TABLE_BEGIN = '<!-- the results table: generated from expected.json by `node test/designs-corpus/run.mjs --table`; do not edit by hand -->';
export const TABLE_END = '<!-- end of the results table -->';
const LANG = { verilog: 'Verilog', vhdl: 'VHDL' };
// the licence's name, without its explanation ('BSD-3-Clause-style (OpenCores …)', 'VTR benchmarks: …')
const licenceOf = l => String(l || '').split(/[:(]/)[0].trim();
/** The number of warnings of a countWarnings list ('… (x3)' counts 3). */
const nWarnings = list => (list || []).reduce((s, w) => s + (+(/ \(x(\d+)\)$/.exec(w)?.[1] ?? 1)), 0);

/**
 * The results table of the README (Markdown lines) from the manifest (the designs, in its order,
 * their language and licence) and the expectations (expected.json: each stage's status, the
 * warnings, the circuit's quality), with a summary line: [lines]. '(r)': synthesized again without
 * RAM / SRL / multiplier cells for the packer.
 */
export function resultsTable(manifest, expected) {
  const cell = s => (s === undefined || /^skip/.test(s) ? '-' : kindOf(s));
  const rows = ['| design | lang | licence | frontend | tb | synth | diff | flow | device | slices | LUTs | FFs | critical path (ns) | warnings |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |'];
  const n = { designs: 0, frontend: 0, tbRan: 0, tb: 0, synth: 0, diff: 0, complete: 0, tooLarge: 0, other: 0, onChip: {} };
  for (const d of manifest.designs) {
    const e = expected[d.name] || {};
    const q = e.quality;
    const w = e.warnings || {};
    const total = Object.values(w).reduce((s, l) => s + nWarnings(l), 0);
    const per = STAGES.filter(s => w[s]?.length).map(s => `${s} ${nWarnings(w[s])}`);
    const retry = (w.flow || []).some(x => /synthesized again with -nobram/.test(x));
    const flow = cell(e.flow);
    const chip = q ? chipOf(q.part) : '';
    rows.push(`| ${d.name} | ${LANG[d.language] || d.language} | ${licenceOf(manifest.sources[d.source]?.licence)} | ${cell(e.frontend)} | ${cell(e.tb)} | ${cell(e.synth)} | ${cell(e.diff)} | ${flow}${retry ? ' (r)' : ''} | ${chip} | ${q ? q.slices : ''} | ${q ? q.luts : ''} | ${q ? q.ffs : ''} | ${typeof q?.period === 'number' ? q.period.toFixed(3) : ''} | ${total}${per.length ? ` (${per.join(', ')})` : ''} |`);
    n.designs++;
    if (e.frontend === 'pass') n.frontend++;
    if (e.tb !== undefined && !/^skip/.test(e.tb)) { n.tbRan++; if (e.tb === 'pass') n.tb++; }
    if (e.synth === 'pass') n.synth++;
    if (e.diff === 'pass') n.diff++;
    if (isGood(String(e.flow).split(':')[0])) { n.complete++; if (chip) n.onChip[chip] = (n.onChip[chip] || 0) + 1; }
    else if (flow === 'too large') n.tooLarge++;
    else if (e.flow !== undefined && !/^skip/.test(e.flow)) n.other++;
  }
  const chips = FLOW_PARTS.map(chipOf).filter(c => n.onChip[c]).map(c => `${n.onChip[c]} on the ${c}`).join(', ');
  return [...rows, '',
    `Summary: ${n.designs} designs; front end ${n.frontend} / ${n.designs}; own testbenches ${n.tb} / ${n.tbRan} pass; synthesis ${n.synth}; netlist = RTL ${n.diff}; fully open bitstream complete for ${n.complete} designs${chips ? ` (${chips})` : ''}${n.tooLarge ? `, ${n.tooLarge} too large` : ''}${n.other ? `, ${n.other} failing` : ''}.`];
}

// a generated part of the README: the lines between its two markers
function withBlock(readme, begin, end, lines, what) {
  const a = readme.indexOf(begin), b = readme.indexOf(end);
  if (a < 0 || b < a) throw new Error(`the README has no ${what} markers`);
  return `${readme.slice(0, a + begin.length)}\n${lines.join('\n')}\n${readme.slice(b)}`;
}
function readmeBlock(readme, begin, end) {
  const a = readme.indexOf(begin), b = readme.indexOf(end);
  return a < 0 || b < a ? null : readme.slice(a + begin.length, b).replace(/^\n|\n$/g, '').split('\n');
}

/** The README with its results table replaced by `lines` (between TABLE_BEGIN and TABLE_END). */
export const withResultsTable = (readme, lines) => withBlock(readme, TABLE_BEGIN, TABLE_END, lines, 'results table');

/** The results table of a README (the lines between the markers), or null. */
export const readmeResultsTable = readme => readmeBlock(readme, TABLE_BEGIN, TABLE_END);

// ---- the README's run times (#105): generated from the baselines (times.json), so they cannot go stale
export const TIMES_BEGIN = '<!-- the run times: generated from times.json by `node test/designs-corpus/run.mjs --table`; do not edit by hand -->';
export const TIMES_END = '<!-- end of the run times -->';

/**
 * The run times of the README (Markdown lines) from the baselines (times.json: { class: { design:
 * { synth, flow, total } } }, ms): per machine class, its designs and the sum of their synthesis,
 * flow and total times; then the `n` slowest designs (by their longest total in any class), their
 * synthesis / flow / total in each class (s). [lines]
 */
export function timesTable(allTimes, n = 8) {
  const classes = Object.keys(allTimes).sort();
  const sec = ms => (typeof ms === 'number' ? (ms / 1000).toFixed(0) : '-');
  const sum = (t, k) => Object.values(t).reduce((s, x) => s + (x[k] || 0), 0);
  const out = ['| machine class | designs | synthesis (s) | flow (s) | all the stages (s) |', '| --- | ---: | ---: | ---: | ---: |',
    ...classes.map(c => `| \`${c}\` | ${Object.keys(allTimes[c]).length} | ${sec(sum(allTimes[c], 'synth'))} | ${sec(sum(allTimes[c], 'flow'))} | ${sec(sum(allTimes[c], 'total'))} |`)];
  const longest = d => Math.max(...classes.map(c => allTimes[c][d]?.total ?? 0));
  const designs = [...new Set(classes.flatMap(c => Object.keys(allTimes[c])))].sort((a, b) => longest(b) - longest(a) || (a < b ? -1 : 1)).slice(0, n);
  if (!designs.length) return out;
  return [...out, '', `The ${designs.length} slowest designs (s: synthesis / flow / all the stages):`, '',
    `| design | ${classes.map(c => `\`${c}\``).join(' | ')} |`, `| --- |${classes.map(() => ' ---: |').join('')}`,
    ...designs.map(d => `| ${d} | ${classes.map(c => { const t = allTimes[c][d]; return t ? `${sec(t.synth)} / ${sec(t.flow)} / ${sec(t.total)}` : '-'; }).join(' | ')} |`)];
}

/** The README with its run times replaced by `lines` (between TIMES_BEGIN and TIMES_END). */
export const withTimesTable = (readme, lines) => withBlock(readme, TIMES_BEGIN, TIMES_END, lines, 'run times');

/** The run times of a README (the lines between the markers), or null. */
export const readmeTimesTable = readme => readmeBlock(readme, TIMES_BEGIN, TIMES_END);

// the placer's 'too few pads' errors: the package's pads, or those of the banks with a fitting VCCO
// (#128: 'no pad for N I/O(s) of …'); the design corpus then implements the design in its I/O wrapper
export const PADS_SHORT = /not enough pads|place: no pad for \d+ I\/O/;

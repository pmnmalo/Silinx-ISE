// FSM extraction and re-encoding (#438): Yosys's `fsm` pass (in synth_xilinx's prepare step) never extracts a
// state machine from Silinx's netlists: the front end (core/synth-verilog.js) gives every register its power-up
// value (an `init`), and fsm_detect refuses a register that has one. This measures, without changing the open
// synthesis, what extracting and re-encoding the state machines would give, on the examples and the design corpus.
//
// How the machines are extracted with their power-up state kept: the open synthesis's own Yosys script, its first
// step (synth_xilinx … -run :fine) split around `fsm` (the steps of synth_xilinx's prepare, written out):
//   1. up to `opt -nodffe -nosdff`, the design written (RTLIL); fsm_detect run with the init values (what happens
//      today: nothing marked) and without them (what Yosys would extract: marked, or refused and why);
//   2. the machines chosen lose their init value and are marked (`fsm_encoding auto`); `fsm -nodetect -encoding
//      <e> -encfile` extracts, optimizes and re-encodes them, and writes each one's old -> new state codes;
//   3. each re-encoded state register gets as init the new code of its old init state (its don't-cares 0), the
//      rest of prepare and of the open synthesis's script run as they are (tables, SRL16E, LUT mapping, and at
//      High the other mappings, from the netlist so written).
// The ways:
//   stock        the open synthesis as it is
//   base         the split script with nothing extracted: the same circuit, but the RTLIL round trip and the steps
//                of prepare written out order the cells otherwise, and ABC's mapping moves with the order (traffic
//                110 -> 112 LUTs, pong 282 -> 276); the reference of the ways below, stock -> base the noise
//   binary       the machines fsm_detect marks, re-encoded by Yosys in binary (its own codes, after fsm_opt)
//   onehot       the same in one-hot (= Yosys's `auto` choice: one-hot for a state register under 32 bits)
//   onehot-port  also the registers refused only because a port reads them ("connected to module port", maybe
//                with "users don't benefit"), marked by hand as a front end could mark a state machine
// Each netlist is simulated against the RTL from power-up (test/diff-synth.js compareNetlist) and taken through
// the open back end (pack, place and route, seeds 1-3; Silinx's static timing analysis of the routed design).
//
//   node research/synth-quality/fsm.mjs --detect [--filter a,b]       which registers fsm_detect marks, every design
//   node research/synth-quality/fsm.mjs [--filter a,b] [--ways base,onehot] [--seeds 1,2,3] [--effort normal|high]
//        [--all] [--redo] [--routed dir] [--results file]   (--redo: the ways an earlier run measured too; default: the designs with a register marked; --routed: the routed designs of the
//        first seed written as <dir>/<design>__<way>__s<seed>/routed.xdl, for ISE's trce: fsm-ise.mjs)
//   node research/synth-quality/fsm.mjs --table                       the Markdown tables of the results
//
// The corpus on the XC3S1200E-FG320 with its I/O wrapper where needed (as test/designs-corpus/compare-ise.mjs, so
// that ISE's numbers of ise-comparison.json compare), the examples on their own board's part.
// The corpus's sources: npm run fetch:designs. Research, not a test: nothing fails on a worse result.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from './abc9.mjs';
import { keepDepth, DEPTH_RULE } from '../../packages/silinx-fpga/src/synth-open.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const DETECT_FILE = path.join(HERE, 'fsm-detect.json');
const RESULTS_FILE = path.join(HERE, 'fsm-results.json');
export const WAYS = ['stock', 'base', 'binary', 'onehot', 'onehot-port', 'core'];
const CORPUS_PART = 'xc3s1200efg320-4';

// the parsers and the RTLIL edits, now the open synthesis's own (#539: packages/silinx-fpga/src/synth-fsm.js)
import { PREP_HEAD, PREP_TAIL, FSM_PRE_FILE as PRE_IL, FSM_MARKED_FILE as MARKED_IL, FSM_POST_FILE as POST_IL, FSM_ENC_FILE as ENC, parseDetect, markWires, parseEncfile, newInit, setInits, rtlilName as ESC } from '../../packages/silinx-fpga/src/synth-fsm.js';
export { parseDetect, markWires, parseEncfile, newInit, setInits };
const PORT = 'Register is connected to module port.';
const BENEFIT = "Users of register don't seem to benefit from recoding.";
const INIT = 'Register has an initialization value.';

/** The wires extracted by a way, from the detection without init values. */
export function chosen(way, det) {
  if (way === 'base' || way === 'stock' || way === 'core') return [];
  const extra = way === 'onehot-port'
    ? det.refused.filter(r => r.reasons.includes(PORT) && r.reasons.every(x => x === PORT || x === BENEFIT)).map(r => r.wire) : [];
  return [...det.marked, ...extra];
}

/**
 * run() for synthesizeOpen (core/synth-front.js) that extracts the state machines of `way`: the run of its first
 * step (the script with `synth_xilinx … -run :fine`) made in three, the others (the remappings from the netlist
 * written before the LUT mapping) as they are. Each first step's detection and machines are pushed to `record`.
 */
export function fsmRun(base, way, record = []) {
  const encoding = way === 'binary' ? 'binary' : 'one-hot';
  if (way === 'stock' || way === 'core') return base;
  return async (args, files, say = () => {}) => {
    const p = args.indexOf('-p');
    // (the memories left to logic counted between synth_xilinx's memory steps, #54: one step again, not counted)
    const script = (args[p + 1] || '').replace(/ -run :map_ffram; tee -q -o silinx_memories\.txt [^;]*; synth_xilinx [^;]*? -run map_ffram:fine;/, ' -run :fine;');
    const m = /^(.*?)read_verilog -sv (\S+)_syn\.v; (synth_xilinx [^;]*?) -run :fine; (.*)$/s.exec(script);
    if (!m) return base(args, files, say);
    const [, libs, top, synth, rest] = m;
    const run = async (s, f) => {
      const lines = [];
      const out = await base(['-p', s], { ...files, ...f }, l => lines.push(l));
      return { out, lines };
    };
    // 1. the design up to fsm, fsm_detect with and without the init values
    const r1 = await run(`${libs}read_verilog -sv ${top}_syn.v; ${synth} -run :prepare; ${PREP_HEAD}; write_rtlil ${PRE_IL}; tee -o silinx_fsm_now.log fsm_detect; setattr -unset init; tee -o silinx_fsm_noinit.log fsm_detect`);
    const now = parseDetect((r1.out['silinx_fsm_now.log'] || '').split('\n'), top);
    const det = parseDetect((r1.out['silinx_fsm_noinit.log'] || '').split('\n'), top);
    // (a register marked already with its init values, one without any, is "already marked" the second time)
    det.marked = [...new Set([...now.marked, ...det.marked])];
    const rec = { top, now: { marked: now.marked, refusedInit: now.refused.filter(r => r.reasons.includes(INIT)).map(r => r.wire) }, detect: det, fsms: [] };
    record.push(rec);
    // 2. the chosen machines extracted and re-encoded; a register whose init state is not one of its states (a
    // VHDL integer starting at integer'left, never written again) cannot keep its power-up state: left out, and
    // the others extracted again without it
    let names = chosen(way, det), il, inits, r2, enc;
    rec.dropped = [];
    for (;;) {
      ({ il, inits } = markWires(r1.out[PRE_IL], names));
      r2 = await run(`read_rtlil ${MARKED_IL}; ${names.length ? `fsm -nodetect -encoding ${encoding} -encfile ${ENC}` : 'fsm'}; write_rtlil ${POST_IL}`, { [MARKED_IL]: il });
      enc = parseEncfile(r2.out[ENC]);
      const bad = names.filter(n => enc[n] && inits[ESC(n)] && !newInit(inits[ESC(n)], enc[n]));
      if (!bad.length) break;
      rec.dropped.push(...bad.map(n => ({ wire: n, init: inits[ESC(n)] })));
      names = names.filter(n => !bad.includes(n));
    }
    // the machines extracted (fsm_extract's log: each one's reset state and state codes)
    const ext = {};
    let cur = null;
    for (const l of r2.lines) {
      let x;
      if ((x = /^Extracting FSM `(\S+)' from module/.exec(l))) ext[x[1]] = cur = { codes: 0, reset: null };
      else if (cur && (x = /found reset state: (\S+)/.exec(l))) cur.reset = x[1];
      else if (cur && /found state code: /.test(l)) cur.codes++;
    }
    // 3. each extracted register's power-up state: the new code of its old init state, or the old init when its
    // codes did not change (fsm_recode keeps an encoding that is already packed binary: no -encfile entry), then
    // the rest of the script; a register chosen but not extracted gets its init back
    const newInits = {};
    for (const name of names) {
      const key = ESC(name), old = inits[key], map = enc[name];
      if (old) {
        const n = map ? newInit(old, map) : old;
        if (!n) throw new Error(`fsm: the init state ${old} of ${name} is not one of its states after fsm_opt`);
        newInits[key] = n;
      }
      if (!ext[key]) continue;
      rec.fsms.push({ wire: name, states: map ? map.length : ext[key].codes, bitsBefore: map ? map[0][0].length : null, bitsAfter: map ? map[0][1].length : null,
        recoded: !!map, init: old ?? null, newInit: newInits[key] ?? null, reset: ext[key].reset });
    }
    rec.notExtracted = names.filter(n => !ext[ESC(n)]);
    const post = setInits(r2.out[POST_IL], newInits);
    const s3 = `read_rtlil ${POST_IL}; ${PREP_TAIL}; ${synth} -run map_dsp:fine; ${rest}`;
    const a = [...args];
    a[p + 1] = s3;
    return base(a, { ...files, [POST_IL]: post }, say);
  };
}

// --------------------------------------------------------------------------------------------- the tables
const f = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const geo = xs => (xs.length ? Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length) : NaN);
const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b ? `${a >= b ? '+' : '−'}${Math.abs(100 * (a / b - 1)).toFixed(1)} %` : '–');

export function detectTable(det) {
  const L = ['| design | state registers marked today | refused for their init value | marked without init values | refused: port | refused: no benefit | refused: other |', '|---|---:|---:|---|---:|---:|---:|'];
  const tot = { now: 0, init: 0, marked: 0, port: 0, benefit: 0, other: 0, designs: 0 };
  for (const [name, r] of Object.entries(det)) {
    if (r.error) { L.push(`| ${name} | (${r.error}) | | | | | |`); continue; }
    const d = r.detect;
    const port = d.refused.filter(x => x.reasons.includes(PORT)).length;
    const benefit = d.refused.filter(x => x.reasons.includes(BENEFIT) && !x.reasons.includes(PORT)).length;
    const other = d.refused.length - port - benefit;
    Object.assign(tot, { now: tot.now + r.now.marked.length, init: tot.init + r.now.refusedInit.length, marked: tot.marked + d.marked.length, port: tot.port + port, benefit: tot.benefit + benefit, other: tot.other + other, designs: tot.designs + (d.marked.length ? 1 : 0) });
    if (!d.marked.length && !port) continue;
    L.push(`| ${name} | ${r.now.marked.length} | ${r.now.refusedInit.length} | ${d.marked.length}${d.marked.length ? ` (${d.marked.slice(0, 4).map(w => `\`${w}\``).join(', ')}${d.marked.length > 4 ? ', …' : ''})` : ''} | ${port} | ${benefit} | ${other} |`);
  }
  L.push(`| **all ${Object.keys(det).length} designs** | **${tot.now}** | **${tot.init}** | **${tot.marked}** (in ${tot.designs} designs) | ${tot.port} | ${tot.benefit} | ${tot.other} |`);
  return L.join('\n');
}

export function resultsTable(results, ways = WAYS, ise = {}) {
  const L = ['| design | way | machines (states: bits) | LUTs | FFs | slices | period (ns, seeds 1-3) | slices vs base | period vs base | netlist vs RTL (reset first / power-up) |', '|---|---|---|---:|---:|---:|---:|---:|---:|---|'];
  for (const [name, r] of Object.entries(results)) {
    for (const w of ways) {
      const m = r[w];
      if (!m) continue;
      if (m.same) { L.push(`| ${name} | ${w} | as ${m.same} | | | | | | | |`); continue; }
      if (m.error) { L.push(`| ${name} | ${w} | (${m.error}) | | | | | | | |`); continue; }
      // (the reference: base, or stock when base was not measured: --ways stock,core)
      const ref = r.base || r.stock;
      const mach = w === 'core' ? (m.core ? `${m.core.machines.map(x => x.states).join(', ')}: ${m.core.kept ? 'one-hot kept' : 'tried'}` : '')
        : w === 'base' || w === 'stock' ? '' : [...(m.fsms || []).map(x => `${x.states}: ${x.recoded ? `${x.bitsBefore}→${x.bitsAfter}` : 'kept'}`), ...(m.dropped?.length ? [`${m.dropped.length} left out (init not a state)`] : [])].join(', ');
      L.push(`| ${name} | ${w} | ${mach} | ${f(m.luts)} | ${f(m.ffs)} | ${f(m.slices)} | ${f(m.period, 2)} | ${m === ref ? '' : pct(m.slices, ref?.slices)} | ${m === ref ? '' : pct(m.period, ref?.period)} | ${m.diff ?? '–'} / ${m.diffPowerUp ?? '–'} |`);
    }
    const x = ise[name];
    if (x) L.push(`| ${name} | XST | ${x.fsm || ''} | ${f(x.luts)} | ${f(x.ffs)} | ${f(x.slices)} | ${f(x.periodNs, 2)} | | | |`);
  }
  const val = (r, w) => (r[w]?.same ? r[r[w].same] : r[w]);
  const done = Object.entries(results).filter(([, r]) => ways.every(w => Number.isFinite(val(r, w)?.period)));
  const means = (rows, w, ref = r => r.base || r.stock) => ['luts', 'ffs', 'slices', 'period'].map(k => f(geo(rows.map(r => w(r)[k] / ref(r)[k]).filter(x => Number.isFinite(x) && x > 0)), 3)).join(' / ');
  L.push("", `Geometric means against \`${ways.includes("base") ? "base" : "stock"}\` (${done.length} designs measured every way): LUTs / FFs / slices / period`, '');
  for (const w of ways.filter(x => x !== (ways.includes('base') ? 'base' : 'stock'))) L.push(`- ${w}: ${means(done.map(([, r]) => r), r => val(r, w))}`);
  // the machines today kept out by their init value (re-encoded by onehot), and those Yosys extracts already
  // (onehot: its auto choice, the same netlist as base)
  if (ways.includes('onehot')) {
    const blocked = done.filter(([, r]) => (r.onehot.fsms || []).some(x => x.init)).map(([, r]) => r);
    const already = done.filter(([, r]) => !(r.onehot.fsms || []).some(x => x.init) && (r.onehot.fsms || []).length).map(([, r]) => r);
    L.push('', `- the ${blocked.length} designs whose machines the init values keep out today: onehot ${means(blocked, r => r.onehot)}${ways.includes('binary') ? `, binary ${means(blocked, r => r.binary)}` : ''}`);
    L.push(`- the ${already.length} whose machines Yosys extracts today (Verilog registers with no initial value): onehot ${means(already, r => r.onehot)}${ways.includes('binary') ? `, binary ${means(already, r => r.binary)}` : ''}`);
    // the open synthesis trying both and keeping the better by DEPTH_RULE (given the routed periods, LUTs and slices)
    const keep = r => keepDepth([r.base.period, r.onehot.period], [r.base.luts, r.onehot.luts], DEPTH_RULE, [r.base.slices, r.onehot.slices]);
    const kept = blocked.filter(keep);
    L.push(`- both tried and the better kept (DEPTH_RULE on the routed periods, LUTs and slices): onehot kept on ${kept.length} of the ${blocked.length}; ${means(blocked, r => (keep(r) ? r.onehot : r.base))}`);
    // the same choice between stock and base, two netlists of the same circuit (only the cells' order differs): what
    // keeping the better of two draws gives by chance alone
    if (ways.includes('stock')) {
      const keepS = r => keepDepth([r.base.period, r.stock.period], [r.base.luts, r.stock.luts], DEPTH_RULE, [r.base.slices, r.stock.slices]);
      L.push(`- the same choice between stock and base (the same circuit, the noise alone): stock kept on ${blocked.filter(keepS).length} of the ${blocked.length}; ${means(blocked, r => (keepS(r) ? r.stock : r.base))}`);
    }
    const xst = done.map(([n, r]) => [r, ise[n]]).filter(([, x]) => x && Number.isFinite(x.slices) && Number.isFinite(x.periodNs))
      .map(([r, x]) => ({ r, x: { ...x, period: x.periodNs } }));
    if (xst.length) {
      const best = r => (blocked.includes(r) && keep(r) ? r.onehot : r.base);
      L.push(`- against XST (${xst.length} designs that ISE builds): base ${means(xst, e => e.r.base, e => e.x)}, onehot ${means(xst, e => e.r.onehot, e => e.x)}, the better kept ${means(xst, e => best(e.r), e => e.x)}`);
    }
  }
  return L.join('\n');
}

// ------------------------------------------------------------------------------------------- the measurement
async function main(argv) {
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  if (argv.includes('--table')) {
    const det = fs.existsSync(DETECT_FILE) ? JSON.parse(fs.readFileSync(DETECT_FILE, 'utf8')) : {};
    const file = arg('--results') ? path.resolve(arg('--results')) : RESULTS_FILE;
    const res = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const ways = arg('--ways') ? arg('--ways').split(',') : WAYS;
    console.log(`${detectTable(det)}\n\n${resultsTable(res, ways, iseNumbers())}`);
    return;
  }
  const only = arg('--filter') ? arg('--filter').split(',') : null;
  const ways = arg('--ways') ? arg('--ways').split(',') : WAYS;
  const seeds = (arg('--seeds') || '1,2,3').split(',').map(Number);
  const effort = arg('--effort', 'normal');
  const routedDir = arg('--routed', null);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/designs-corpus/manifest.json'), 'utf8'));
  const { toVerilog } = await import('../../core/synth-verilog.js');
  const { synthesizeOpen } = await import('../../core/synth-front.js');
  const { utilization, yosysFiles, SRL_CELLS_FILE } = await import('../../packages/silinx-fpga/src/synth-open.js');
  const { yosysNode } = await import('../../packages/silinx-fpga/src/synth-open-node.js');
  const { designs, compile, elaborate, primitiveSources, lib } = await load(manifest.designs.map(d => d.name));
  const pick = designs.filter(d => !only || only.some(o => d.name === o || d.name === `examples/${o}`));

  if (argv.includes('--detect')) {
    const det = fs.existsSync(DETECT_FILE) ? JSON.parse(fs.readFileSync(DETECT_FILE, 'utf8')) : {};
    for (const d of pick) {
      if (d.error) { det[d.name] = { error: d.error }; continue; }
      const rec = [];
      try {
        // (the first step alone: the detection is recorded before the script goes on; the rest is cut short)
        const { text, top } = toVerilog(d.design);
        const stop = async (a, files, say) => (a[a.indexOf('-p') + 1].startsWith(`read_rtlil ${POST_IL}`) ? {} : yosysNode(a, files, say));
        await fsmRun(stop, 'base', rec)(['-q', '-p', `read_verilog -lib ${SRL_CELLS_FILE}; read_verilog -sv ${top}_syn.v; synth_xilinx -family xc3se -ise -flatten -top ${top} -run :fine; -`], yosysFiles(top, text));
        const { top: _top, ...r } = rec[0];
        det[d.name] = r;
        console.log(d.name, JSON.stringify({ now: [r.now.marked.length, r.now.refusedInit.length], marked: r.detect.marked, refused: r.detect.refused.length }));
      } catch (e) { det[d.name] = { error: e.message.replace(/\s+/g, ' ').slice(0, 120) }; console.log(d.name, det[d.name].error); }
      fs.writeFileSync(DETECT_FILE, `${JSON.stringify(det, null, 1)}\n`);
    }
    console.log(`\n${detectTable(det)}`);
    return;
  }


  const { compareNetlist } = await import('../../test/diff-synth.js');
  const { readYosysJson } = await import('../../packages/silinx-fpga/src/fpga/netlist.js');
  const { pack } = await import('../../packages/silinx-fpga/src/fpga/pack.js');
  const { deviceSites } = await import('../../packages/silinx-fpga/src/fpga/place.js');
  const { placeRouteBest } = await import('../../packages/silinx-fpga/src/fpga/place-route.js');
  const { loadDeviceCache } = await import('../../packages/silinx-fpga/src/fpga/device-node.js');
  const { knownRouting } = await import('../../packages/silinx-fpga/src/fpga/bitgen.js');
  const { analyzeTiming, delayTable } = await import('../../packages/silinx-fpga/src/fpga/timing.js');
  const { writeXdl, parseXdl } = await import('../../packages/silinx-fpga/src/xdl.js');
  const { loadDb } = await import('../../packages/silinx-fpga/research/s3e-bitstream/db.mjs');
  const devices = new Map();
  const deviceOf = part => {
    if (!devices.has(part)) {
      const device = loadDeviceCache(part);
      const known = knownRouting(loadDb(part, { graph: device }));
      devices.set(part, { device, sites: deviceSites(device), known, delays: delayTable(device, { allowPip: known.allowPip }) });
    }
    return devices.get(part);
  };
  const det = fs.existsSync(DETECT_FILE) ? JSON.parse(fs.readFileSync(DETECT_FILE, 'utf8')) : {};
  const resultsFile = arg('--results') ? path.resolve(arg('--results')) : RESULTS_FILE;
  const results = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')) : {};
  for (const d of pick) {
    if (d.error) continue;
    const dd = det[d.name];
    if (!argv.includes('--all') && !only && !(dd?.detect?.marked?.length || chosen('onehot-port', dd?.detect || { marked: [], refused: [] }).length)) continue;
    results[d.name] = results[d.name] || {};
    // the design on the pads, or the corpus's I/O wrapper around it (as compare-ise.mjs: the XC3S1200E)
    const part = d.corpus ? CORPUS_PART : d.parts[0];
    const ports = d.design.top.ports.map(p => ({ name: p.name, dir: p.dir, w: p.sig.t.w }));
    let flowDesign = d.design, ucf = d.ucf ?? null, wrapped = null;
    if (d.corpus) {
      const c = d.corpus, pads = deviceOf(part).sites.pads;
      const bits = ports.reduce((s, p) => s + p.w, 0), outBits = ports.filter(p => p.dir !== 'in').reduce((s, p) => s + p.w, 0);
      const outPads = [...pads.values()].filter(p => !p.inputOnly).length;
      const clk = ports.find(p => p.dir === 'in' && p.w === 1 && c.clock && p.name.toLowerCase() === c.clock.toLowerCase())?.name;
      wrapped = () => {
        const clocks = [c.clock, ...(c.clocks || [])].filter(Boolean).filter(k => ports.some(p => p.name.toLowerCase() === k.toLowerCase()));
        const wrap = lib.ioWrapper(d.design.top.name, ports, { clocks, generics: c.generics || {} });
        const srcs = [...d.srcs, { path: 'corpus_io_wrap.v', lang: 'verilog', text: wrap.text }];
        return { flowDesign: elaborate(compile([...primitiveSources(srcs), ...srcs]), wrap.name), ucf: lib.boardClockUcf('clk') };
      };
      if (bits > pads.size || outBits > outPads || ports.some(p => p.dir === 'inout')) ({ flowDesign, ucf } = wrapped());
      else ucf = clk ? lib.boardClockUcf(clk) : null;
    }
    for (const way of ways) {
      // (onehot-port extracts what onehot does when no register is refused only for a port)
      if (way === 'onehot-port' && results[d.name].onehot && dd?.detect && chosen('onehot-port', dd.detect).length === chosen('onehot', dd.detect).length) {
        results[d.name][way] = { same: 'onehot' };
        continue;
      }
      if (results[d.name][way] && !results[d.name][way].error && !argv.includes('--redo')) continue;   // (measured by an earlier run)
      process.stdout.write(`${d.name} ${way} … `);
      const m = {};
      try {
        const rec = [];
        const t0 = Date.now();
        const bare = await synthesizeOpen(d.design, { run: fsmRun(yosysNode, way, rec), effort, fsm: way === 'core' });
        m.seconds = +((Date.now() - t0) / 1000).toFixed(1);
        const u = utilization(bare.cells);
        Object.assign(m, { luts: u.luts, muxf: u.muxes, ffs: u.flipFlops, srl: u.shiftRegisters });
        m.fsms = rec[0]?.fsms || [];
        if (bare.depth?.fsm) m.core = bare.depth.fsm;
        if (rec[0]?.notExtracted?.length) m.notExtracted = rec[0].notExtracted;
        if (rec[0]?.dropped?.length) m.dropped = rec[0].dropped;
        const sim = { cycles: 200, ...(d.corpus?.sim || {}) };
        if (d.corpus?.clock && !sim.clock) sim.clock = d.corpus.clock;
        // against the RTL as the tests compare (the resets held for the first cycles), and from power-up with no reset
        // first (resetCycles 0: the first cycles run from the init values, where a machine started in another state shows)
        const cmp = s => {
          try {
            const r = compareNetlist(d.design, bare, { name: d.name, seed: d.name, sim: s });
            return r.status === 'pass' ? 'pass' : `${r.status}${r.reason ? `: ${String(r.reason).slice(0, 80)}` : ''}`;
          } catch (e) { return `error: ${e.message.slice(0, 80)}`; }
        };
        m.diff = cmp(sim);
        m.diffPowerUp = cmp({ ...sim, resetCycles: 0 });
        const frec = [];
        const flowSyn = flowDesign === d.design ? bare : await synthesizeOpen(flowDesign, { run: fsmRun(yosysNode, way, frec), effort, fsm: way === 'core' });
        if (flowDesign !== d.design) m.flowFsms = (frec[0]?.fsms || []).length;
        let netlist = readYosysJson(flowSyn.files[`${flowSyn.top}.json`]);
        const dev = deviceOf(part);
        const periods = [];
        for (const seed of seeds) {
          let pr;
          try { pr = placeRouteBest(netlist, pack(netlist, { ucf, part, carryOut: 'xor' }), dev.device, dev.known, { seed, delays: dev.delays, pack: { ucf, part, carryOut: 'xor' } }); }
          catch (e) {
            // too few pads for the design's ports as the placer counts them: the I/O wrapper (as run.mjs does)
            if (!d.corpus || flowDesign !== d.design || !/not enough pads|no pad for/.test(e.message)) throw e;
            ({ flowDesign, ucf } = wrapped());
            const frec2 = [];
            const syn2 = await synthesizeOpen(flowDesign, { run: fsmRun(yosysNode, way, frec2), effort, fsm: way === 'core' });
            m.flowFsms = (frec2[0]?.fsms || []).length;
            netlist = readYosysJson(syn2.files[`${syn2.top}.json`]);
            pr = placeRouteBest(netlist, pack(netlist, { ucf, part, carryOut: 'xor' }), dev.device, dev.known, { seed, delays: dev.delays, pack: { ucf, part, carryOut: 'xor' } });
          }
          if (pr.routed.errors.length || pr.routed.failed.length || pr.routed.overused) throw new Error(`route: ${pr.routed.errors[0] || `${pr.routed.failed.length} nets unrouted, ${pr.routed.overused} nodes shared`}`);
          const routedText = writeXdl(pr.routed.design);
          if (routedDir && seed === seeds[0]) {
            const dir = path.join(routedDir, `${d.name}__${way}__s${seed}`.replace(/[^\w.-]/g, '_'));
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'routed.xdl'), routedText);
          }
          const q = lib.qualityOf(part, pr.packed.stats, analyzeTiming(parseXdl(routedText), dev.device).clocks);
          m.part = part;
          m.slices = q.slices;
          if (Number.isFinite(q.period)) periods.push(q.period);
        }
        m.periods = periods;
        m.period = periods.length ? +(periods.reduce((s, x) => s + x, 0) / periods.length).toFixed(3) : null;
      } catch (e) { m.error = e.message.replace(/\s+/g, ' ').slice(0, 140); }
      results[d.name][way] = m;
      console.log(JSON.stringify({ ...m, fsms: m.fsms?.length }));
      fs.writeFileSync(resultsFile, `${JSON.stringify(results, null, 1)}\n`);
    }
  }
  console.log(`\n${resultsTable(results, ways, iseNumbers())}`);
}

/** XST + map + par + trce of each design, where measured: the corpus's from test/designs-corpus/ise-comparison.json,
 *  the examples' and XST's state machines from fsm-ise.json (the ISE host's run). */
function iseNumbers() {
  const out = {};
  try {
    for (const d of JSON.parse(fs.readFileSync(path.join(ROOT, 'test/designs-corpus/ise-comparison.json'), 'utf8')).designs) if (d.ise) out[d.name] = { ...d.ise };
  } catch { /* none */ }
  try {
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(HERE, 'fsm-ise.json'), 'utf8')))) {
      out[k] = { ...out[k], ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== undefined)) };
      if (v.xstFsms) out[k].fsm = v.xstFsms.length ? v.xstFsms.map(f => `${f.states}: ${f.encoding ?? '?'}`).join(', ') : 'none';
    }
  } catch { /* none */ }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main(process.argv.slice(2));

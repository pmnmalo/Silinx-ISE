// The MCP server's tools of the HDL (server/mcp.js, #134): Check Syntax and the simulation, of the behavioural model or
// (#2674) of a simulation model of the flow (post-synthesis, post-translate, post-map, post-place & route, with its
// timing), as the interface simulates them (web/js/viewers.js runSimulation, netlistSources), the project's data
// files given to it, signals forced as SSim forces them; its waves written as a VCD file.
import fs from 'node:fs';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, clip, elaborateView, diagLine, diagJson, STR, PROJECT } from './mcp-util.js';
import { parseTime, parseValue } from '../core/ssim-values.js';
import { findSignalIn, injectForceIn } from '../core/ssim-forces.js';
import { deviceFamily, experimentalDevice, familyName, openOnlyDevice, vivadoDevice } from '../packages/silinx-fpga/src/parts.js';

export const SIM_MODELS = { postsynth: 'Post-Synthesis', posttrans: 'Post-Translate', postmap: 'Post-Map', postpar: 'Post-Place & Route' };
// the process that makes each model (run_process), and the stage it comes after
export const MODEL_PROCESS = { postsynth: 'post_synthesis_model', posttrans: 'post_translate_model', postmap: 'post_map_model', postpar: 'post_par_model' };
// the flows that make the models (#3707): the Spartan ones, ISE's and the Silinx toolchain's; none on the iCE40, ECP5,
// Gowin, the 7-series nor an experimental family, as the interface's tools (web/js/tool-descriptors.js simModelsOf, toolOf)
export const hasSimModels = device => !vivadoDevice(device) && !experimentalDevice(device) && !openOnlyDevice(device);
export const noSimModelMessage = (device, model) => `the ${familyName(deviceFamily(device))} flow makes no ${SIM_MODELS[model].toLowerCase()} simulation model (only the Spartan flows make them): simulate the behavioral model`;
const STAGE = { postsynth: 'synth', posttrans: 'translate', postmap: 'map', postpar: 'par' };

// the project's data files ($readmemh, textio: viewers.js readDataFiles), with the sources' texts
async function dataFiles(name, srcs) {
  const map = new Map(srcs.map(s => [s.path, s.text]));
  for (const f of (await P.fileTree(name)).filter(f => /\.(mem|hex|txt|dat|coe|bin)$/i.test(f) && !/^build\//.test(f))) {
    try { map.set(f, await P.readFile(name, f)); } catch { /* ignore */ }
  }
  return map;
}

// the netlist of a simulation model as the interface simulates it: its timing (the post-place & route SDF) built in,
// its nets single bits; { sources, notes, warnings } or a tool error when there is none
async function modelSources(name, pj, model, generate) {
  const { projectReports } = await import('./impl-routes.js');
  const modelOf = async () => { const r = await projectReports(name).catch(() => null); return r?.simModels?.[model] && r.top === pj.top ? r.simModels[model] : null; };
  let m = await modelOf();
  const notes = [], warnings = [];
  if (!m) {
    if (!generate) throw toolError(`There is no ${SIM_MODELS[model].toLowerCase()} simulation model of '${pj.top}' yet: run_process ${MODEL_PROCESS[model]} (or generate: true).`);
    const { runProcess } = await import('./mcp-processes.js');
    const r = await runProcess(name, MODEL_PROCESS[model]);
    if (!r.ok) throw toolError(`"${MODEL_PROCESS[model]}" failed: ${r.errors.slice(0, 3).join('; ') || 'see run_process'}`);
    notes.push(`${SIM_MODELS[model]} simulation model generated (${MODEL_PROCESS[model]}).`);
    m = await modelOf();
    if (!m) throw toolError(`"${MODEL_PROCESS[model]}" made no ${SIM_MODELS[model].toLowerCase()} model`);
  }
  // older than the sources: said, as the interface says it of a stale model
  const t = m.mtime ? Date.parse(m.mtime) : null;
  const newest = Math.max(0, ...(pj.files || []).map(f => { try { return fs.statSync(path.join(P.projectDir(name), f.path)).mtimeMs; } catch { return 0; } }));
  if (t && newest > t) warnings.push(`WARNING: the ${SIM_MODELS[model].toLowerCase()} model is older than the sources (run "${MODEL_PROCESS[model]}" again to update it).`);
  let raw = await P.readFile(name, m.path);
  if (m.sdf) {
    try {
      const { parseSdf, annotateSdf } = await import('../core/sdf.js');
      const a = annotateSdf(raw, 'vhdl', parseSdf(await P.readFile(name, m.sdf)));
      raw = a.text;
      notes.push(`Timing: ${m.sdf} (${a.annotated} instances with their delays).`);
    } catch (e) { warnings.push(`WARNING: the model is simulated without its timing (${m.sdf}: ${e.message}).`); }
  }
  const { scalarizeNetlist } = await import('../core/netlist-hier.js');
  const { primitiveSources } = await import('../core/unisim.js');
  const net = { path: m.path, lang: 'vhdl', text: scalarizeNetlist(raw), role: 'design', netlist: model };
  return { sources: [...primitiveSources([net]), net], notes, warnings, file: m.path };
}

// the forces of a simulation as SSim's Force Constant / Force Clock add them (web/js/isim-dialogs.js, isim-forces.js
// addForce, through core/ssim-forces.js): their messages ('Force: …'); errors as tool errors
function applyForces(sim, design, list) {
  if (!Array.isArray(list)) throw toolError('forces: a list of { signal, value } or { signal, clock, period… }');
  const out = [], all = [];
  for (const [k, f] of list.entries()) {
    const what = `forces[${k}]`;
    const sig = findSignalIn(design, String(f?.signal ?? ''));
    if (!sig) throw toolError(`${what}: signal '${f?.signal ?? ''}' not found`);
    if (!sig.wave) throw toolError(`${what}: arrays/memories cannot be forced`);
    const time = (v, d) => { if (v === undefined || v === null || v === '') return d; const ps = typeof v === 'number' ? Math.round(v * 1000) : parseTime(String(v), 'ns'); if (Number.isNaN(ps)) throw toolError(`${what}: invalid time '${v}'`); return ps; };
    const radix = f.radix || 'default';
    const val = (text, d) => { try { return parseValue(String(text ?? d), sig.t, radix); } catch (e) { throw toolError(`${what}: ${e.message}`); } };
    const start = time(f.start, 0), cancel = time(f.cancel, null);
    let force;
    if (f.clock) {
      if (f.value !== undefined) throw toolError(`${what}: a clock has lead and trail, not value`);
      const period = time(f.period, 10000), duty = f.duty ?? 50;
      if (!(period >= 2)) throw toolError(`${what}: period must be at least 2 ps`);
      if (!(duty > 0 && duty < 100)) throw toolError(`${what}: duty cycle must be between 0 and 100`);
      const hi = Math.max(1, Math.min(period - 1, Math.round(period * duty / 100)));
      force = { pattern: [{ off: 0, val: val(f.lead, '0') }, { off: hi, val: val(f.trail, '1') }], repeat: period,
        desc: `clock ${f.lead ?? '0'}/${f.trail ?? '1'} period ${period / 1000} ns duty ${duty}%` };
    } else {
      if (f.value === undefined) throw toolError(`${what}: value, or clock`);
      force = { pattern: [{ off: 0, val: val(f.value) }], repeat: 0, desc: `${f.value}` };
    }
    // (a new force of the signal cuts the earlier ones from its start, as addForce's truncateForces)
    for (const g of all.filter(g => g.sig === sig)) {
      if (g.start >= start) { g.rt.done = true; g.cut = true; continue; }
      if (g.end == null || g.end > start) { g.end = start; g.endRelease = false; g.rt.done = true; injectForceIn(sim, design, g); }
    }
    const one = { sig, ...force, start, end: cancel, endRelease: true };
    injectForceIn(sim, design, one);
    all.push(one);
    out.push(`Force: ${sig.path} = ${force.desc} from ${start / 1000} ns${cancel != null ? ` until ${cancel / 1000} ns` : ''}`);
  }
  return out;
}

// simulate's bounds (#3408): the run stops at a wall-clock limit (timeout_s) and at a number of time steps (as the C
// simulation's, server/mcp-hls.js), a cancelled request stops it too; the waves recorded and the delta cycles are the
// interface's (core/simulator.js: maxWaveEvents, maxDeltas); the changes returned are bounded
export const SIM_LIMITS = Object.freeze({ timeoutS: 60, maxTimeoutS: 600, steps: 20_000_000, maxChanges: 1000, changes: 100_000 });
const SIM_CHUNK = 20_000;   // time steps between two looks at the clock and at a cancellation
const nth = n => n.toLocaleString('en-US');

/** The simulation run to `until` (ps) in chunks: its status, and the limit that stopped it (null: none; steps: the
 *  time steps' limit, SIM_LIMITS.steps). */
export async function runBounded(sim, until, { timeoutS, signal, steps: maxSteps = SIM_LIMITS.steps }) {
  const deadline = Date.now() + timeoutS * 1000;
  // (the clock looked at inside a process's run too, #3525: one that does not wait stops at the deadline)
  sim.deadline = deadline;
  let steps = 0, lastYield = Date.now(), st;
  for (;;) {
    const n = Math.min(SIM_CHUNK, maxSteps - steps);
    st = sim.run(until, { maxSteps: n });
    if (sim.timedOut) return { st, limit: 'time' };
    if (st.finished || st.now >= until) return { st, limit: null };
    steps += n;
    if (steps >= maxSteps) return { st, limit: 'steps' };
    if (Date.now() >= deadline) return { st, limit: 'time' };
    // (the server reads a cancellation between two chunks)
    if (Date.now() - lastYield > 50) { await new Promise(r => setImmediate(r)); lastYield = Date.now(); }
    if (signal?.aborted) throw toolError('cancelled');
  }
}

// what a failed check_syntax or simulate holds (#3681): the compiler's lines, which quote the design's names and files
const FAILED = 'the compiler\'s messages, which quote the design\'s names and files';

export const HDL_TOOLS = [
  {
    name: 'check_syntax', title: 'Check Syntax',
    description: 'Parse and elaborate the design (or, with simulation, the test bench) as the application\'s Check Syntax does: the errors and warnings with their file and line, the design checks (latches, sensitivity lists, unused signals…) included; with lint false, as with Edit ▸ Design Checks (Lint Warnings) off, their lint warnings left out (their errors kept).',
    inputSchema: { type: 'object', properties: { project: PROJECT, top: STR('The module to elaborate (default: the project\'s top, or its test bench with simulation).'), simulation: { type: 'boolean', description: 'Check the simulation view (the test bench and the design).' },
      lint: { type: 'boolean', description: 'The design checks\' lint warnings, as Edit ▸ Design Checks (Lint Warnings) (default true, the interface\'s default).' } }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, top, simulation = false, lint = true }) {
      const { design, top: mod, diags } = await elaborateView(name, { top, sim: simulation, lint });
      const errors = diags.filter(d => d.severity === 'error'), warnings = diags.filter(d => d.severity !== 'error');
      const ok = !errors.length && !!design?.top;
      const lines = [...diags.map(diagLine),
        ok ? `Process "Check Syntax" of <${mod}> completed successfully${warnings.length ? ` with ${warnings.length} warning(s)` : ''} (${design.signals.length} signals, ${design.procs.length} processes).`
          : `Process "Check Syntax" of <${mod}> failed (${errors.length} error(s), ${warnings.length} warning(s)).`];
      // (a failure's lines quote the design's names and files: the project's own text, #3681)
      return { untrusted: ok ? undefined : FAILED, text: lines.join('\n'), data: { project: name, top: mod, ok, errors: errors.map(diagJson), warnings: warnings.map(diagJson) }, isError: false };
    },
  },
  {
    name: 'simulate', title: 'Simulate Behavioral Model',
    description: 'Run the simulation of the project\'s test bench (or another top) for a time, behavioural or against a simulation model of the flow (post-synthesis, post-translate, post-map, post-place & route with its timing): its messages (report / $display, assertions), where it stopped, and the values of signals (the test bench\'s by default; hierarchical names as tb/uut/count) with their changes.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, top: STR('The simulation top (default: the project\'s test bench).'),
      time_ns: { type: 'number', description: 'How long to simulate, in ns (default 1000; at most 1e9).' },
      signals: { type: 'array', items: { type: 'string' }, description: 'The signals to return (names of the top, or paths through instances: uut/count).' },
      max_changes: { type: 'integer', description: `The changes of each signal returned at most (default 20, the last ones; from 1 to ${SIM_LIMITS.maxChanges}, and ${nth(SIM_LIMITS.changes)} in all).` },
      timeout_s: { type: 'integer', description: `The simulation's time limit, in seconds of the clock on the wall (default ${SIM_LIMITS.timeoutS}; at most ${SIM_LIMITS.maxTimeoutS}). It also stops after ${nth(SIM_LIMITS.steps)} time steps.` },
      model: { type: 'string', enum: ['behavioral', ...Object.keys(SIM_MODELS)], description: 'What the test bench runs against: behavioral (the sources, default), or a simulation model of the flow of the project\'s top: postsynth, posttrans, postmap, postpar (with its timing).' },
      generate: { type: 'boolean', description: 'A model not made yet: make it first (its run_process), as "Generate and Simulate" does.' },
      vcd: STR('Write the waves as a VCD file into the exchange folder (its name, e.g. tb.vcd; a new file).'),
      forces: { type: 'array', items: { type: 'object', properties: {
        signal: STR('The signal\'s path (clk, uut/count, /tb/uut/count).'), value: { type: ['string', 'integer'], description: 'Force to this value (a constant).' },
        clock: { type: 'boolean', description: 'A clock: lead, then trail, every period.' }, lead: { type: ['string', 'integer'], description: 'A clock\'s leading edge value (default 0).' }, trail: { type: ['string', 'integer'], description: 'A clock\'s trailing edge value (default 1).' },
        period: { type: ['string', 'number'], description: 'A clock\'s period (default 10 ns; a number: ns).' }, duty: { type: 'number', description: 'A clock\'s duty cycle, % (default 50).' },
        start: { type: ['string', 'number'], description: 'When the force starts (default 0; a time: 20 ns, 1.5 us; a number: ns).' }, cancel: { type: ['string', 'number'], description: 'When it is released (default never; a time, or a number: ns).' },
        radix: { type: 'string', enum: ['bin', 'hex', 'dec', 'oct', 'ascii'], description: 'The values\' radix (default: binary, a VHDL / Verilog literal or 0x… read as such).' },
      }, required: ['signal'] }, description: 'Forces, as SSim\'s Force Constant and Force Clock (ssim force add): over what drives the signal, from start until cancel. A later force of a signal cuts its earlier one.' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, top, time_ns: timeNs = 1000, signals, max_changes: maxChanges = 20, timeout_s: timeoutS = SIM_LIMITS.timeoutS, model = 'behavioral', generate = false, vcd, forces }, { signal } = {}) {
      if (!(timeNs > 0) || timeNs > 1e9) throw toolError('time_ns: from 0 to 1e9 ns');
      if (!Number.isInteger(maxChanges) || maxChanges < 1 || maxChanges > SIM_LIMITS.maxChanges) throw toolError(`max_changes: from 1 to ${SIM_LIMITS.maxChanges}`);
      if (!Number.isInteger(timeoutS) || timeoutS < 1 || timeoutS > SIM_LIMITS.maxTimeoutS) throw toolError(`timeout_s: from 1 to ${SIM_LIMITS.maxTimeoutS} s`);
      if (model !== 'behavioral' && !SIM_MODELS[model]) throw toolError(`model: behavioral or one of ${Object.keys(SIM_MODELS).join(', ')}`);
      // the behavioural Check Syntax first, as the interface's simulation does
      const view = await elaborateView(name, { top, sim: true });
      const { srcs, top: mod, diags } = view;
      let { design } = view;
      const errors = diags.filter(d => d.severity === 'error');
      if (errors.length || !design?.top) return { untrusted: FAILED, text: [...errors.map(diagLine), `The simulation of <${mod}> did not start: ${errors.length} error(s) (check_syntax with simulation).`].join('\n'), data: { project: name, top: mod, started: false, errors: errors.map(diagJson) }, isError: true };
      // a model of the flow: the test bench against its netlist, compiled after the sources (its entity replaces the RTL one)
      const head = [];
      let simSrcs = srcs;
      if (model !== 'behavioral') {
        const pj = await P.readProject(name);
        if (!pj.top) throw toolError(`the project '${name}' has no top module: its models are of the top`);
        if (!hasSimModels(pj.device)) throw toolError(noSimModelMessage(pj.device, model));
        const net = await modelSources(name, pj, model, generate);
        head.push(...net.notes, ...net.warnings);
        const { compile, elaborate } = await import('../core/compile.js');
        const { primitiveSources } = await import('../core/unisim.js');
        simSrcs = [...srcs, ...net.sources];
        const lib = compile([...primitiveSources(srcs), ...simSrcs]);
        lib.errors = lib.errors.filter(e => !/redefined/.test(e.message));
        design = elaborate(lib, mod);
        const errs = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
        if (errs.length || !design.top) return { untrusted: FAILED, text: [...head, ...errs.map(diagLine), `The simulation of <${mod}> with the ${SIM_MODELS[model].toLowerCase()} model did not start: ${errs.length} error(s).`].join('\n'), data: { project: name, top: mod, model, started: false, errors: errs.map(diagJson) }, isError: true };
      }
      const { Simulator, toVCD } = await import('../core/simulator.js');
      const V = await import('../core/values.js');
      const log = [];
      // the signals by name: the top's, then through its instances (uut/count)
      const byPath = new Map();
      const walk = (inst, prefix) => {
        for (const p of inst.ports || []) if (!byPath.has(prefix + p.name)) byPath.set(prefix + p.name, p.sig);
        for (const s of inst.signals || []) if (!byPath.has(prefix + s.name)) byPath.set(prefix + s.name, s);
        for (const c of inst.children || []) walk(c, `${prefix}${c.name}/`);
      };
      walk(design.top, '');
      const wanted = signals?.length ? signals : [...byPath.keys()].filter(k => !k.includes('/'));
      const unknown = wanted.filter(n => !byPath.has(n) && !byPath.has(String(n).toLowerCase()));
      if (unknown.length) throw toolError(`no signal ${unknown.map(n => `'${n}'`).join(', ')} in <${mod}> (names of the top, or paths as uut/count)`);
      if (wanted.length * maxChanges > SIM_LIMITS.changes)
        throw toolError(`signals × max_changes: at most ${nth(SIM_LIMITS.changes)} changes returned (${wanted.length} signals × ${maxChanges}): fewer signals, or a smaller max_changes`);
      // the waves kept: the changes returned, the wanted signals' last max_changes, the others' present only (#3503:
      // a long run in bounded memory, no recording's limit); with a VCD, every change (the recording's limit then)
      const shown = new Set(wanted.map(n => byPath.get(n) ?? byPath.get(String(n).toLowerCase())));
      const waveTail = vcd ? null : sig => (shown.has(sig) ? maxChanges : 1);
      const sim = new Simulator(design, { files: await dataFiles(name, simSrcs), waveTail, onLog: e => { if (log.length < 500) log.push({ timeNs: e.time / 1000, kind: e.kind, text: e.text }); } });
      if (forces) for (const line of applyForces(sim, design, forces)) head.push(line);
      const { st, limit } = await runBounded(sim, timeNs * 1000, { timeoutS, signal });
      const fmt = (s, v) => (s.t?.w === 1 ? V.toBin(v) : `${V.toBin(v).length <= 16 ? `"${V.toBin(v)}"` : `x"${V.format(v, 'hex')}"`}`);
      const sigs = {};
      for (const n of wanted) {
        const s = byPath.get(n) ?? byPath.get(String(n).toLowerCase());
        const w = s.wave;
        const changes = w ? w.t.map((t, i) => [t / 1000, fmt(s, w.v[i])]) : [];
        sigs[n] = { width: s.t?.w ?? null, final: changes.length ? changes.at(-1)[1] : null, changes: changes.slice(-Math.max(1, maxChanges)), totalChanges: (w?.dropped || 0) + changes.length };
      }
      const failed = st.finished === 'error' || log.some(l => l.kind === 'error' || l.kind === 'failure');
      const stopped = `Simulation of <${mod}> stopped at ${st.now / 1000} ns${st.finished ? ` (${st.finished})` : ''}.`;
      const limitLine = limit === 'time' ? `WARNING: the simulation stopped at its time limit (${timeoutS} s), before ${timeNs} ns: a shorter time_ns, or a longer timeout_s (at most ${SIM_LIMITS.maxTimeoutS}).`
        : limit === 'steps' ? `WARNING: the simulation stopped at its limit of ${nth(SIM_LIMITS.steps)} time steps, before ${timeNs} ns: a shorter time_ns.` : null;
      // its waves as a VCD file, into the exchange folder (Export VCD: the user picks the file)
      let vcdPath = null;
      if (vcd) {
        const { exchangePath } = await import('./mcp-transfer.js');
        vcdPath = await exchangePath(vcd, 'vcd');
        if (!/\.vcd$/i.test(vcdPath)) throw toolError(`vcd: '${vcd}' is not a .vcd`);
        if (!fs.existsSync(path.dirname(vcdPath))) throw toolError(`no folder '${path.dirname(vcdPath)}'`);
        try { fs.writeFileSync(vcdPath, toVCD(design, sim), { flag: 'wx' }); } catch (e) { throw toolError(e.code === 'EEXIST' ? `'${vcdPath}' exists: a VCD does not replace a file (give another name)` : e.message); }
      }
      const text = [...head, ...diags.filter(d => d.severity !== 'error').map(diagLine), ...log.map(l => `[${l.timeNs.toFixed(3)} ns] ${l.kind === 'print' ? '' : `${l.kind.toUpperCase()}: `}${l.text}`), stopped, ...(limitLine ? [limitLine] : []),
        ...Object.entries(sigs).map(([n, s]) => `${n} = ${s.final ?? '(no value)'}${s.totalChanges > 1 ? ` (${s.totalChanges} changes)` : ''}`), ...(vcdPath ? [`Waves written: ${vcdPath}.`] : [])].join('\n');
      // (the lines the design prints, report / $display: the project's own text, #3528)
      return { untrusted: log.length ? 'the design\'s messages (report, $display, assertions)' : undefined, text: clip(text), data: { project: name, top: mod, model, started: true, stoppedAtNs: st.now / 1000, finished: st.finished || null, limit: limit ? { kind: limit, ...(limit === 'time' ? { seconds: timeoutS } : { steps: SIM_LIMITS.steps }) } : null, failed, log, signals: sigs, warnings: diags.filter(d => d.severity !== 'error').map(diagJson), notes: head, ...(vcdPath ? { vcd: vcdPath } : {}) }, isError: false };
    },
  },
];

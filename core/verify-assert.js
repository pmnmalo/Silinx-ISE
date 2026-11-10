// Silinx - formal verification of a module's own assertions (#3177): VHDL's assert (of severity warning, error or
// failure: a note is a message) and Verilog's, immediate (assert / assume (…)) and concurrent (assert / assume property
// (@(posedge clk) …), core/verilog/parser-assert.js), proved by Yosys's SAT solver as core/verify.js proves an
// equivalence: Silinx's front end writes the module as the open synthesis's flat SystemVerilog with its assertions
// (core/synth-verilog.js toVerilog's formal), Yosys reads it with -formal and `sat -tempinduct` checks every assertion
// cycle by cycle from the initial state (the assumptions taken as true), trying at each depth a proof by induction. A
// failure is a counterexample: the inputs of each clock cycle, which core/verify-bench.js makes a test bench of (the
// module alone); the simulator replays it at once, and its first failing assertion is the one reported, at its clock
// cycle, with its own message.
//
//   const r = await verifyAssertions(sources, { top, depth, run, onLine })
//   r: { status: 'proved' | 'bounded' | 'failed' | 'error', errors, warnings, depth, induction, cycles (the
//        counterexample: [{ in, uut }]), cycle, steps (Yosys's length of it), failure: { file, line, text } (the assertion that fails, as the
//        simulator reports it), asserts, assumes (their numbers), ports, clocks, top, lang, log }
import { compile, simulate } from './compile.js';
import { primitiveSources } from './unisim.js';
import { toVerilog } from './synth-verilog.js';
import { VERIFY_DEPTH, MAX_DEPTH, assertScript, readVerifyLog, moduleOf } from './verify.js';
import { counterexampleBench, benchName, PERIOD } from './verify-bench.js';

export const ASSERT_PROCESS = 'Verify Assertions';
const UUT = 'silinx_uut';

/** The assertions and assumptions the formal verification checks in an elaborated design: { asserts, assumes }. */
export function countAssertions(design) {
  const seen = new Set();
  const n = { asserts: 0, assumes: 0 };
  const walk = x => {
    if (!x || typeof x !== 'object' || seen.has(x)) return;
    seen.add(x);
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x.k === 'assert' && x.sev !== 'note') n[x.form === 'assume' ? 'assumes' : 'asserts']++;
    for (const [k, v] of Object.entries(x)) if (k !== 't' && k !== 'sig' && k !== 'fn' && k !== 'c' && k !== 'msg') walk(v);
  };
  for (const p of design.procs || []) if (p.mode !== 'initial' && p.mode !== 'loop') walk(p.body);
  return n;
}

/**
 * Prove the assertions of module `top` of the sources ([{ path, text, lang }]): proved (by induction), bounded (none
 * fails in the first `depth` clock cycles) or failed (the counterexample, replayed). run(args, files, onLine): Yosys's.
 */
export async function verifyAssertions(sources, { top, depth = VERIFY_DEPTH, run, onLine = () => {} } = {}) {
  const error = (...errors) => ({ status: 'error', errors, warnings: [], depth });
  if (!top) return error('no module to verify');
  if (!(Number.isInteger(depth) && depth >= 1 && depth <= MAX_DEPTH)) return error(`the depth must be a number of clock cycles from 1 to ${MAX_DEPTH}`);
  const lib = compile([...primitiveSources(sources), ...sources]);
  const libErrs = lib.errors.filter(e => e.severity === 'error');
  if (libErrs.length) return error(...libErrs.slice(0, 5).map(e => `${e.file}:${e.line} ${e.message}`));
  const uut = moduleOf(lib, top, 'the module');
  if (uut.error) return error(uut.error);
  const { asserts, assumes } = countAssertions(uut.design);
  if (!asserts) return error(`'${uut.unit.name}' has no assertion to prove (VHDL: assert … severity warning, error or failure; Verilog: assert (…) or assert property (@(posedge clk) …))`);
  const bad = uut.ports.filter(p => p.dir === 'inout' || p.kind === 'other');
  if (bad.length) return error(`port ${bad[0].name} of '${uut.unit.name}' is ${bad[0].dir === 'inout' ? 'bidirectional' : 'of a type Verify cannot drive (bits, vectors and integers only)'}`);
  const warnings = [];
  let text;
  try {
    const v = toVerilog(uut.design, { name: UUT, formal: true });
    text = v.text;
    warnings.push(...v.warnings.map(w => `${uut.unit.name}: ${w.message ?? w}`));
  } catch (e) { return error(`'${uut.unit.name}' cannot be verified: ${e.message}`); }
  const lines = [];
  try { await run(['-p', assertScript(depth)], { [`${UUT}.sv`]: text }, l => { lines.push(l); onLine(l); }); }
  catch (e) { return { ...error(e.message), log: lines }; }
  const ports = uut.ports.map(p => ({ name: p.name, dir: p.dir, width: p.width, uut: p }));
  const inputs = ports.filter(p => p.dir === 'in').map(p => p.name);
  const r = readVerifyLog(lines, [], { inputs });
  if (r.status === 'error') return { ...error('Yosys gave no result (its log has neither a proof nor a counterexample)'), log: lines };
  // (steps: the counterexample's length as Yosys gives it)
  const out = { ...r, steps: r.cycle, errors: [], warnings: [...warnings, ...r.warnings], depth, top: uut.unit.name, reference: null,
    lang: uut.unit.lang, ports, clocks: uut.clocks, asserts, assumes, log: lines };
  if (r.status !== 'failed') return out;
  // the counterexample replayed: the first assertion the simulator reports, its clock cycle (a clocked assertion fails
  // at the rising edge of the cycle whose values it reads, which Yosys reports a cycle later)
  const failure = replayFailure(sources, out);
  if (!failure) {
    out.warnings.push(`the simulator does not reproduce the counterexample (${out.cycle} clock cycle(s)): a signal with no initial value may start at 'U' in the simulation and at 0 in the proof`);
    return out;
  }
  out.cycle = Math.min(out.cycle, Math.floor(failure.time / 1000 / PERIOD) + 1);
  out.cycles = out.cycles.slice(0, out.cycle);
  out.failure = { file: failure.file, line: failure.line, text: failure.text };
  return out;
}

// the counterexample's test bench simulated: the first assertion of the module's files that it reports
function replayFailure(sources, r) {
  const lang = r.lang === 'verilog' ? 'verilog' : 'vhdl';
  const tb = { path: `sim/${benchName(r.top)}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, role: 'simulation', text: counterexampleBench(r, { lang }) };
  const srcs = [...primitiveSources(sources), ...sources.filter(s => s.path !== tb.path), tb];
  let s;
  try { s = simulate(srcs, benchName(r.top), { until: (r.cycles.length + 1) * PERIOD * 1000 }); } catch { return null; }
  if (!s.sim) return null;
  return s.sim.log.find(l => ['warning', 'error', 'failure'].includes(l.kind) && l.file && l.file !== tb.path && !/^VERIFY/.test(l.text)) || null;
}

/** The console's messages of a proof of assertions (the interface's and the MCP tool's alike), as verifyMessages'. */
export function assertMessages(r, { top = r.top, bench = null } = {}) {
  const M = [{ text: `\nStarted : "${ASSERT_PROCESS}".\n`, kind: 'hdr' }];
  const end = (ok, warn) => M.push(ok ? { text: `\nProcess "${ASSERT_PROCESS}" completed successfully${warn ? ` with ${warn} warning(s)` : ''}`, kind: 'ok' }
    : { text: `\nProcess "${ASSERT_PROCESS}" failed`, kind: 'err' });
  if (r.status === 'error') {
    for (const e of r.errors) M.push({ text: `ERROR:Verify - ${e}`, kind: 'err' });
    end(false);
    return M;
  }
  const assumed = r.assumes ? ` (${r.assumes} assumption(s) taken as true)` : '';
  M.push({ text: `Proving the ${r.asserts} assertion(s) of '${top}'${assumed}: Yosys's SAT solver, at most ${r.depth} clock cycle(s), then a proof by induction.`, kind: 'info' });
  const warns = r.warnings.map(w => ({ text: `WARNING:Verify - ${w}`, kind: 'warn' }));
  M.push(...warns);
  if (r.status === 'proved') {
    M.push({ text: `Proved: the assertions of '${top}' hold for every input sequence (by induction over ${r.induction} clock cycle(s)).`, kind: 'ok' });
    end(true, warns.length);
  } else if (r.status === 'bounded') {
    M.push({ text: `WARNING:Verify - no assertion fails in the first ${r.depth} clock cycle(s), but they are not proved beyond them (the induction did not succeed): a larger depth checks more cycles.`, kind: 'warn' });
    end(true, warns.length + 1);
  } else {
    const f = r.failure;
    M.push({ text: `ERROR:Verify - an assertion of '${top}' fails at clock cycle ${r.cycle}${f ? `: ${f.file}:${f.line}: ${f.text.replace(/\.$/, '')}` : ''}.`, kind: 'err' });
    if (bench) M.push({ text: `The counterexample's test bench: ${bench} (it replays the ${r.cycle} clock cycle(s) in the simulator).`, kind: 'info' });
    end(false);
  }
  return M;
}
